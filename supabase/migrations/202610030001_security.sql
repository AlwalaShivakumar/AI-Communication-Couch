-- DRAFT: fresh DEVELOPMENT installation only; do not apply without approval.
-- DEVELOPMENT may explicitly accept having no backup through the guarded runner.
-- Production acknowledgement still requires verified backup/recovery; no exemption.
BEGIN;
DO $$ DECLARE
 environment text:=COALESCE(NULLIF(current_setting('app.migration_environment',true),''),'production');
 acknowledgement text:=current_setting('app.reviewed_backup',true);
BEGIN
 IF environment='development' THEN
  IF current_setting('app.migration_project_ref',true) IS DISTINCT FROM 'dekorxyetwpgpyjeypfq' THEN
    RAISE EXCEPTION 'Development project acknowledgement does not match the approved project';
  END IF;
  IF acknowledgement IS DISTINCT FROM 'yes' AND acknowledgement IS DISTINCT FROM 'development-no-backup' THEN
    RAISE EXCEPTION 'Backup review or explicit development-no-backup acknowledgement required';
  END IF;
 ELSIF environment='production' THEN
  IF acknowledgement IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Backup and schema review must be explicitly acknowledged';
  END IF;
 ELSE
  RAISE EXCEPTION 'Unknown migration environment';
 END IF;
END $$;
DO $$ BEGIN
 IF to_regnamespace('private') IS NOT NULL
 OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))
 OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))
 OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
   AND t.typelem=0 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')) THEN
   RAISE EXCEPTION 'Fresh-install conflict: existing application objects require a separate reviewed migration';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND NOT rolsuper AND NOT rolbypassrls)
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolsuper AND NOT rolbypassrls) THEN
   RAISE EXCEPTION 'Expected non-bypass Supabase roles are required';
 END IF;
END $$;
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY,
 preferred_name text NOT NULL DEFAULT '', target_role text NOT NULL DEFAULT '',
 career_goal text NOT NULL DEFAULT '', experience_level text NOT NULL DEFAULT '',
 last_insights_cache jsonb, last_insights_timestamp timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 mode text NOT NULL, duration_ms bigint NOT NULL DEFAULT 0, speaking_time_ms bigint NOT NULL DEFAULT 0,
 overall_score integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.session_feedbacks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL,
 transcript text NOT NULL, score integer NOT NULL, biggest_weakness text NOT NULL, fix text NOT NULL,
 is_retry boolean NOT NULL DEFAULT false, retry_improvement integer, raw_feedback jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.session_dimensions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL,
 dimension text NOT NULL, score integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL)
 OR EXISTS (SELECT 1 FROM public.sessions s LEFT JOIN auth.users u ON u.id=s.user_id WHERE u.id IS NULL) THEN
   RAISE EXCEPTION 'Legacy/orphan owners require a reviewed migration; no rows were deleted or reassigned';
 END IF;
END $$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_owner FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_auth_owner FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.session_feedbacks ADD CONSTRAINT feedback_parent FOREIGN KEY(session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE public.session_dimensions ADD CONSTRAINT dimension_parent FOREIGN KEY(session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.session_feedbacks ALTER COLUMN session_id SET NOT NULL;
ALTER TABLE public.session_dimensions ALTER COLUMN session_id SET NOT NULL;
ALTER TABLE public.sessions ADD CONSTRAINT session_mode CHECK (mode IN ('conversation','story','public_speaking','wit','explanation','qna','interview'));
ALTER TABLE public.sessions ADD CONSTRAINT session_duration CHECK (duration_ms BETWEEN 0 AND 14400000 AND speaking_time_ms BETWEEN 0 AND duration_ms);
ALTER TABLE public.sessions ADD CONSTRAINT session_score CHECK (overall_score BETWEEN 0 AND 100);
ALTER TABLE public.profiles ADD CONSTRAINT profile_input CHECK (length(preferred_name)<=100 AND length(target_role)<=200 AND length(career_goal)<=2000 AND experience_level IN ('','Entry Level','Mid Level','Senior','Staff/Principal','Executive'));
ALTER TABLE public.session_feedbacks ADD CONSTRAINT feedback_input CHECK (length(transcript) BETWEEN 10 AND 12000 AND score BETWEEN 0 AND 100 AND length(biggest_weakness)<=1000 AND length(fix)<=2000 AND (retry_improvement IS NULL OR retry_improvement BETWEEN -100 AND 100));
ALTER TABLE public.session_feedbacks ADD CONSTRAINT feedback_raw_input CHECK (
 raw_feedback IS NULL OR raw_feedback='null'::jsonb OR
 (jsonb_typeof(raw_feedback)='string' AND length(raw_feedback #>> '{}')<=24000)
);
ALTER TABLE public.session_dimensions ADD CONSTRAINT dimension_input CHECK (score BETWEEN 0 AND 100 AND dimension IN ('Grammar','Natural English','Fluency','Confidence','Storytelling','Logical Thinking','Filler Words','Public Speaking'));
CREATE UNIQUE INDEX session_dimension_unique ON public.session_dimensions(session_id,dimension);
CREATE INDEX sessions_owner_created ON public.sessions(user_id,created_at);
CREATE INDEX feedback_session ON public.session_feedbacks(session_id);
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['profiles','sessions','session_feedbacks','session_dimensions']) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
 END LOOP;
END $$;
CREATE POLICY profile_owner ON public.profiles TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY session_owner ON public.sessions TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY feedback_owner ON public.session_feedbacks TO authenticated
 USING(EXISTS(SELECT 1 FROM public.sessions s WHERE s.id=session_id AND s.user_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));
CREATE POLICY dimension_owner ON public.session_dimensions TO authenticated
 USING(EXISTS(SELECT 1 FROM public.sessions s WHERE s.id=session_id AND s.user_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));

CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE private.ai_quota (scope text NOT NULL, bucket timestamptz NOT NULL, used integer NOT NULL CHECK(used>=0), PRIMARY KEY(scope,bucket));
REVOKE ALL ON TABLE private.ai_quota FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.consume_ai_quota(p_cost integer DEFAULT 1) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); day_bucket timestamptz:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; minute_bucket timestamptz:=date_trunc('minute',now()); BEGIN
 IF actor IS NULL OR p_cost IS NULL OR p_cost NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Invalid quota request'; END IF;
 PERFORM pg_advisory_xact_lock(928171);
 INSERT INTO private.ai_quota VALUES ('day:'||actor,day_bucket,0),('minute:'||actor,minute_bucket,0),('global',day_bucket,0) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM private.ai_quota WHERE
 (scope='day:'||actor AND bucket=day_bucket AND used+p_cost>120) OR
 (scope='minute:'||actor AND bucket=minute_bucket AND used+p_cost>12) OR
 (scope='global' AND bucket=day_bucket AND used+p_cost>1000)) THEN RETURN false; END IF;
 UPDATE private.ai_quota SET used=used+p_cost WHERE (scope='day:'||actor AND bucket=day_bucket) OR (scope='minute:'||actor AND bucket=minute_bucket) OR (scope='global' AND bucket=day_bucket);
 DELETE FROM private.ai_quota WHERE bucket < now()-interval '2 days';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(integer) TO authenticated;

CREATE FUNCTION public.save_practice_session(p_session jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); sid uuid; item jsonb; dimension_item jsonb;
 existing_owner uuid; duration_value numeric; speaking_value numeric; field_name text; number_value numeric;
 allowed_dimensions text[]:=ARRAY['Grammar','Natural English','Fluency','Confidence','Storytelling','Logical Thinking','Filler Words','Public Speaking'];
BEGIN
 IF actor IS NULL OR jsonb_typeof(p_session) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid session: authenticated identity and JSON object required' USING ERRCODE='22023';
 END IF;
 IF NOT (p_session ?& ARRAY['id','mode','duration_ms','speaking_time_ms','feedbacks'])
 OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_session) k WHERE k NOT IN ('id','mode','duration_ms','speaking_time_ms','feedbacks')) THEN
   RAISE EXCEPTION 'Invalid session fields' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_session->'id') IS DISTINCT FROM 'string'
 OR (p_session->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
   RAISE EXCEPTION 'Invalid session UUID' USING ERRCODE='22023';
 END IF;
 sid:=(p_session->>'id')::uuid;
 IF jsonb_typeof(p_session->'mode') IS DISTINCT FROM 'string'
 OR (p_session->>'mode') NOT IN ('conversation','story','public_speaking','wit','explanation','qna','interview') THEN
   RAISE EXCEPTION 'Invalid session mode' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_session->'duration_ms') IS DISTINCT FROM 'number'
 OR jsonb_typeof(p_session->'speaking_time_ms') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'Invalid session timing types' USING ERRCODE='22023';
 END IF;
 duration_value:=(p_session->>'duration_ms')::numeric;
 speaking_value:=(p_session->>'speaking_time_ms')::numeric;
 IF duration_value<>trunc(duration_value) OR duration_value NOT BETWEEN 0 AND 14400000
 OR speaking_value<>trunc(speaking_value) OR speaking_value NOT BETWEEN 0 AND duration_value THEN
   RAISE EXCEPTION 'Invalid session timing bounds' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_session->'feedbacks') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Invalid feedback array' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_session->'feedbacks')>50 THEN
   RAISE EXCEPTION 'Too many feedback entries' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_session->'feedbacks') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
     RAISE EXCEPTION 'Invalid feedback object' USING ERRCODE='22023';
   END IF;
   IF NOT (item ?& ARRAY['transcript','score','biggest_weakness','fix','is_retry','retry_improvement','raw_feedback'])
   OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('transcript','score','biggest_weakness','fix','is_retry','retry_improvement','raw_feedback','dimensions')) THEN
     RAISE EXCEPTION 'Invalid feedback fields' USING ERRCODE='22023';
   END IF;
   IF jsonb_typeof(item->'transcript') IS DISTINCT FROM 'string'
   OR length(item->>'transcript') NOT BETWEEN 10 AND 12000 OR length(btrim(item->>'transcript'))<10
   OR jsonb_typeof(item->'biggest_weakness') IS DISTINCT FROM 'string' OR length(item->>'biggest_weakness')>1000
   OR jsonb_typeof(item->'fix') IS DISTINCT FROM 'string' OR length(item->>'fix')>2000
   OR jsonb_typeof(item->'is_retry') IS DISTINCT FROM 'boolean' THEN
     RAISE EXCEPTION 'Invalid feedback text or retry flag' USING ERRCODE='22023';
   END IF;
   FOREACH field_name IN ARRAY ARRAY['score','retry_improvement'] LOOP
     IF field_name='retry_improvement' AND item->field_name='null'::jsonb THEN CONTINUE; END IF;
     IF jsonb_typeof(item->field_name) IS DISTINCT FROM 'number' THEN
       RAISE EXCEPTION 'Invalid feedback numeric type' USING ERRCODE='22023';
     END IF;
     number_value:=(item->>field_name)::numeric;
     IF number_value<>trunc(number_value) OR number_value>100
     OR number_value<(CASE WHEN field_name='score' THEN 0 ELSE -100 END) THEN
       RAISE EXCEPTION 'Invalid feedback numeric bounds' USING ERRCODE='22023';
     END IF;
   END LOOP;
   IF item->'raw_feedback'<>'null'::jsonb THEN
     IF jsonb_typeof(item->'raw_feedback') IS DISTINCT FROM 'string' OR length(item->>'raw_feedback')>24000 THEN
       RAISE EXCEPTION 'Invalid raw feedback: bounded text or null required' USING ERRCODE='22023';
     END IF;
   END IF;
   IF item ? 'dimensions' THEN
     IF jsonb_typeof(item->'dimensions') IS DISTINCT FROM 'array' THEN
       RAISE EXCEPTION 'Invalid dimensions array' USING ERRCODE='22023';
     END IF;
     IF jsonb_array_length(item->'dimensions')>8 THEN
       RAISE EXCEPTION 'Too many dimensions' USING ERRCODE='22023';
     END IF;
     FOR dimension_item IN SELECT * FROM jsonb_array_elements(item->'dimensions') LOOP
       IF jsonb_typeof(dimension_item) IS DISTINCT FROM 'object' THEN
         RAISE EXCEPTION 'Invalid dimension object' USING ERRCODE='22023';
       END IF;
       IF NOT (dimension_item ?& ARRAY['dimension','score'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(dimension_item) k WHERE k NOT IN ('dimension','score'))
       OR jsonb_typeof(dimension_item->'dimension') IS DISTINCT FROM 'string'
       OR NOT ((dimension_item->>'dimension')=ANY(allowed_dimensions))
       OR jsonb_typeof(dimension_item->'score') IS DISTINCT FROM 'number' THEN
         RAISE EXCEPTION 'Invalid dimension fields' USING ERRCODE='22023';
       END IF;
       number_value:=(dimension_item->>'score')::numeric;
       IF number_value<>trunc(number_value) OR number_value NOT BETWEEN 0 AND 100 THEN
         RAISE EXCEPTION 'Invalid dimension score' USING ERRCODE='22023';
       END IF;
     END LOOP;
   END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(sid::text,0));
 SELECT user_id INTO existing_owner FROM public.sessions WHERE id=sid;
 IF FOUND THEN
   IF existing_owner<>actor THEN RAISE EXCEPTION 'Session not available'; END IF;
   RETURN sid;
 END IF;
 INSERT INTO public.sessions(id,user_id,mode,duration_ms,speaking_time_ms,overall_score)
 VALUES(sid,actor,p_session->>'mode',duration_value::bigint,speaking_value::bigint,
 (SELECT round(avg((f->>'score')::numeric))::integer FROM jsonb_array_elements(p_session->'feedbacks') f));
 FOR item IN SELECT * FROM jsonb_array_elements(p_session->'feedbacks') LOOP
  INSERT INTO public.session_feedbacks(session_id,transcript,score,biggest_weakness,fix,is_retry,retry_improvement,raw_feedback)
  VALUES(sid,item->>'transcript',(item->>'score')::numeric::integer,item->>'biggest_weakness',item->>'fix',(item->>'is_retry')::boolean,(item->>'retry_improvement')::numeric::integer,NULLIF(item->'raw_feedback','null'::jsonb));
 END LOOP;
 INSERT INTO public.session_dimensions(session_id,dimension,score)
 SELECT sid,d->>'dimension',round(avg((d->>'score')::numeric))::integer
 FROM jsonb_array_elements(p_session->'feedbacks') f CROSS JOIN LATERAL jsonb_array_elements(f->'dimensions') d GROUP BY d->>'dimension';
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.save_practice_session(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_practice_session(jsonb) TO authenticated;
COMMIT;
