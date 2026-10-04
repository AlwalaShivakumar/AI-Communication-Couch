-- DEVELOPMENT ONLY: broader catalogue inspection; no schema/data changes.
-- This returns metadata only, not user records or function bodies.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'context', jsonb_build_object(
   'database', current_database(), 'current_user', current_user,
   'session_user', session_user, 'search_path', current_setting('search_path'),
   'transaction_read_only', current_setting('transaction_read_only')
 ),
 'schemas', COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'schema', n.nspname, 'owner', pg_get_userbyid(n.nspowner),
     'current_role_usage', has_schema_privilege(n.oid,'USAGE'),
     'current_role_create', has_schema_privilege(n.oid,'CREATE')
   ) ORDER BY n.nspname)
   FROM pg_namespace n
   WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
 ), '[]'::jsonb),
 'expected_relations', (
   SELECT jsonb_agg(jsonb_build_object(
     'expected', x.name, 'exists', c.oid IS NOT NULL, 'kind', c.relkind,
     'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
   ) ORDER BY x.name)
   FROM (VALUES ('public.profiles'),('public.sessions'),
     ('public.session_feedbacks'),('public.session_dimensions'),
     ('private.ai_quota')) x(name)
   LEFT JOIN pg_class c ON c.oid=to_regclass(x.name)
 ),
 'application_names_any_schema', COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'schema',n.nspname,'name',c.relname,'kind',c.relkind,
     'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity
   ) ORDER BY n.nspname,c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname IN ('profiles','sessions','session_feedbacks','session_dimensions','ai_quota')
     AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
 ), '[]'::jsonb),
 'non_system_relation_inventory', COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'schema',n.nspname,'name',c.relname,'kind',c.relkind,
     'owner',pg_get_userbyid(c.relowner),
     'extension_owned',EXISTS(
       SELECT 1 FROM pg_depend d
       WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'
     )
   ) ORDER BY n.nspname,c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p','v','m','f','S')
     AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
 ), '[]'::jsonb),
 'public_private_routines', COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'schema',n.nspname,'name',p.proname,'kind',p.prokind,
     'arguments',pg_get_function_identity_arguments(p.oid),
     'security_definer',p.prosecdef
   ) ORDER BY n.nspname,p.proname)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('public','private')
 ), '[]'::jsonb),
 'application_routines_any_schema', COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'schema',n.nspname,'name',p.proname,
     'arguments',pg_get_function_identity_arguments(p.oid)
   ) ORDER BY n.nspname,p.proname)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname IN ('consume_ai_quota','save_practice_session')
 ), '[]'::jsonb),
 'public_private_policies', COALESCE((
   SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p
   WHERE p.schemaname IN ('public','private')
 ), '[]'::jsonb),
 'public_private_table_grants', COALESCE((
   SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.table_privileges g
   WHERE g.table_schema IN ('public','private')
 ), '[]'::jsonb)
) AS development_visibility_inspection;
COMMIT;
