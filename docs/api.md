# API and server actions

## HTTP routes

| Route | Method | Input | Identity / authorization |
| --- | --- | --- | --- |
| /api/analyze | POST | segmentText, mode, optional contextJd | Verified session; reads own profile; quota cost 2 |
| /api/evaluate | POST | question, answer, optional contextJd | Verified session; reads own profile; quota cost 2 |
| /auth/callback | GET | PKCE code, allowlisted next | Exchanges authorization code; no arbitrary redirect |

Both coaching endpoints use strict schemas and reject browser-supplied userId. JSON bodies are capped at 150 KB; answers at 12,000 characters; job context at 20,000. They check an Origin header when provided. Missing Origin is allowed for non-browser clients; it does not bypass session verification. Responses use private/no-store caching.

## Coaching stream contract

Content type is application/x-ndjson. Each line is one JSON event:

- text: a bounded Markdown fragment.
- result: validated score, biggest_weakness, fix and dimension array.
- error: a safe user-facing message.

The client validates frames and requires a final result. Markdown disables raw HTML, remote images and generated hyperlinks. HTTP errors include 400 invalid input, 401 unauthenticated, 403 origin, 413 body size, 415 content type, 429 quota and 503 unavailable services. After streaming starts, errors are events because HTTP status has already been sent.

## Server actions

| Action | Input and limits | Operation |
| --- | --- | --- |
| saveProfile | Bounded profile object | Upserts verified owner's profile |
| savePracticeSession | UUID, valid mode, timings <=4 hours, <=50 feedbacks | Atomic own-session RPC; retryable |
| generateTotalInsights | No browser history/identity | Queries own latest 200 sessions; validated/cacheable output; cost 1 |
| generateInterviewQuestions | JD 10-20,000 chars; focus enum; optional resume <=2 MB | Five validated questions; cost 1 |
| transcribeAudio | Allowed audio MIME; bounded Base64/decoded <=2 MB | Bounded plain text transcription; cost 1 |

All actions call verified server authentication. Next.js provides its server-action origin checks and a 3 MB body limit. Resume extraction supports PDF (up to 20 pages), DOCX with bounded ZIP decompression, and UTF-8 text; extracted text is limited to 20,000 characters.

Neither auth refresh nor profile/session storage consumes AI units. Cache hits consume no AI units. There is no public history endpoint, storage bucket, upload persistence endpoint, or administrative API.

## Errors and cancellation

Unexpected server errors log only operation/category, with generic responses. Transcripts, credentials, file contents and raw provider/database errors are not logged. Stream disconnect, timeout or client abort cancels model streaming. Server-action transcription has a 45-second timeout; changing answers discards stale results but cannot cancel an already-running server action.
