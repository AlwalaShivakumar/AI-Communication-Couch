-- Run only in the approved DEVELOPMENT project's SQL Editor.
-- Catalogue metadata only: no user rows, function bodies, secrets or writes.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'context', jsonb_build_object('database',current_database(),'role',current_user,
   'read_only',current_setting('transaction_read_only'),'server_version',current_setting('server_version')),
 'default_privileges', COALESCE((
   SELECT jsonb_agg(jsonb_build_object('creator',pg_get_userbyid(d.defaclrole),
     'schema',COALESCE(n.nspname,'GLOBAL'),'object_type',d.defaclobjtype,
     'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'privilege',a.privilege_type,'grantable',a.is_grantable))
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclnamespace=0 OR n.nspname IN ('public','private','auth')
 ),'[]'::jsonb),
 'roles', COALESCE((
   SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,
     'bypass_rls',r.rolbypassrls,'inherit',r.rolinherit,'login',r.rolcanlogin,
     'create_database',r.rolcreatedb,'create_role',r.rolcreaterole,
     'public_usage',has_schema_privilege(r.oid,to_regnamespace('public'),'USAGE'),
     'public_create',has_schema_privilege(r.oid,to_regnamespace('public'),'CREATE'),
     'auth_usage',has_schema_privilege(r.oid,to_regnamespace('auth'),'USAGE'),
     'private_usage',has_schema_privilege(r.oid,to_regnamespace('private'),'USAGE'),
     'inherited_or_settable_roles',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'name',other.rolname,'member',pg_has_role(r.oid,other.oid,'MEMBER'),
       'inherits',pg_has_role(r.oid,other.oid,'USAGE'),'superuser',other.rolsuper,'bypass_rls',other.rolbypassrls)),'[]'::jsonb)
       FROM pg_roles other WHERE other.oid<>r.oid AND pg_has_role(r.oid,other.oid,'MEMBER'))))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','authenticator','postgres')
 ),'[]'::jsonb),
 'prerequisite_functions', (
   SELECT jsonb_agg(jsonb_build_object('expected',x.signature,'exists',p.oid IS NOT NULL,
     'resolved_schema',n.nspname,'result',pg_get_function_result(p.oid),
     'current_execute',has_function_privilege(p.oid,'EXECUTE'),
     'anon_execute',(SELECT has_function_privilege(r.oid,p.oid,'EXECUTE') FROM pg_roles r WHERE r.rolname='anon'),
     'authenticated_execute',(SELECT has_function_privilege(r.oid,p.oid,'EXECUTE') FROM pg_roles r WHERE r.rolname='authenticated')))
   FROM (VALUES ('auth.uid()'),('gen_random_uuid()'),('pg_catalog.hashtextextended(text,bigint)'),
     ('pg_catalog.pg_advisory_xact_lock(bigint)'),('pg_catalog.jsonb_array_elements(jsonb)'),
     ('pg_catalog.jsonb_object_keys(jsonb)'),('pg_catalog.trunc(numeric)')) x(signature)
   LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature)
   LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
 ),
 'auth_users_identity', jsonb_build_object(
   'table_exists',to_regclass('auth.users') IS NOT NULL,
   'id',(SELECT jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
     'current_references',has_column_privilege(c.oid,a.attnum,'REFERENCES'))
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
     WHERE c.oid=to_regclass('auth.users') AND a.attname='id' AND NOT a.attisdropped),
   'unique_identity_indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ic.relname,
     'primary',i.indisprimary,'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,
     'immediate',i.indimmediate))
     FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid
     JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id'
     WHERE i.indrelid=to_regclass('auth.users') AND i.indisunique AND i.indnkeyatts=1
       AND i.indkey[0]=a.attnum AND i.indpred IS NULL AND i.indexprs IS NULL),'[]'::jsonb),
   'current_auth_usage',has_schema_privilege(to_regnamespace('auth'),'USAGE'),
   'current_public_create',has_schema_privilege(to_regnamespace('public'),'CREATE')),
 'application_schemas',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner))),'[]'::jsonb)
   FROM pg_namespace n WHERE n.nspname IN ('public','private')),
 'application_relations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,
   'extension_owned',EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))),'[]'::jsonb)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')),
 'application_routines',(SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
   'arguments',pg_get_function_identity_arguments(p.oid),
   'extension_owned',EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))),'[]'::jsonb)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')),
 'types_to_review',(SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,
   'kind',t.typtype,'relation',t.typrelid<>0,'array_element',t.typelem<>0,
   'extension_owned',EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e'))),'[]'::jsonb)
   FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
   WHERE n.nspname IN ('public','private') OR t.typname IN
     ('profiles','sessions','session_feedbacks','session_dimensions','ai_quota','consume_ai_quota','save_practice_session','public','private'))
) AS development_prerequisite_inspection;
COMMIT;
