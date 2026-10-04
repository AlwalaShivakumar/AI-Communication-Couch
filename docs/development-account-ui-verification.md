# Development Account/Profile verification

Date: 2026-10-03. Supabase project: `dekorxyetwpgpyjeypfq` only.

## Cause and changes

The Account component previously rendered the sign-in form without observing the current authenticated user. Profile loaded identity/data once on mount. The navigation listener refreshed server components but did not synchronize those client states. This was a client state problem; no RLS changes were needed.

`AuthProvider` now verifies identity with Supabase `getUser()`, observes authentication events, and rejects stale verification responses. It starts with a neutral loading state. The root layout provides this state to Account, Profile and the navigation guest initializer. Server authorization continues to use the verified request session and RLS.

Account distinguishes unauthenticated, anonymous and permanent users. Permanent users see their email, verification status, password management, profile navigation and logout. Guests see a guest notice and conversion/sign-in controls. `/account` redirects to the existing canonical `/auth` route. Profile reloads on identity transitions and suppresses content belonging to a previous owner; a blank permanent profile uses “Your profile” and a blank guest profile uses “Guest user”. Existing saved preferred names are preserved, including the test account's name containing “guest”.

Changed application files:

- `src/components/AuthProvider.tsx`
- `src/components/AuthStatus.tsx`
- `src/app/layout.tsx`
- `src/app/auth/page.tsx`
- `src/app/account/page.tsx`
- `src/app/profile/page.tsx`
- `src/components/LiveSession.tsx`

## Browser results

| Check | Result |
| --- | --- |
| Permanent Account dashboard | Passed: verified email/account controls; no sign-in, create-account or continue-as-guest controls |
| `/account` alias | Passed: redirects to the authenticated `/auth` dashboard |
| Account reload | Passed: neutral checking state followed by permanent dashboard |
| Permanent Profile | Passed: original preferred name/role retained |
| Logout and reload | Passed: permanent dashboard removed; unauthenticated form, no logout control |
| Real password login after logout | Passed: user entered existing password; inspected original Profile and verified reload persistence |
| Cross-tab state | Account in another localhost tab reflected permanent login |
| Fresh guest UI | Passed at `127.0.0.1`: real anonymous creation, explicit guest Account notice, blank guest Profile without A's profile |
| Fresh conversion with practice data | Blocked: no second unused authorized test inbox; original permanent account preserved |
| Real fresh guest practice save/reload | Passed at localhost using the approved microphone permission: genuine Gemini feedback and owned history remained after reload |
| Real browser email PKCE callback | Previously failed; not retried or counted as passed in this phase |

The localhost permanent account and `127.0.0.1` guest use separate origin storage. This separation is for local browser verification only; it does not replace database ownership testing. No additional email redirect was configured for `127.0.0.1`.

## Practice initialization

Previously, START exposed END before awaited microphone initialization completed. The session timestamp and identifier were initialized afterward, so an early END could silently skip persistence. Initialization now has a disabled STARTING state and exposes END only after media/session initialization. Navigation invalidates pending media requests; late streams are stopped. Saving is awaited, and a missing initialized session produces a visible error. Permission retry goes through the complete initialization flow, rather than opening media without creating a session.

Browser verification observed the disabled STARTING state. Initial microphone requests were rejected. After the user granted permission, the original browser successfully reached LISTENING with END enabled. Using the actual Type/Edit interface with microphone capture disabled, a real test response received Gemini feedback. END showed a saving indicator, then the session appeared in Insights with its exact transcript and feedback.

Read-only verification confirmed the session belongs to the original converted UUID, has score 85, one feedback row and four dimension rows. The history also contained another practice record; it was neither overwritten nor removed and is not attributed to this automated test.

A fresh anonymous guest was subsequently created through the actual localhost UI, with profile name “Development practice guest B”. This guest successfully initialized a microphone session, used Type/Edit with capture disabled, received genuine Gemini feedback, and saved a score of 95, one feedback row and five dimension rows. History persisted after browser reload and contained only the guest's session, excluding the permanent user's sessions. Read-only Auth/database inspection confirmed this guest remains anonymous and its practice rows use its distinct UUID.

A disposable authenticated anonymous verification user was unable to read either owner's profiles, sessions, feedback or dimensions (eight direct live checks). Only the disposable verification user was removed afterward. The permanent account and fresh browser guest, profiles and actual practice records remain intact. The visible localhost browser is left signed in as the fresh guest to preserve its usable session for a future authorized conversion test.

No substitute AI output or browser-practice database records were fabricated. Both test answers were submitted through the actual Type/Edit UI and scores/feedback came from the provider. A DEVELOPMENT Gemini key is configured only in the ignored integration file and supplied only to the local server. Successful real inference is now verified. Full guest-to-permanent practice-data retention remains blocked by the missing second inbox.

The auxiliary `127.0.0.1` microphone attempt never completed and is not counted as passed. Its pending request was cancelled by navigation. Successful guest practice used localhost's already approved permission, without altering browser security settings programmatically.

## Automated checks and boundaries

- TypeScript: passed on final application code.
- ESLint: passed without warnings on final application code.
- Development-configured Next build: passed on final application code.
- Existing regression suite: 22 passed, zero failed on final application code. Database migration tests run in disposable local PGlite, not the migrated remote database.
- Live development integration suite: 55 passed, zero failed, including real Auth login/refresh/logout, two-user CRUD/RPC isolation, protected API boundaries and authenticated server actions. This ran before the final microphone retry adjustment, which does not change the server authorization or database implementation.
- Temporary integration users/fixtures were cleaned up; existing user-authorized accounts/data were preserved.
- Final browser bundle scan found neither the configured development privileged Supabase key nor the configured Gemini key in 24 JavaScript bundles after the final retry rebuild.

The test server is pinned to the development Supabase origin. Its fetch guard permits only that origin, local loopback and the official Gemini API origin. Production Supabase requests are blocked. No privileged Supabase key is passed to the application launcher. The ignored integration configuration and test helpers are not deployment artifacts.

No production access, production environment change, database migration modification/execution, Git push or Vercel deployment occurred. Remaining fresh guest conversion retention and PKCE checks must be completed before claiming full browser readiness or proceeding to Vercel Preview.

Evidence: ignored `scratch/real-browser-practice-verification.json`, `scratch/development-account-fixed.jpg`, `scratch/development-real-practice-history.jpg` and `scratch/development-guest-practice-history.jpg`. Evidence contains test outcomes/screens, not keys, passwords or Auth tokens.
