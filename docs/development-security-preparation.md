# Development database security preparation

## Scope and inspection evidence

Prepared locally for the separately approved DEVELOPMENT project, dekorxyetwpgpyjeypfq. No remote migration, data changes, Auth settings changes, production access, deployment, secret rotation or environment-variable changes were performed in this stage. Local database fixtures apply the draft only to disposable PGlite databases with synthetic users and backup acknowledgements; those are not backups or migrations of Supabase.

The user ran inspection-prerequisites.sql in the development SQL Editor and supplied its complete JSON output. The transaction reports read_only=on, role postgres and PostgreSQL 17.11.

| Check | Confirmed result |
| --- | --- |
| Application schema drift | public remains empty of inventoried relations/routines; private remains absent |
| Conflicting types | Only the managed auth.sessions row type matches; it does not conflict with public.sessions |
| anon/authenticated | Neither is superuser or BYPASSRLS; neither has role memberships or public CREATE permission; both have public/auth USAGE |
| Functions | auth.uid, gen_random_uuid, hashtextextended, bigint advisory lock, JSON iteration/key inspection and numeric truncation exist with expected return types and required execution rights |
| Owner foreign key | auth.users.id is UUID, NOT NULL, with a valid/ready/immediate primary unique index; postgres has REFERENCES and auth USAGE |
| Installation permissions | postgres has public CREATE |
| Default ACLs | New public tables/functions receive broad anon/authenticated/service-role rights; explicit revocations in the draft are necessary |

Default ACL entries in the supplied report are scoped to public/auth; no global or private entries were returned. The private table still receives an explicit revoke. The draft does not change project-wide default privileges or managed platform objects. postgres and service_role can bypass RLS; ownership isolation applies to authenticated application users, not administrators holding privileged credentials.

## Draft changes and reasons

- Fresh-install precondition rejects an existing private schema, non-extension public relations/routines/types, or unsafe application roles. CREATE no longer silently reuses existing tables. The old policy replacement loop and add-missing-column repair logic were removed; existing installations require separate review.
- Application table ACLs explicitly revoke PUBLIC/anon/authenticated, then grant only SELECT/INSERT/UPDATE/DELETE to authenticated. This removes default TRUNCATE and other unnecessary rights as well as anonymous access.
- The private quota schema and table both explicitly revoke PUBLIC/anon/authenticated. The quota RPC retains SECURITY DEFINER and its empty search path, and rejects null or out-of-range costs before any writes.
- The session RPC validates object shape, required and unexpected fields, UUID, mode, integer timings, up to 50 feedback entries, bounded transcripts/critique, boolean retry flags, nullable retry improvements, bounded raw text and up to eight valid dimension entries per feedback before writes. Explicit input errors use SQLSTATE 22023 instead of relying on accidental casts.
- raw_feedback is bounded JSON text (24,000 characters) or null, matching its actual Markdown usage rather than accepting arbitrary documents. A table CHECK also protects direct inserts/updates.
- Session ownership remains derived solely from auth.uid. SECURITY INVOKER, transaction atomicity, advisory locking, idempotent retries, four cascading foreign keys, owner USING/WITH CHECK policies and ENABLE/FORCE RLS remain intact.

PostgreSQL JSONB syntax is validated before the RPC receives its argument. Decimal representations of whole numbers are checked numerically, then converted safely; strings pretending to be numbers are rejected. An owned session ID is idempotent for valid retries, not an update operation. A foreign session ID remains invisible through RLS and cannot be overwritten; a primary-key collision aborts the save.

## Verification and remaining prerequisites

The preceding security-preparation stage passed 19 local tests, TypeScript, ESLint and the Next.js production build. The acknowledgement workflow adds three regression tests covering target binding, production rejection and fresh-schema enforcement. The build emitted an existing warning about a lockfile outside the repository. No deployment was performed.

Local regression tests exercise permissive default ACLs, direct CRUD ownership, parent reassignment, public/anon/no-identity access, null/invalid quota costs, malformed and oversized session JSON, transactional rejection, valid optional dimensions/null raw feedback, repeated/concurrent saves, migration conflicts/reruns and read-only inspection syntax. Catalogue assertions check four forced-RLS tables, four foreign keys, seven public indexes, four owner policies and two RPCs with their intended security modes and empty search paths.

These are isolated PostgreSQL tests, not authenticated remote PostgREST integration tests. The supplied development inspection verifies prerequisites and schema compatibility, not the future behavior of an unapplied migration. After later approval/application, inspect resulting ACLs/policies and test real User A/B JWT access through Supabase.

The user confirmed the DEVELOPMENT Free Plan has no included project backup/restore facility and authorized an explicit fresh-development no-backup acknowledgement. No backup exists or is claimed by that acknowledgement; recovery of managed Auth/Storage data is not established by an empty application schema. The gate has not been acknowledged remotely. Recheck schema drift if objects change before installation. Anonymous sign-in and identity-linking configuration remain separate prerequisites for the guest/authentication integration stage. No migration or Vercel deployment is authorized by this preparation.

## Future execution, not performed

An alternative that needs no local database client is now prepared in supabase/development-sql-editor.sql. See docs/development-sql-editor.md for the complete paste-ready workflow, its manual dashboard project-identity check and the separate read-only verification query. It preserves the canonical migration and places the three development assertions inside the transaction using SET LOCAL. This alternative has not been executed.

Only after explicit migration approval, set DEVELOPMENT_DATABASE_URL privately in the local shell to the approved development project's direct or session-pooler PostgreSQL connection. The runner does not load .env.local, alter environment files, read production configuration, or print the URL/password. PostgreSQL client tools must be installed and certificate verification must be configured (PGSSLROOTCERT or sslrootcert in the URL, as appropriate).

Use the guarded runner rather than manually setting development assertions in an arbitrary SQL Editor:

```powershell
rtk proxy npx --no-install tsx supabase/run-development-migration.ts --acknowledge-development-no-backup
```

The runner accepts only db.dekorxyetwpgpyjeypfq.supabase.co or a Supabase session pooler with username postgres.dekorxyetwpgpyjeypfq, port 5432 and database postgres. It rejects other projects, transaction-pooler ports, unsupported connection options and weaker TLS modes before starting psql. Credentials are supplied in the child process environment, not command arguments. It clears inherited connection-service/options overrides and ignores psql startup configuration.

In that validated development connection, it supplies app.migration_environment=development, app.migration_project_ref=dekorxyetwpgpyjeypfq and app.reviewed_backup=development-no-backup, then executes the complete file. SQL also checks the fresh schema before application DDL. No corresponding connection or acknowledgement is set in production.

The production SQL gate accepts only yes and rejects development-no-backup, even with the correct project declaration. The default environment is production. A privileged operator can change custom settings or SQL, so these assertions are not a security boundary against a database administrator; target enforcement relies on the guarded connection workflow and its TLS verification. Production requires separate verified backup/recovery, schema review and explicit approval. It has no no-backup exemption.

This command was not executed. No remote acknowledgement was set. If a gate or statement fails, review the failure rather than deleting data or weakening controls. The explicit flag accepts the lack of a backup; it does not create one or verify restoration.
