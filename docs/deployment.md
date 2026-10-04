# Vercel deployment

## Current configuration

There is no vercel.json. package.json supplies the Next.js build/start commands and requires Node >=22. Coaching routes explicitly use Node runtime, dynamic rendering and maxDuration=120. Verify the Vercel plan permits this duration. next.config.ts sets a 3 MB server-action limit, within the usual Vercel request ceiling; application limits remain smaller. Public Supabase settings are bundled at build time, so changing them requires rebuilding.

Required variables are NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable/anon only) and GEMINI_API_KEY. Do not expose a secret/service-role key under any NEXT_PUBLIC name. The old server-role variable is unused. Set independent values for development/preview and production.

## Release sequence and risk

| Change | Risk | Requirement |
| --- | --- | --- |
| Auth verification and authenticated guest bootstrap | High | Enable/verify Auth and matching policies before application rollout |
| RLS, foreign keys and constraints | High | Inspect schema/data; backup and test restore; reviewed migration; never auto-claim old guests |
| Quota and atomic-save RPCs | High | Deploy/verify compatible development schema first; missing functions fail closed |
| PKCE account routes | Medium | Explicit redirects, email templates, delivery and recovery verification |
| Stream protocol/scoring | Medium | Coordinated frontend/backend deployment; exercise provider failures and cancellation |
| DOCX parser and bounded uploads | Medium | Fixtures plus malicious/malformed upload checks |
| Next.js security patch | Medium | Full checks and preview smoke tests |
| Dead scratch scripts, unused starter assets/dependencies | Low | References verified; no route/build consumers |
| Documentation | Low | No runtime impact |

No code has been pushed or deployed as part of this work. The draft SQL must not be applied to the live database.

## Development/preview checklist

- [ ] Review current production schema, policies, grants, functions and relationships later under separate authorization.
- [ ] Back up data/schema securely and prove restoration before any future live migration.
- [ ] Decide retention/recovery of legacy UUID guest data without trusting browser IDs.
- [ ] Adapt draft SQL to an inspected development schema; apply and test only there first.
- [ ] Configure anonymous/email Auth, manual linking, confirmation, redirects, SMTP and expiry.
- [ ] Verify two users cannot select/update/delete/insert one another's data through the Data API or RPCs.
- [ ] Test guest-to-new-account conversion retains its ID; existing-account login does not merge.
- [ ] Test login/logout, reset, resend, expired links and session refresh.
- [ ] Test short/oversized input, invalid AI output, provider failure, quotas and missing RPCs.
- [ ] Test general/interview scores including zero, history, repeated saves and retry after save failure.
- [ ] Test microphone pause/resume, retry, next question, unmount, mobile fallback and abort.
- [ ] Test valid and malformed PDF/DOCX/TXT uploads.
- [ ] Review dependency advisories and ensure no blocking vulnerability remains.
- [ ] Run typecheck, lint, tests and production build.
- [ ] Verify browser bundles and logs do not contain private keys.
- [ ] Verify preview runtime/timeout behavior and private cache headers.
- [ ] Review UI against the current application; no comprehensive browser smoke test is implied by compilation.
- [ ] Approve production rollout and compatible database sequence separately.

## Rollback

Keep a verified schema/data snapshot and last deployed application revision. A code-only rollback to the old editable-guest identity model will not work with the new strict RLS and may reopen known risks. Coordinate database compatibility and application revisions; never restore permissive policies solely to make old code work. Rehearse rollback against development data before approval.

## Local test build

npm run test:production builds and starts Next.js with loopback Supabase fixtures and a placeholder Gemini key, exercises unauthorized/origin/content-type/redirect/cache boundaries, then stops the server. It never uses the live database. Its .next output contains fixture configuration; rebuild with the intended deployment environment before using that output. Vercel performs its own environment-specific build.
