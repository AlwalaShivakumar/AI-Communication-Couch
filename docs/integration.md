# Development integration stage

The user supplied a separate development Supabase project on 2026-10-03. Its URL differs from the app's existing .env.local configuration. Development credentials are kept only in the ignored .env.integration.local file; the app's existing configuration is unchanged.

## Completed

- Updated compatible brace-expansion versions from 1.1.18 to 1.1.21 and 5.0.9 to 5.0.12, without adding overrides or changing major versions.
- Extended the isolated production test with a local Auth/Data API fixture and signed test sessions. Authenticated requests now exercise strict rejection of browser userId, oversized text/bodies, correct profile owner filters, weighted quota reservations, 429 limits and 503 fail-closed behavior.
- Production fixtures do not bypass application authentication or add test switches to application code. They do not call Google or a remote database.
- Added a read-only development preflight which requires an explicitly supplied matching project URL, rejects the app's existing project URL and refuses secret/service-role keys.

## Confirmed development-project results

- Auth settings reachable.
- Email authentication enabled.
- Email auto-confirm disabled (confirmation required).
- Anonymous sign-ins disabled.
- profiles, sessions, session_feedbacks and session_dimensions are unavailable in the anonymous Data API schema cache (PGRST205). This can reflect missing tables or exposure/grant/schema-cache configuration and is not proof of an empty database.
- No users were created, no database rows/settings were changed, and no migration was applied.

## Required before authenticated integration tests

1. In the DEVELOPMENT project's Auth settings, enable anonymous sign-ins and manual identity linking. Confirm email/password support, confirmation, redirects and email delivery. Never change the production project for these tests.
2. Run supabase/inspection.sql in the development SQL editor. It performs a read-only schema/policy/grant/relationship/function inspection. Save the output privately and review whether app tables or legacy data exist.
3. Inspect existing data and back up any development data/schema before applying a migration. The inspection query is not a backup and does not establish that the project has no other tables.
4. Review the draft migration against that inspected schema. Apply it only after this review, using administrative development-project access; a publishable key cannot execute SQL or configure Auth.
5. Repeat the preflight, then verify real authenticated user A/B isolation, guest conversion, login/logout, email verification/recovery and session saves. Provider/microphone checks remain separate.

No password, private service-role key or database connection string should be posted in chat. Secure schema/data exports must remain ignored and out of Git.

## Commands

```sh
npm run test:development -- https://YOUR-DEVELOPMENT-PROJECT.supabase.co
npm run typecheck
npm run lint
npm test
npm run test:production
```

The development command performs GET requests only. Empty anonymous SELECT results do not prove INSERT/UPDATE/DELETE isolation. The isolated production fixture verifies application boundaries, not real Supabase JWT validation or deployed RLS.

## Remaining dependency issue

npm audit now reports five high findings stemming from the same unpatched braces dependency through the lint toolchain. The upstream advisory lists no patched version and the registry still lists 3.0.3. Do not downgrade Next.js/ESLint to make an audit count disappear. This remains a release-review item, with no confirmed route accepting user-supplied glob patterns.

Reference: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
