# AI Communication Coach

A Next.js application for communication practice and mock interviews. It streams Gemini coaching feedback, transcribes short recordings, generates five interview questions from a job description and optional resume, and stores personal practice history in Supabase.

## Release status

This branch introduces authenticated guests, account flows, ownership policies and database quotas. **Do not deploy it against the current database yet.** The production schema, policies and data have not been inspected. The SQL migration is a local draft, and intentionally refuses to run without a backup-review acknowledgement. No live database changes are part of this work.

## Stack and structure

Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL, Google Gemini, Zod, Recharts, Mammoth (DOCX) and pdf-parse.

- `src/app`: pages, account routes, server actions and two coaching endpoints.
- `src/components`: practice interfaces, navigation and safe Markdown rendering.
- `src/lib`: auth clients, validation, AI processing, quotas, recording and history.
- `supabase/migrations`: draft database migration.
- `tests`: validation, recording/stream and isolated PostgreSQL tests.
- `docs`: architecture, auth, security, database, API and deployment guides.

## Requirements and installation

Use Node.js 22 or newer and npm. Install from the lockfile:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On Windows, copy the example with your file manager or PowerShell. Fill in the environment values for a **development** Supabase project and Gemini key. Never commit credentials.

| Variable | Purpose | Browser exposure |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL | Public |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Publishable key or legacy anon JWT | Public |
| GEMINI_API_KEY | Server-side Gemini requests | Private |

The existing variable name ANON_KEY is retained for deployment compatibility. A publishable key is supported. A service-role key is neither required nor used; remove the old unused server secret from future deployment configuration after reviewing any external consumers.

## Database and authentication setup

Start with a separate development project. Follow [database.md](docs/database.md) before reviewing the draft migration. Enable anonymous sign-in, email/password auth, email confirmation and manual identity linking. Configure redirects and email delivery as described in [authentication.md](docs/authentication.md). These project settings are not changed by source code.

The guest experience creates a real Supabase anonymous user. Creating an account verifies an email and then sets a password while retaining that user's ID. Signing into an existing account does not merge guest history. Legacy editable guest IDs are never accepted as proof of ownership.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:production
```

Tests run an isolated PostgreSQL engine in memory; they do not connect to Supabase. test:production rebuilds with isolated loopback service settings and checks unauthenticated HTTP boundaries. The resulting local build uses test configuration; rebuild with the intended environment before serving it to users. Provider responses, email delivery, real Supabase Auth and browser microphone behavior still require development/preview testing.

## Deployment and security

Vercel uses the normal Next.js build; there is no vercel.json. Coaching routes run on Node.js with a 120-second maximum duration. Server actions have a 3 MB transport limit; uploads and recordings are separately limited to 2 MB. AI calls require authenticated sessions and database quota reservations.

Read [deployment.md](docs/deployment.md) for the release sequence and checklist, and [security.md](docs/security.md) for controls and limitations. Feedback scores are subjective practice estimates, not certified assessments. Recordings, resumes and responses used for AI processing are sent to Google; audio and resume files are not stored by this application.
