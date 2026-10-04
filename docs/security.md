# Security

## Implemented controls in this branch

Identity comes from verified Supabase sessions, never editable guest IDs. Authenticated users, including guests, access only their own profile, sessions and child records through ownership RLS. The old unfiltered history fallback is removed. These database protections require the reviewed migration; current production policies remain unverified.

Server-side Gemini calls use GEMINI_API_KEY. The browser receives only a Supabase project URL and publishable/anon key. The app does not use a service-role key. Keep credentials out of Git, logs, screenshots and client bundles. Rotate any credential confirmed exposed; merely finding an ignored local secret does not prove exposure.

Strict Zod schemas validate server input and structured AI results. Database constraints provide another boundary for stored data. Answer, upload, body and output limits constrain resource usage. AI prompts treat profile/resume/answer text as untrusted data. The model has no tools or database access. Prompt instructions reduce manipulation but are not a complete prompt-injection guarantee.

Shared PostgreSQL quota reservations provide per-user and global limits across Vercel instances. A missing quota RPC fails closed. Safe error messages avoid provider/SQL details. Markdown blocks HTML, images and generated links. Personalized server responses are private/no-store.

## Limits and required operational work

- Production schema, RLS, Auth settings and backups have not been inspected or changed.
- Supabase email delivery, session expiry, password enforcement and abuse protection need project configuration and integration testing.
- Anonymous accounts can evade per-user quotas by creating new identities. The global budget limits spend but can be deliberately exhausted. Supabase's anonymous auth limits and CAPTCHA/WAF protections should be reviewed before rollout; CAPTCHA is not implemented in this UI.
- Authenticated clients can reserve quota directly, causing denial of service within the global budget. There is no claim of bot-proof protection.
- Owners can modify their own practice metrics/cache via the Data API. Scores are personal estimates, not trusted certificates.
- Streamed Markdown is bounded and rendered safely, but its coaching semantics cannot be fully validated. Structured score/feedback validation only verifies shape/ranges.
- Audio, text responses, relevant profile fields, JD and resume text are sent to Gemini for their respective operations. No audio or resume files are persisted by this app. Transcripts and critiques are saved in Supabase; review retention and privacy notices.
- Failed transcription requests can continue until timeout after the user changes answers. In-memory pending saves can be lost on navigation.
- pdf-parse uses an older PDF parser. It is restricted to bounded files/pages but still needs malformed-file testing and future parser review.
- PKCE verification links depend on the initiating browser.
- Dependency advisories must be reviewed separately from passing tests. Do not use force upgrades.

## Release checks

Never deploy the auth-enforcing code against a database without compatible policies, constraints and RPCs. Use a separate project and preview first. Test two-user isolation through real JWTs, browser account flows, stream cancellation, microphone lifecycle, parser failures and quota exhaustion. Keep logs free of credentials/content and validate both logged-in and logged-out responses are not shared-cached.

## Dependency review (2026-10-03)

Next.js and eslint-config-next are pinned to 16.3.6; this clears the critical next/og ImageResponse advisory reported for 16.3.5. The application does not use next/og, but the framework was patched anyway. npm audit still reports five high findings in the ESLint glob dependency chain: braces, micromatch, fast-glob, @next/eslint-plugin-next and eslint-config-next. Do not use the suggested major downgrade/force fix. Review compatible transitive patches and upstream resolution before release. These are development/build dependencies, rather than evidence of an exposed application endpoint.

References: [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [brace-expansion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7).

Compatible brace-expansion patches (1.1.21 and 5.0.12) were subsequently installed. The remaining five audit entries stem from the unpatched braces advisory. See integration.md for development-project preflight results.
