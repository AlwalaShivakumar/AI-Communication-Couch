-- DEVELOPMENT ONLY: run after migration as postgres in the approved project.
-- Uses synthetic users/session fixtures and ends in ROLLBACK; do not remove it.
-- Tests SQL roles with simulated claims, not real JWT authentication.
BEGIN;
DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); bsid uuid:=gen_random_uuid();
 payload jsonb; n bigint; t text; tests integer:=0; cost integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 payload:=jsonb_build_object('id',sid,'mode','interview','duration_ms',1000,'speaking_time_ms',500,'feedbacks',jsonb_build_array(jsonb_build_object('transcript','A valid interview answer','score',0,'biggest_weakness','Clarity','fix','Lead with the answer','is_retry',false,'retry_improvement',null,'raw_feedback','Feedback','dimensions',jsonb_build_array(jsonb_build_object('dimension','Grammar','score',0)))));
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF auth.uid() IS DISTINCT FROM a THEN RAISE EXCEPTION 'Identity A failed'; END IF; tests:=tests+1;
 PERFORM public.save_practice_session(payload); PERFORM public.save_practice_session(payload);
 INSERT INTO public.profiles(id) VALUES(a);
 FOREACH t IN ARRAY ARRAY['profiles','sessions','session_feedbacks','session_dimensions'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  IF n<>1 THEN RAISE EXCEPTION 'Own access/idempotency failed for %',t; END IF; tests:=tests+1;
 END LOOP;
 IF (SELECT overall_score FROM public.sessions WHERE id=sid)<>0 THEN RAISE EXCEPTION 'Zero scoring failed'; END IF; tests:=tests+1;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 IF auth.uid() IS DISTINCT FROM b THEN RAISE EXCEPTION 'Identity B failed'; END IF; tests:=tests+1;
 FOREACH t IN ARRAY ARRAY['profiles','sessions','session_feedbacks','session_dimensions'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Foreign SELECT allowed for %',t; END IF; tests:=tests+1;
  EXECUTE format('UPDATE public.%I SET id=id',t); GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Foreign UPDATE allowed for %',t; END IF; tests:=tests+1;
  EXECUTE format('DELETE FROM public.%I',t); GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Foreign DELETE allowed for %',t; END IF; tests:=tests+1;
 END LOOP;
 BEGIN INSERT INTO public.profiles(id) VALUES(a); RAISE EXCEPTION 'Foreign profile INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN INSERT INTO public.sessions(user_id,mode) VALUES(a,'story'); RAISE EXCEPTION 'Foreign session INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN INSERT INTO public.session_feedbacks(session_id,transcript,score,biggest_weakness,fix) VALUES(sid,'A foreign answer',10,'weak','fix'); RAISE EXCEPTION 'Foreign feedback INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN INSERT INTO public.session_dimensions(session_id,dimension,score) VALUES(sid,'Grammar',10); RAISE EXCEPTION 'Foreign dimension INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN PERFORM public.save_practice_session(payload); RAISE EXCEPTION 'Foreign RPC overwrite allowed'; EXCEPTION WHEN unique_violation THEN tests:=tests+1; END;
 PERFORM public.save_practice_session(jsonb_set(payload,'{id}',to_jsonb(bsid)));
 INSERT INTO public.profiles(id) VALUES(b);
 BEGIN UPDATE public.sessions SET user_id=a WHERE id=bsid; RAISE EXCEPTION 'Owner transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN UPDATE public.session_feedbacks SET session_id=sid WHERE session_id=bsid; RAISE EXCEPTION 'Feedback parent transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN UPDATE public.session_dimensions SET session_id=sid WHERE session_id=bsid; RAISE EXCEPTION 'Dimension parent transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN SELECT count(*) INTO n FROM private.ai_quota; RAISE EXCEPTION 'Private SELECT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN INSERT INTO private.ai_quota VALUES('forbidden',now(),0); RAISE EXCEPTION 'Private INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 FOREACH cost IN ARRAY ARRAY[NULL,-1,0,3] LOOP
  BEGIN PERFORM public.consume_ai_quota(cost); RAISE EXCEPTION 'Invalid quota cost accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'Invalid quota request' THEN RAISE; END IF; tests:=tests+1;
  END;
 END LOOP;
 BEGIN PERFORM public.save_practice_session('[]'::jsonb); RAISE EXCEPTION 'Malformed session accepted'; EXCEPTION WHEN invalid_parameter_value THEN tests:=tests+1; END;
 BEGIN PERFORM public.save_practice_session(jsonb_set(payload,'{mode}','"invalid"'::jsonb)); RAISE EXCEPTION 'Invalid mode accepted'; EXCEPTION WHEN invalid_parameter_value THEN tests:=tests+1; END;
 BEGIN PERFORM public.save_practice_session(jsonb_set(payload,'{feedbacks,0,score}','101'::jsonb)); RAISE EXCEPTION 'Invalid score accepted'; EXCEPTION WHEN invalid_parameter_value THEN tests:=tests+1; END;
 BEGIN PERFORM public.save_practice_session(jsonb_set(payload,'{feedbacks,0,raw_feedback}',to_jsonb(repeat('x',24001)))); RAISE EXCEPTION 'Oversized feedback accepted'; EXCEPTION WHEN invalid_parameter_value THEN tests:=tests+1; END;
 FOR n IN 1..6 LOOP IF NOT public.consume_ai_quota(2) THEN RAISE EXCEPTION 'Valid quota request denied'; END IF; END LOOP;
 IF public.consume_ai_quota(1) THEN RAISE EXCEPTION 'Minute quota exceeded'; END IF; tests:=tests+1;
 UPDATE public.profiles SET target_role='Test' WHERE id=b; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Own UPDATE failed'; END IF; tests:=tests+1;
 DELETE FROM public.sessions WHERE id=bsid; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR EXISTS(SELECT 1 FROM public.session_feedbacks) OR EXISTS(SELECT 1 FROM public.session_dimensions) THEN RAISE EXCEPTION 'Own DELETE/cascade failed'; END IF; tests:=tests+1;
 RESET ROLE; SET LOCAL ROLE anon;
 FOREACH t IN ARRAY ARRAY['profiles','sessions','session_feedbacks','session_dimensions'] LOOP
  BEGIN EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n; RAISE EXCEPTION 'Anon SELECT allowed for %',t; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 END LOOP;
 BEGIN PERFORM public.consume_ai_quota(1); RAISE EXCEPTION 'Anon quota RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 BEGIN PERFORM public.save_practice_session(payload); RAISE EXCEPTION 'Anon save RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN tests:=tests+1; END;
 RESET ROLE;
 PERFORM set_config('app.security_test_count',tests::text,true);
END $$;
SELECT 'PASS - DEVELOPMENT SQL role tests; fixtures will be rolled back' AS result,current_setting('app.security_test_count')::integer AS assertions;
ROLLBACK;
