# Development authentication and authorization verification

Verified on 2026-10-03 against `https://dekorxyetwpgpyjeypfq.supabase.co` only.

## Result and scope

55 real authentication/database/application checks and 10 generated-link signup/guest checks passed. The existing 22 regression tests, TypeScript, lint, and a local production-mode build using DEVELOPMENT configuration passed. These results do not complete browser email-link verification.

Production was not contacted, migrated, deployed, or reconfigured. No production environment file was changed. The existing development security migration was not rerun. No application source code or migration was changed during this verification.

The initial integration run passed 40 checks before guest Auth was enabled. The final 55-check run includes those database/Auth checks plus 15 local application checks; these are not 95 different checks.

## Auth configuration

| Setting | Observed status |
| --- | --- |
| Email provider | Enabled |
| New-user signup | Enabled |
| Email confirmation | Required; left enabled |
| Anonymous authenticated users | Enabled in DEVELOPMENT with explicit approval |
| Manual identity linking | Enabled in DEVELOPMENT with explicit approval |
| Site URL | `http://localhost:3000` |
| Callback redirect allowlist | Empty; requires development callback configuration |
| Email delivery | Not tested, by agreement |

The two Auth settings were saved through the development dashboard, and real guest sign-in succeeded afterward. Supabase documents manual linking as a prerequisite for anonymous-to-permanent account conversion: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous).

## Real authentication lifecycle

- Created isolated A/B accounts in development with admin-confirmed synthetic test emails. The privileged credential was used only by the local fixture harness, never by application clients.
- Password login returned real Supabase JWTs. Both identities were independently verified using `auth.getUser()`; JWT subjects and authenticated roles matched.
- Refresh rotated the refresh token and preserved identity. Restoring a real session in a new client succeeded. Real SSR session cookies reached the local Next.js server successfully.
- Logout cleared the client session and revoked its refresh token. Existing access JWTs may remain valid until expiry; immediate access-token revocation was not claimed.
- A separate generated signup link created an unconfirmed account. Password login was denied until verification. Token verification returned a session and confirmed email. Password setup and subsequent login succeeded. Token replay was rejected.
- A generated recovery link was verified, a new password set, and the old password denied. No recovery email was sent or inspected.
- Authenticated guest sign-in, guest practice saving/reading, and guest refresh passed. A separate registered user could not read guest practice.

## Two-user isolation

| Operation | Result |
| --- | --- |
| A saves interview, feedback, dimensions | Passed, including actual database RPC and correct score |
| A saves conversation through Next.js server action | Passed with real authenticated request cookies |
| A retries identical session save | Same session ID; feedback not duplicated |
| A reads history and cached insights | Passed through Data API and local server rendering/actions |
| B reads A profile/session/feedback/dimensions | Zero visible rows |
| B updates or deletes A records in all four tables | No rows affected; A records independently confirmed intact |
| B inserts session/profile with A ownership | Denied |
| B inserts feedback/dimension under A parent | Denied |
| B reassigns own session to A | Denied |
| B uses A session UUID in save RPC/action | Denied; A record preserved |
| Save RPC receives a supplied user ID | Invalid fields rejected |
| B saves own session | Stored owner is B's authenticated identity |
| A exhausts minute quota, B consumes own quota | A denied at cap; B still succeeds |
| Quota RPC receives a supplied user ID | Rejected |
| Unauthenticated `anon` table access | Permission denied for all four tables |
| Unauthenticated `anon` RPC access | Both RPCs denied |
| Normal clients access `private.ai_quota` | Denied by API schema/privilege boundary |

RLS commonly hides foreign rows: SELECT/UPDATE/DELETE can succeed with an empty result rather than return HTTP 403. Tests required empty results and checked A's records afterward. Authenticated anonymous guests use the `authenticated` role and may access their own rows; they are distinct from requests without an Auth session.

The earlier catalogue verification established ENABLE/FORCE RLS, policies, constraints, indexes, and function security attributes. This verification exercises those controls with real Auth sessions through Supabase APIs rather than simulated SQL JWT claims.

## Application boundaries and privileged credentials

- `/api/analyze` and `/api/evaluate` returned 401 for missing and malformed sessions.
- Both routes returned 400 for an added body `userId` under a real verified session.
- Profile and practice server actions rejected missing sessions and attempted cross-user ownership. The profile action rejects an added `id` field.
- History rendering and cached insight actions kept A's content out of B's response.
- `requireUser()` uses request cookies and `auth.getUser()`; actions derive identity from that result. The browser does not supply the authorized owner through request-body or localStorage IDs.
- Browser and server application clients use the public publishable key, not the fixture admin credential. Public configuration rejects secret keys and legacy service-role JWTs. The generated browser bundles did not contain the actual development secret credential.
- The local build/server inherited explicit development public settings. A fetch guard blocked origins other than this development project and localhost; Gemini was configured with a disabled test value. No AI inference was requested.

## Remaining verification and required configuration

1. Add the exact development browser callback to the development redirect allowlist, matching the port/host used for browser testing, for example `http://localhost:3000/auth/callback?next=/auth/update-password`. No redirect settings were changed in this task.
2. Test guest-to-email conversion through the application's `updateUser({ email })` flow while preserving the guest UUID and existing practice. This was not exercised: the agreed generated signup links create separate users and do not prove conversion.
3. Test a real browser PKCE callback through `/auth/callback` and the password form. Direct generated-token verification tests Supabase token handling, not this browser path.
4. Verify browser reload persistence and logout UI cleanup. HTTP tests used real SSR cookies but do not prove browser storage behavior across reloads.
5. Actual verification/reset email delivery remains intentionally unverified. Testing that later requires an authorized inbox and suitable development email delivery configuration.

No application code defect was established by the passing checks. Full signup/reset browser readiness must not be claimed until the remaining checks pass. Guest signup abuse controls and MAU limits should be reviewed before any future production enablement; development settings do not authorize production changes.

## Cleanup and limitations

Only newly created integration users and their owned rows were deleted using fixture IDs. A final read-only check confirmed zero Auth users and zero rows in each of the four application tables in this fresh development project. Existing user data was not reassigned or changed.

Quota tests consumed development reservations. Per-user/global quota records are retained until the function's normal expiry/pruning; no private-table cleanup or security changes were made. A local minute-limit test can be sensitive to crossing a minute boundary, although it passed in this run.

The first restricted-environment regression/lint attempts failed during OS-user lookup/filesystem inspection. Reruns outside that restricted environment passed. No application test failed in the completed runs.

## Reproduction and artifacts

These standalone scripts perform remote development writes and create disposable test users; they are intentionally excluded from the automatic `npm test` glob. Do not run them against other projects.

```powershell
rtk proxy node tests/development-auth-integration.mjs https://dekorxyetwpgpyjeypfq.supabase.co --application
rtk proxy node tests/development-auth-signup.mjs https://dekorxyetwpgpyjeypfq.supabase.co
rtk proxy npm run typecheck
rtk proxy npm run lint
rtk proxy npm test
```

Ignored local evidence: `scratch/development-auth-integration.json`, `scratch/development-auth-signup.json`, `scratch/development-auth-cleanup.json`, and `scratch/development-auth-settings.jpg`. These reports contain outcomes, not passwords, tokens, or keys. Credentials remain in the ignored integration environment file.

Work stopped after DEVELOPMENT verification. No push or deployment occurred.
