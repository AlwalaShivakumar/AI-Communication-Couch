# 🎙️ SpeakCraft — AI Communication & Mock Interview Coach

> An intelligent, speech-first AI coaching platform that elevates your communication and interview skills through real-time speech transcription, STAR method evaluation, and personalized performance insights.

[![Next.js](https://img.shields.io/badge/Next.js-15.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Google Gemini API](https://img.shields.io/badge/Google_Gemini_AI-2.5-4285F4?style=flat&logo=google)](https://ai.google.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)

---

## 🌟 Overview

SpeakCraft is engineered to bridge the gap between preparing for conversations and executing them under pressure. Designed specifically for speech practice, it removes distracting video streams and focuses entirely on **verbal delivery, content structure, and pacing**.

Whether preparing for technical engineering interviews, executive presentations, or behavioral screening, SpeakCraft provides instantaneous, rubric-based feedback with audio playback so you can hear exactly how you sound to an interviewer.

---

## ✨ Key Features

### 🎯 1. JD & Resume-Aware Mock Interviews
- **Custom Question Generation**: Upload your resume (PDF or text) and paste a target Job Description. Google Gemini generates role-tailored interview questions.
- **Focus Modes**: Toggle between **Technical**, **Behavioral**, or **Mixed** question sets.
- **Difficulty & Context Matching**: Evaluates answers specifically against the criteria demanded by the target company and role.

### 🗣️ 2. Speech-First Live Practice Session
- **Real-Time Speech-to-Text**: Transcribes candidate answers live using the browser Web Speech API.
- **Audio Recording & Playback**: Automatically captures audio chunks via `MediaRecorder` and provides instant playback controls to listen to your voice and tone.
- **Voice Text-to-Speech (TTS)**: Questions are read aloud by an AI interviewer with instant replay and mute toggles.
- **Candidate-Controlled Flow**:
  - **Done Speaking — Analyze My Answer**: Explicit control over when evaluation starts.
  - **Retry Question**: Reset answer and immediately try again with fresh recording.
  - **Previous & Skip Controls**: Full control to navigate backward or forward across interview questions.
  - **Pause & Resume**: Pause listening and recording at any time without losing context.

### 🧠 3. STAR Framework & Granular Coaching
- **Objective Multi-Dimensional Scoring**: Evaluates clarity, relevance, confidence, and structure (0–100 score).
- **Actionable Critique**: Pinpoints the exact weakness in your response.
- **What Was Missing**: Highlights omitted metrics, context, or results (following the Situation, Task, Action, Result methodology).
- **Better Approach Example**: Provides a model answer demonstrating how to rephrase and elevate your points.
- **Adaptive Follow-Up Questions**: Generates follow-up challenges if an initial answer was incomplete.

### 📊 4. Insights & Long-Term Analytics
- **Historical Performance Tracking**: Aggregate overall scores, practice sessions, speaking time, and streaks.
- **Dimension Breakdown**: Track progress across Confidence, Conciseness, Clarity, Empathy, Pacing, and Structure.
- **Session History & Transcript Review**: Expand past sessions to inspect full spoken transcripts and AI recommendations.
- **One-Click Transcript Export**: Copy past transcripts directly to your clipboard.

### 🔒 5. Zero-Friction Guest Identity
- Instant access with auto-generated secure guest cookies (`guest_id`).
- No initial signup wall required to start practicing immediately.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies |
|---|---|
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) |
| **Artificial Intelligence** | [Google Gemini 2.5 API](https://ai.google.dev/) (`@google/genai`) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL + Guest Identity) |
| **Audio & Speech APIs** | Web Speech API (`webkitSpeechRecognition`, `SpeechSynthesis`), `MediaRecorder` |
| **File Parsing** | `pdf-parse` for automated resume text extraction |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: Version 18.18 or higher (Node 20+ recommended)
- **Package Manager**: `npm`, `pnpm`, or `yarn`
- **Browser**: **Google Chrome** or **Microsoft Edge** (recommended for full Web Speech API compatibility)
- **API Keys**:
  - [Google Gemini API Key](https://aistudio.google.com/)
  - [Supabase Project URL & Anon Key](https://supabase.com/)

---

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/your-username/speakcraft-ai-coach.git
   cd speakcraft-ai-coach
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the provided `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and insert your actual credentials:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

> ⚠️ **CRITICAL SECURITY NOTE**: Never commit `.env` or `.env.local` to Git! These files contain sensitive credentials and are strictly excluded via `.gitignore`.

---

### Database Setup (Supabase)

Execute the following SQL schema in your Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  name TEXT,
  target_role TEXT,
  bio TEXT,
  last_insights_cache JSONB,
  last_insights_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  mode TEXT NOT NULL,
  duration_ms BIGINT DEFAULT 0,
  speaking_time_ms BIGINT DEFAULT 0,
  overall_score INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session feedbacks table
CREATE TABLE IF NOT EXISTS session_feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  transcript TEXT,
  score INT,
  biggest_weakness TEXT,
  fix TEXT,
  is_retry BOOLEAN DEFAULT FALSE,
  retry_improvement INT,
  raw_feedback JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session dimensions table
CREATE TABLE IF NOT EXISTS session_dimensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Running the Application

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Google Chrome** or **Microsoft Edge**.

---

## 📁 Project Structure

```
├── public/                      # Static assets & icons
├── src/
│   ├── app/
│   │   ├── actions.ts           # Gemini API Server Actions (evaluations & dimensions)
│   │   ├── layout.tsx           # Global app layout with active navigation
│   │   ├── page.tsx             # Landing page & mode selection
│   │   ├── insights/
│   │   │   ├── page.tsx         # Performance dashboard (SSR data loader)
│   │   │   └── ProfileDashboardClient.tsx # Charts, history & streak analytics
│   │   ├── interview/
│   │   │   ├── actions.ts       # Interview question generator (JD & PDF resume)
│   │   │   ├── page.tsx         # Interview setup & difficulty selection
│   │   │   └── live/
│   │   │       └── page.tsx     # Mock interview session container
│   │   └── profile/
│   │       └── page.tsx         # User profile configuration
│   ├── components/
│   │   ├── InterviewLiveSession.tsx # Core interview simulator & audio recording engine
│   │   ├── LiveSession.tsx      # General communication coach
│   │   └── Navbar.tsx           # Navigation bar with responsive styling
│   └── lib/
│       ├── auth.ts              # Guest ID management (cookies)
│       └── supabase.ts          # Supabase client & type declarations
├── .env.example                 # Public environment template (safe to commit)
├── .gitignore                   # Comprehensive rule list protecting secrets
└── README.md                    # Project documentation
```

---

## 🛡️ Security & Best Practices

1. **Environment Variables**: API keys are accessed exclusively on the server side via Next.js Server Actions (`src/app/actions.ts`, `src/app/interview/actions.ts`), protecting your Gemini secret key from client-side exposure.
2. **Audio Data Privacy**: Audio recordings are handled in-memory using Object URLs (`URL.createObjectURL(blob)`) and are not sent to external servers unless explicitly configured.
3. **Repository Sanitation**: Any local test files, logs, and temporary build outputs are excluded via `.gitignore`.

---

## 📝 Available Scripts

- `npm run dev`: Start the development server at `localhost:3000`.
- `npm run build`: Create an optimized production build.
- `npm run start`: Run the compiled production application.
- `npm run lint`: Run ESLint to identify code issues.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
