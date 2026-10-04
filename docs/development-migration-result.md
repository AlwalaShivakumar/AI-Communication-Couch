# Development migration verification — 2026-10-03

## Outcome and scope

The reviewed security migration committed successfully to DEVELOPMENT project `dekorxyetwpgpyjeypfq` through its Supabase SQL Editor, under explicit user approval. The visible dashboard URL identified that exact project; its display name was `verification`. The final read-only preflight reported `postgres`, PostgreSQL 17.11, zero public relations/routines and no private schema.

The complete editor payload matched `supabase/development-sql-editor.sql` after newline normalization (16,876 characters). Its transaction used `development-no-backup`; no backup or restoration capability was claimed. The acknowledgement was transaction-local and was confirmed cleared afterward. Production was not accessed or modified; no production configuration changes, Git push or Vercel deployment occurred. No credentials or keys were printed.

Supabase warned about destructive operations and missing RLS because its static scanner did not recognize the migration's dynamic ALTER TABLE loop. The subsequent committed catalogue confirms ENABLE/FORCE RLS on every application table. No security control was removed to resolve the warning.

## Committed database objects

- `public.profiles`, `public.sessions`, `public.session_feedbacks`, `public.session_dimensions`; each enables and forces RLS.
- `private.ai_quota` with its counter CHECK and primary key.
- Four validated ownership/parent foreign keys with ON DELETE CASCADE: `profiles_auth_owner`, `sessions_auth_owner`, `feedback_parent`, `dimension_parent`.
- Fifteen public constraints: four primary keys, four foreign keys and seven CHECK constraints. The quota table adds a primary key and CHECK constraint.
- Eight valid/ready indexes: four public primary-key indexes, `session_dimension_unique`, `sessions_owner_created`, `feedback_session`, and the quota primary-key index.
- Four ALL-operation authenticated owner policies with both USING and WITH CHECK: `profile_owner`, `session_owner`, `feedback_owner`, `dimension_owner`. The child policies require ownership of the parent session.
- `public.consume_ai_quota(integer)` (SECURITY DEFINER) and `public.save_practice_session(jsonb)` (SECURITY INVOKER), owned by postgres with empty search_path settings.

## Privileges and function integrity

Committed privilege inspection confirmed no PUBLIC/anon application-table privileges, authenticated SELECT/INSERT/UPDATE/DELETE privileges and no authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges. PUBLIC/anon/authenticated have no direct private-schema/quota-table access. Both RPCs deny PUBLIC/anon execution and permit authenticated execution.

The stored RPC body hashes matched the reviewed source with the editor's Windows line endings: quota `1fc5b90992af123838d58f2432bbc323`, session save `d455c3c549ad17a7f378cab4640e0293`. This checks that the executed function bodies retained the reviewed validation/quota/session behavior.

## Test evidence

The actual DEVELOPMENT database passed **46 SQL-role assertions** in one transaction ending in ROLLBACK. The exact script is saved as `supabase/test-development-security.sql`. It creates synthetic Auth/profile/session fixtures solely inside that transaction and tests:

- Correct auth.uid identities, own-row visibility and idempotent saves, including zero scoring.
- Cross-user SELECT/UPDATE/DELETE isolation for all four application tables, denial of foreign-owner inserts, foreign session ID collisions and owner/parent reassignment.
- Private table access denial, invalid/null quota costs, malformed session/mode/score/raw feedback rejection and the minute quota limit.
- Own updates/deletes and cascades; anon table/RPC denial.

A separate post-rollback read-only query confirmed zero application rows, zero quota rows and zero Auth users, so no fixtures remained. All four forced-RLS tables and four policies remained committed. The local regression suite was rerun: **22 tests passed**.

These live tests exercised the real PostgreSQL roles, RLS, constraints and RPCs, using simulated claim settings. They did not validate real Supabase JWT issuance/verification or complete signup/login/logout/recovery/guest-linking flows through the Data API. Those remain authentication integration work. Privileged postgres/service-role access is outside the ordinary-user isolation model and can bypass RLS.

The final verification screenshot is saved in the ignored scratch folder as `scratch/development-migration-verification.jpg`. The reusable read-only catalogue query remains `supabase/verify-development-migration.sql`.

Stop at DEVELOPMENT verification. Production migration and deployment require separate approval and production schema/backup/recovery review. Do not rerun the fresh-install migration against this initialized development schema.
