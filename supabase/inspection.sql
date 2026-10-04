-- Read-only inspection. Run in the DEVELOPMENT project's SQL editor.
-- Save the result privately; inspect it before sharing or committing anything.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'tables', COALESCE((
   SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner)))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('profiles','sessions','session_feedbacks','session_dimensions')
 ),'[]'::jsonb),
 'columns', COALESCE((
   SELECT jsonb_agg(to_jsonb(x)) FROM (
     SELECT table_name,column_name,data_type,is_nullable,column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('profiles','sessions','session_feedbacks','session_dimensions')
     ORDER BY table_name,ordinal_position
   ) x
 ),'[]'::jsonb),
 'constraints', COALESCE((
   SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated))
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('profiles','sessions','session_feedbacks','session_dimensions')
 ),'[]'::jsonb),
 'policies', COALESCE((
   SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p
   WHERE schemaname='public' AND tablename IN ('profiles','sessions','session_feedbacks','session_dimensions')
 ),'[]'::jsonb),
 'grants', COALESCE((
   SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.table_privileges g
   WHERE table_schema='public' AND table_name IN ('profiles','sessions','session_feedbacks','session_dimensions')
 ),'[]'::jsonb),
 'indexes', COALESCE((
   SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i
   WHERE schemaname='public' AND tablename IN ('profiles','sessions','session_feedbacks','session_dimensions')
 ),'[]'::jsonb),
 'functions', COALESCE((
   SELECT jsonb_agg(jsonb_build_object('name',p.proname,'security_definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('consume_ai_quota','save_practice_session') AND p.prokind='f'
 ),'[]'::jsonb)
) AS development_schema_inspection;
COMMIT;
