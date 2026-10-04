# Database

## Status and inspection gate

The security migration was applied and committed to the separately approved DEVELOPMENT project `dekorxyetwpgpyjeypfq` on 2026-10-03 with the explicit no-backup development acknowledgement. Committed metadata, 46 rollback-only SQL-role assertions and 22 local tests passed. See development-migration-result.md. It has not been applied to production; real JWT/authentication integration testing remains outstanding. The historical preparation requirements below still apply to any separate production migration.

The SQL in supabase/migrations/202610030001_security.sql is a **draft for local testing**. Tests apply it to an isolated PostgreSQL engine with simulated Supabase roles and auth.uid. They do not verify the deployed schema, Supabase settings, backups or existing rows.

Do not apply it to production or connect to the live project as part of this task. Before later approval, export schema, functions, grants, policies, relationships and data into secure storage; test restoration; inventory legacy owners, orphan children, modes, nulls, lengths, duplicate dimensions and scores. Never commit exports containing user data.

The migration checks app.reviewed_backup and aborts unless explicitly acknowledged by a future operator. Production (also the default if no environment is declared) requires yes, which must represent an actual verified backup/recovery prerequisite. The separately approved fresh development project may explicitly use development-no-backup through supabase/run-development-migration.ts. This records acceptance of having no backup; it does not assert recovery exists. The runner pins the connection to the approved project, requires an explicit flag and verified TLS, and declares the development environment/project before the SQL gate. Unknown environments and mismatched project declarations abort. Settings are procedural assertions, not independent server identity or proof of backup; do not manually spoof them on another project.

This is a fresh-development-install migration: an existing private schema or non-extension public relations, routines or standalone types cause an abort before any application DDL. Existing installations need a separate reviewed migration. It does not delete or reassign legacy rows. Schema or constraint incompatibility rolls back the transaction. Production migration adaptation still requires separate inspection, real backup/recovery verification and explicit approval.

## Tables and relationships

| Table | Owner/parent | Purpose |
| --- | --- | --- |
| profiles | id -> auth.users.id | Profile fields and insight cache |
| sessions | user_id -> auth.users.id | Mode, duration, speaking time and overall score |
| session_feedbacks | session_id -> sessions.id | Transcript, validated score, critique, retry information |
| session_dimensions | session_id -> sessions.id | Average dimension scores per session |
| private.ai_quota | scoped bucket keys | Per-user and global AI reservations |

Owner and child foreign keys cascade on account/session deletion. Review that behavior against the retention policy before production use. The draft adds score, mode, duration, profile and feedback constraints and a unique session/dimension index. Existing relationships may need adaptation to avoid duplicate constraints after inspection.

## RLS and RPCs

All four application tables enable and force RLS. The draft creates policies only on freshly created tables. Authenticated users may SELECT/INSERT/UPDATE/DELETE their profile and sessions; child policies require ownership of the parent session in both USING and WITH CHECK. PUBLIC and anon have no application-table privileges. Authenticated anonymous users have the same ownership restrictions as email users. Privileged administrators and service-role access are outside this user-isolation model and can bypass RLS.

save_practice_session is SECURITY INVOKER with an empty search_path. auth.uid supplies ownership. JSON types, fields, UUIDs, modes, integer bounds, text lengths and dimension entries are validated before writes. Unknown fields are rejected. raw_feedback stores Markdown as a JSON string (at most 24,000 characters), or SQL/JSON null; it is not an arbitrary nested JSON document. A table check also enforces this boundary for direct writes. Dimensions can be omitted, or contain at most eight entries. An advisory lock and ID check make retries idempotent: a valid retry returns the existing owned session without changing its contents. All inserts are transactional; dimensions and overall score are computed from feedback, including zero scores. Personal scores can still be fabricated by an owner and are not attestations.

consume_ai_quota is SECURITY DEFINER with an empty search_path and authenticated execution; PUBLIC and anon execution are explicitly revoked. Null costs and costs outside 1–2 are rejected before counters change. The private schema and quota table each explicitly revoke PUBLIC/anon/authenticated access. Atomic reservations allow 12 units/minute/user, 120 units/day/user and 1,000 units/day globally. Coaching reserves two units; transcription, questions and uncached insights reserve one. Calls that fail after reservation still consume units. Old counters are pruned on requests.

## Local evidence and next steps

Tests exercise role-based SELECT/INSERT/UPDATE/DELETE isolation, child ownership, RPC collisions, rollback, repeated saves, concurrent quota reservations and rejection of legacy owners. This is not a full Supabase integration test.

After a reviewed migration is adapted to an inspected development schema, run the same ownership tests through Supabase JWTs/Data API, validate query relationships, inspect policies/grants again, and rehearse deployment and rollback. The draft is not an idempotent repair script; do not run it repeatedly against an initialized schema.
