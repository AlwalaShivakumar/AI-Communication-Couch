# Authentication

## Implemented code

- Practice pages establish a Supabase authenticated anonymous user.
- Cookie persistence uses @supabase/ssr; the proxy refreshes claims/cookies.
- Server operations verify getUser and derive identity from the returned user.
- Account creation links an email to the existing anonymous user, verifies it, then sets a password of 12-128 characters.
- Sign-in uses email/password. Account UI provides sign-out, password-reset requests and verification resend.
- /auth/callback exchanges a PKCE authorization code and redirects only to an allowlisted application path.
- /auth/update-password requires a verified, non-anonymous account.
- User data uses ownership RLS, including authenticated anonymous users.

## Development project prerequisites

These are required settings, not controls that this code configures:

1. Enable anonymous sign-ins and manual identity linking.
2. Enable email/password authentication and Confirm Email.
3. Set the site URL and explicitly allow development and approved preview /auth/callback redirects.
4. Configure email delivery and test email change, recovery and resend templates. The current callback expects a code from the standard PKCE flow; token-hash-only custom templates are not supported.
5. Configure password policy and session expiry/refresh settings. Provider settings are the authoritative expiry policy.

Email verification links currently require the browser that initiated PKCE. A different browser/device may not have the verifier. Test this limitation and explain it in support guidance; do not silently redirect a failed callback as success.

## Identity and data retention

An anonymous user uses the authenticated PostgreSQL role. Logging out, clearing browser data or switching devices loses access to that guest identity. Converting the current guest to a new email account preserves its ID and history. Signing into an existing account switches identities and does not merge histories.

Legacy guest UUID cookies/localStorage are ignored. They cannot prove ownership and must not be used to automatically claim old rows. Any legacy migration requires a separately reviewed recovery/retention policy.

## Required verification

Use two development accounts and a guest to test creation, conversion with stable user ID, confirmation, sign-in, refresh, expiry, sign-out, recovery, resend and expired/reused links. Validate that user A's profile/history never appears for user B. No live Auth project was accessed during this implementation.

References: [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [SSR authentication](https://supabase.com/docs/guides/auth/server-side/nextjs).
