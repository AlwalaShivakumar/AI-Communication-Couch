# Development migration through the SQL Editor

## Compatibility and scope

The canonical migration is ordinary PostgreSQL SQL and PL/pgSQL using Supabase auth.uid and auth.users. It contains no Node.js, filesystem calls, environment-variable substitution, psql backslash commands, external executable calls or dependency on the TypeScript runner. Its app.* settings are PostgreSQL configuration settings, not operating-system environment variables.

The earlier CLI failure did not establish a SQL limitation. Supabase SQL Editor can run the same migration using the already inspected administrative postgres role. Do not execute it as anon or authenticated, change function ownership to those roles, or weaken permissions to resolve errors.

development-sql-editor.sql is a complete snapshot of migrations/202610030001_security.sql. Its only executable additions are three SET LOCAL statements immediately after BEGIN:

```sql
SET LOCAL app.migration_environment='development';
SET LOCAL app.migration_project_ref='dekorxyetwpgpyjeypfq';
SET LOCAL app.reviewed_backup='development-no-backup';
```

The entire remainder of the canonical migration is unchanged. These settings are visible to its existing gate and expire at transaction end. The canonical file and guarded runner remain unchanged. Regenerate and review this snapshot if the canonical migration changes; do not maintain divergent copies.

## What to paste later

1. Verify the actual dashboard URL is for project dekorxyetwpgpyjeypfq, for example https://supabase.com/dashboard/project/dekorxyetwpgpyjeypfq/sql. Check the URL, not just a project display name.
2. In that DEVELOPMENT SQL Editor, select the postgres role and open a new query.
3. Paste the ENTIRE contents of supabase/development-sql-editor.sql, including BEGIN, all function bodies, and the final COMMIT. There are no placeholders, include directives or additional files to paste.
4. Execute the whole query once only after the user approves SQL Editor execution. Do not execute selected fragments or separately run the acknowledgements. This is a fresh-install migration, not a rerunnable repair script.
5. If any statement fails, stop and report the error. Do not remove guards, delete data or blindly retry. If an explicit transaction remains aborted in the session, roll it back before further inspection.

The script declares development; it cannot independently prove the hosting project's identity. SQL Editor execution lacks the runner's connection-URL/TLS target validation. An administrator can change the declarations. Therefore manually verifying the actual dashboard project reference is essential. The canonical production/default SQL gate still rejects development-no-backup; this development-specific script must never be pasted into a production editor. No backup or restoration capability is claimed.

## Verification after successful execution

Run the ENTIRE contents of supabase/verify-development-migration.sql as a separate query after the migration succeeds. It is an explicitly read-only metadata inspection and does not call quota/session RPCs or select user data. Expected output:

- Four application tables exist, all with rls_enabled=true and rls_forced=true.
- All application-table anon_any_privilege and public_any_privilege values are false. Authenticated SELECT/INSERT/UPDATE/DELETE values are true; extra privileges are false.
- Four public foreign keys: profiles_auth_owner and sessions_auth_owner reference auth.users; feedback_parent and dimension_parent reference public.sessions. Each uses ON DELETE CASCADE.
- Five primary-key constraints (four application tables plus quota), seven public CHECK constraints plus the quota counter CHECK. Every constraint is validated.
- Seven valid/ready public indexes (four primary-key indexes and the three named migration indexes), plus the quota primary-key index.
- Four owner policies: profile_owner, session_owner, feedback_owner, dimension_owner. Each applies ALL operations to authenticated only and includes both USING and WITH CHECK ownership predicates based on auth.uid; child predicates require the owned parent session.
- private.ai_quota exists. All reported anon/authenticated/private PUBLIC permissions are false.
- Both RPCs exist with authenticated_execute=true, anon_execute=false and public_execute=false. consume_ai_quota is SECURITY DEFINER and save_practice_session is SECURITY INVOKER; both retain an empty search_path.

Visibility from this separate post-COMMIT query is evidence the objects persisted. Review definitions, not only counts. postgres and service_role have administrative/BYPASSRLS powers; their ability to read all rows does not test client isolation.

Real user isolation requires separate authenticated DEVELOPMENT User A/B tests through the app/Data API: own profile/session/children CRUD should succeed; foreign reads/updates/deletes must reveal or change no rows; foreign-owner inserts and parent reassignment must fail; a foreign session ID must not be overwritten by the save RPC; valid repeated saves must not duplicate rows. Unauthenticated Data API access and both RPCs must be denied. Quota null/invalid costs and malformed session payloads must fail; normal clients must not directly access private.ai_quota. Those tests write test data or reserve quota and are not part of the read-only metadata query; agree their development-only fixture scope before running them. Do not use or share privileged keys as substitutes for user JWTs.

This stage prepared files only. It executed no SQL, made no remote acknowledgements, accessed no production and performed no deployment.
