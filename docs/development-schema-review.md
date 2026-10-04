# Development schema visibility review

Status: **clean application schema confirmed by user-provided DEVELOPMENT catalogue output**. The latest prerequisite inspection reports PostgreSQL 17.11, no public/private application relations or routines, no conflicting types, usable Supabase roles/functions and a valid auth.users UUID primary key with REFERENCES permission. No Supabase migration was applied; production was not accessed. The historical API checks below were GET-only. See development-security-preparation.md for the updated local draft and remaining approval/backup gates.

## What the original empty result means

supabase/inspection.sql filters to public and four exact table names, and its pg_class query includes only ordinary tables (relkind r). Its function query covers only consume_ai_quota and save_practice_session in public.

Assuming the supplied SQL ran successfully as written against the intended development database, the empty pg_class result is evidence that those four ordinary public tables were absent from that catalogue snapshot. It is not just an RLS-filtered query against application rows. However, it does not establish that public exists, inventory other names, detect partitioned parents/views/foreign tables, inspect other schemas, or inspect private.ai_quota. The information_schema results alone can also depend on privileges.

## Remote findings

| Check | Result | Meaning |
| --- | --- | --- |
| public.profiles with explicit Accept-Profile public | 404 / PGRST205 | Not available in the selected API schema cache |
| public.sessions with explicit Accept-Profile public | 404 / PGRST205 | Same |
| public.session_feedbacks with explicit Accept-Profile public | 404 / PGRST205 | Same |
| public.session_dimensions with explicit Accept-Profile public | 404 / PGRST205 | Same |
| public API catalogue/OpenAPI using publishable key | 401 | Catalogue unavailable to this key/request; not evidence of an empty catalogue |
| public API catalogue using development secret key | 200; root path only; no definitions or RPC paths | No exposed app tables/routines visible to this API role |
| private schema request | 406 / PGRST106 | private is not accepted as an exposed API schema |

The public requests were accepted far enough to perform table lookup; they did not produce the invalid-schema error seen for private. This confirms the API is looking for public objects rather than accidentally targeting another schema. API-cache absence still does not substitute for a complete database catalogue inventory.

References: [PostgREST error meanings](https://docs.postgrest.org/en/stable/references/errors.html), [PostgreSQL relation kinds](https://www.postgresql.org/docs/current/catalog-pg-class.html), [Supabase schema selection](https://supabase.com/docs/guides/api/using-custom-schemas).

## Broader read-only inspection

Run supabase/inspection-visibility.sql in the SAME DEVELOPMENT SQL editor and share the reviewed metadata result. It uses an explicit read-only transaction and no DDL, writes, Auth changes, RPC execution, user data selection, or function-body output.

It establishes database/role/search-path context, public/private schema existence, all five expected relations across relation kinds, matching names across all non-system schemas, a wider relation inventory, public/private routines, policies and grants. Platform-managed auth/storage objects are normal in a new Supabase project and do not mean application data already exists.

Review the inventory for user-created objects before calling the application schema clean. Metadata alone does not prove existing relations contain zero rows; existing application relations would require a further reviewed, read-only data-count/constraint inspection.

## Earlier draft review (historical)

The complete current proposed SQL is supabase/migrations/202610030001_security.sql. The description below records the earlier draft; it has since been hardened locally with a fresh-install precondition, explicit ACL revocations and RPC validation. It is shown for review, not execution. No development backup acknowledgement was set and no remote migration guard was bypassed.

| Object | Intended role |
| --- | --- |
| public.profiles | User-owned name, role, goal, experience and insight cache |
| public.sessions | Owner, mode, timings, score and creation time |
| public.session_feedbacks | Parent session, transcript, score, critique and retry data |
| public.session_dimensions | Parent session and averaged dimension scores |
| private.ai_quota | Atomic minute/day/global quota counters |
| public.consume_ai_quota(integer) | Authenticated quota reservation; security definer, fixed search path |
| public.save_practice_session(jsonb) | Authenticated atomic/idempotent session save; security invoker |

The draft adds four ownership/parent foreign keys with cascading deletion, input/score/time/mode constraints, three explicit indexes (plus primary-key indexes), and one owner RLS policy per application table with USING and WITH CHECK. It enables/forces RLS, revokes anon table access, grants own-row CRUD to authenticated users, and restricts both RPCs to authenticated execution. The private schema is not accessible to public/anon/authenticated roles.

It reserves 12 units/minute/user, 120/day/user and 1,000/day globally, with coaching costing two units. Session saving derives auth.uid, computes mean scores including zero and writes parent/children atomically.

Review hazards: the draft would replace existing policies on the four tables, revoke access to an existing private schema, and create non-idempotent constraints/indexes/functions. These effects require the broader inventory before application. It aborts on unacknowledged review, legacy owners, incompatible schema/constraints or duplicate objects; it does not auto-delete or reassign legacy data. It does not create auth.users, configure anonymous sign-in, set email/redirect settings, create storage buckets or migrate production.

## Elevated metadata follow-up

The user supplied a DEVELOPMENT secret key, used only in GET metadata requests to the same approved development URL. With that key, public OpenAPI is readable and lists only the root path, zero definitions and no RPC paths. All four expected public tables still return PGRST205; private still returns PGRST106. This strengthens evidence of an uninitialized expected public application schema, but does not inventory hidden/non-exposed schemas or prove full database cleanliness.

The key is stored only as SUPABASE_SECRET_KEY in the ignored .env.integration.local file. It was not added to application code, a NEXT_PUBLIC variable or Git. No matching value was found in tracked files. Because it was posted in chat, rotate it after these checks; secret keys bypass RLS. [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

The broader query was validated locally against an isolated PostgreSQL engine. It correctly reports an alternate-schema profiles table and a partitioned public sessions relation, and confirms its transaction is read-only. It has not been executed against the remote development database because API credentials do not provide direct SQL-editor/database-catalogue execution access.
