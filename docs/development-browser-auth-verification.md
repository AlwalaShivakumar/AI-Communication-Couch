# Development browser authentication verification

Date: 2026-10-03. Target: `dekorxyetwpgpyjeypfq` only.

## Current status: conversion confirmed; PKCE callback failed

The actual application is running locally at `http://localhost:3000` with the DEVELOPMENT public URL/key. The local test server uses the existing development-configured build and blocks non-development server fetches. No privileged key is passed to the application. Production settings and the security migration remain unchanged.

The exact DEVELOPMENT redirect was added and visibly saved:

```text
http://localhost:3000/auth/callback?next=/auth/update-password
```

No wildcard redirect was added. The existing Site URL remains `http://localhost:3000`.

## Observations

| Check | Status |
| --- | --- |
| Guest creation through application UI | Passed |
| Guest profile saved through real server action | Passed |
| Guest reload persistence | Passed: saved name/role visible after reload |
| Guest practice start/end | Attempted while microphone initialization was pending; database snapshot shows no saved session. Not passed |
| Real guest email conversion request | Accepted through Create account UI and `updateUser({ email })` |
| UUID after conversion | Unchanged; Supabase now reports permanent, email-confirmed user |
| Duplicate permanent account | None: exactly one account with the converted email. Additional anonymous browser users exist |
| Email verification completed | Passed: user reported receiving email; database confirms verified conversion |
| Permanent-account profile retention | Passed after password setup, logout, permanent password login and browser reload |
| Browser PKCE callback | Failed: original and fresh recovery-link attempts showed verification error |
| Password form | Passed using original authenticated, confirmed session; user entered password and profile page loaded. Does not prove PKCE |
| Logout/reload | Passed after waiting for logout-success message: opening Profile creates a blank guest and does not show A's profile |
| Permanent password login/reload/navigation | Passed with user-entered credentials; original saved profile confirmed in the inspected browser before and after reload, then Insights navigation completed |
| Post-conversion two-user isolation | Six ownership checks passed; disposable B removed. Session/child retention remains untested |

The existing profile is available, but there are no practice/feedback/dimension records in this browser fixture. Full retention testing for those records cannot be inferred from profile persistence or the earlier standalone isolation tests. The unsuccessful practice start/end attempt requires further investigation before those records can be tested through this flow.

The final read-only snapshot confirms the same guest UUID, `is_anonymous=false`, email confirmed, one permanent account with that email, and the retained profile. There are three total Auth users: the converted account and two additional anonymous browser guests. No duplicate permanent email account was created. The disposable API User B used for ownership attacks was removed; the user-authorized account and browser guests were preserved.

## Email delivery

Custom SMTP is disabled in DEVELOPMENT. Supabase's default templates/service are in use. Both email-change verification and password-reset templates are present. Template presence and accepted requests do not prove delivery.

The user authorized a test inbox and confirmed receiving the real conversion email. Supabase confirmed conversion of the original guest UUID. The browser callback showed a verification error. A fresh reset request was accepted; the user reported another verification error during that test. Successful recovery callback/password reset from email was not established.

The default Supabase service restricts recipients to project-team addresses and has low rate limits; other recipients require development SMTP configuration. Source: [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp). No SMTP credentials/settings or email confirmation controls were changed.

## Handoff and retained state

The first email opened in Chrome/Edge on the Windows computer rather than the original test tab. IPv4 localhost was available but IPv6 localhost was initially unavailable. An additional DEVELOPMENT server listener on IPv6 loopback restored localhost reachability without exposing the app on the network. The browser callback nevertheless failed. The fresh recovery attempt also failed, and the original automated test tab had not navigated to the callback. A missing/different browser verifier or consumed link is plausible; the exact upstream cause was not established and is not claimed.

The original browser was initially hidden. It was subsequently shown for user handoff. In that original authenticated, confirmed session, the user entered/saved a password through `/auth/update-password`; Profile Settings and the retained A profile appeared. This direct authenticated path is supported by the existing application, but is not evidence of a successful email PKCE callback.

Links, tokens, passwords and credentials must not be pasted into chat. The user entered the new password themselves. A fresh email callback test must start and finish in the same visible test browser and respect the default mail service's limits; custom development SMTP may be needed if delivery limits prevent another attempt.

The converted account/profile are intentionally retained. Logout was performed through the real UI and confirmed before reload. Opening Profile afterward created a fresh guest, which showed no A data. The user was asked to sign back in using the permanent email/password. This is a user-authorized inbox account, not a disposable admin-provisioned fixture, and it was not deleted.

During the first login/reload attempt, the page was reloaded before login navigation was confirmed; this may have interrupted that attempt. The completed test subsequently confirmed the original saved profile in the inspected browser, reloaded only after that confirmation, and verified it remained visible afterward. The earlier interrupted attempt is not counted as a passed persistence check.

The local IPv4 and IPv6 loopback DEVELOPMENT listeners remain running for review. No new password or verification link was captured by the test scripts. Screenshots contain no passwords, Auth tokens or keys.

## Required follow-up before claiming complete browser readiness

1. Retry the actual PKCE email flow entirely within one visible browser session. Do not move the link to Chrome/Edge or a different browser storage context. The exact development redirect is already saved; no additional redirect wildcard is needed.
2. If the callback still fails in a confirmed matching browser, inspect sanitized upstream error codes for the PKCE exchange. The current application displays a generic safe error, so this run did not establish the precise upstream cause.
3. Respect the default mail-service limits. Configure custom DEVELOPMENT SMTP only if the intended recipient or test volume requires it; keep SMTP credentials out of chat. Do not disable email confirmation or bypass PKCE to make the test appear to pass.
4. Resolve the practice initialization/test limitation, create actual guest sessions containing feedback/dimensions/scores, and repeat conversion and retention/isolation testing for those records. Current results prove profile retention only.

The existing application/migration source was not changed. This browser phase added ignored local test helpers/evidence and this report. The earlier regression suite/build passed in the preceding integration phase; no new full regression-suite run is claimed here.

Ignored evidence files: `scratch/browser-auth-before.json`, `scratch/browser-auth-after.json`, `scratch/browser-converted-isolation.json`, `scratch/development-browser-redirect.jpg`, `scratch/development-browser-conversion-pending.jpg`, `scratch/development-browser-password-handoff.jpg`, `scratch/development-browser-logout.jpg`, and `scratch/development-browser-permanent-reload.jpg`. Snapshots contain a test UUID and owned-data metadata, not tokens or credentials.

No production access, database migration, Vercel deployment or production environment change occurred.

## Subsequent Account/Profile and practice fixes

The later [Account/Profile verification report](development-account-ui-verification.md) records the client auth-state fixes, completed permanent/guest real Gemini practice saves, reload persistence, live isolation checks and final regression/build results. Those newer results supersede this phase's practice-start limitation. The prior failed browser PKCE callback and fresh conversion-retention limitation are still unresolved; they are not retroactively marked passed.
