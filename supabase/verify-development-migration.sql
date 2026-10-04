-- Run AFTER a successful migration, in a separate DEVELOPMENT SQL Editor execution.
-- Metadata only: no writes, RPC calls, user records, keys or function bodies.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'context',jsonb_build_object('role',current_user,'read_only',current_setting('transaction_read_only')),
 'application_tables',(
   SELECT jsonb_agg(jsonb_build_object('table',x.name,'exists',c.oid IS NOT NULL,
     'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
     'anon_any_privilege',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
     'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
     'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
     'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
     'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE'),
     'authenticated_extra_privileges',has_table_privilege('authenticated',c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
     'public_any_privilege',EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0)))
   FROM (VALUES ('public.profiles'),('public.sessions'),('public.session_feedbacks'),('public.session_dimensions')) x(name)
   LEFT JOIN pg_class c ON c.oid=to_regclass(x.name)
 ),
 'constraints',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,
     'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid,c.conname)
   FROM pg_constraint c WHERE c.conrelid IN (to_regclass('public.profiles'),to_regclass('public.sessions'),
     to_regclass('public.session_feedbacks'),to_regclass('public.session_dimensions'),to_regclass('private.ai_quota'))
 ),'[]'::jsonb),
 'indexes',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('schema',i.schemaname,'table',i.tablename,'name',i.indexname,
     'definition',i.indexdef,'valid',p.indisvalid,'ready',p.indisready) ORDER BY i.schemaname,i.tablename,i.indexname)
   FROM pg_indexes i JOIN pg_namespace n ON n.nspname=i.schemaname
   JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.indexname JOIN pg_index p ON p.indexrelid=c.oid
   WHERE (i.schemaname='public' AND i.tablename IN ('profiles','sessions','session_feedbacks','session_dimensions'))
     OR (i.schemaname='private' AND i.tablename='ai_quota')
 ),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname)
   FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN ('profiles','sessions','session_feedbacks','session_dimensions')),'[]'::jsonb),
 'private_quota',jsonb_build_object('exists',to_regclass('private.ai_quota') IS NOT NULL,
   'anon_schema_usage',has_schema_privilege('anon',to_regnamespace('private'),'USAGE'),
   'authenticated_schema_usage',has_schema_privilege('authenticated',to_regnamespace('private'),'USAGE'),
   'anon_table_privileges',has_table_privilege('anon',to_regclass('private.ai_quota'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
   'authenticated_table_privileges',has_table_privilege('authenticated',to_regclass('private.ai_quota'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
   'public_schema_privileges',EXISTS(SELECT 1 FROM pg_namespace n
     CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='private' AND a.grantee=0),
   'public_table_privileges',EXISTS(SELECT 1 FROM pg_class c
     CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=to_regclass('private.ai_quota') AND a.grantee=0)),
 'functions',(
   SELECT jsonb_agg(jsonb_build_object('expected',x.signature,'exists',p.oid IS NOT NULL,
     'result',pg_get_function_result(p.oid),'security_definer',p.prosecdef,'settings',p.proconfig,
     'owner',pg_get_userbyid(p.proowner),
     'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
     'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
     'public_execute',EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')))
   FROM (VALUES ('public.consume_ai_quota(integer)'),('public.save_practice_session(jsonb)')) x(signature)
   LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature)
 )
) AS development_migration_verification;
COMMIT;
