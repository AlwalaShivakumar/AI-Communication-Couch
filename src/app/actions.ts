"use server";

import { GoogleGenAI } from "@google/genai";
import { supabase } from "@/lib/supabase";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// The structured output schema for the AI Communication Coach
const CoachingFeedbackSchema = z.object({
  languageCorrection: z.object({
    detected: z.boolean(),
    original: z.string().optional(),
    corrected: z.string().optional(),
    explanation: z.string().optional()
  }),
  naturalEnglish: z.object({
    detected: z.boolean(),
    original: z.string().optional(),
    betterVersion: z.string().optional(),
    explanation: z.string().optional()
  }),
  communicationIssue: z.object({
    detected: z.boolean(),
    title: z.string().optional(),
    description: z.string().optional(),
    whyItMatters: z.string().optional()
  }),
  coachingTip: z.string(),
  improvementAreas: z.array(z.object({
    area: z.string(),
    score: z.number(),
    status: z.enum(["good", "needs_improvement", "strong", "not_applicable"])
  })),
  overallScore: z.number().describe("Overall score for this response out of 100"),
  retryRequired: z.boolean(),
  retryInstruction: z.string().optional()
});

export type CoachingFeedback = z.infer<typeof CoachingFeedbackSchema>;

const getSystemInstruction = (mode: string) => {
  let modeSpecific = "Focus on natural spontaneous conversation.";
  
  switch(mode) {
    case "story":
      modeSpecific = "Focus heavily on Storytelling: analyze the Hook, Setup, Conflict, Escalation, Resolution, and Ending. Call out boring sections or lack of tension.";
      break;
    case "public_speaking":
      modeSpecific = "Focus on Public Speaking: analyze structure, clarity, depth, transitions, pacing, and audience engagement.";
      break;
    case "interview":
      modeSpecific = "Focus on Interview Preparation: evaluate behavioral answers, concise delivery, relevance, and confidence.";
      break;
    case "wit":
      modeSpecific = "Focus on Wit and Conversational Humor: evaluate clever observations, timing, contrast, but explicitly penalize forced or cringe humor.";
      break;
    case "explanation":
      modeSpecific = "Focus on Explanation: evaluate ability to explain difficult concepts simply, use of analogies, and concise conclusions.";
      break;
    case "qna":
      modeSpecific = "Focus on Q&A: evaluate directness of the answer, avoiding over-explanation, and handling unexpected angles.";
      break;
  }

  return `
You are an expert AI Communication Coach.
Your goal is to make the user progressively better at communicating confidently, correctly, naturally, clearly, persuasively, engagingly, and memorably.
You are demanding, direct, honest, and constructive. Never give empty praise.
If something is weak, explicitly say it is weak.

CURRENT TRAINING MODE: ${mode.toUpperCase()}
${modeSpecific}

Analyze the user's transcript segment. Identify the SINGLE most important weakness.
Do not overwhelm the user. Prioritize the biggest issue.

Provide your feedback strictly following the required JSON schema:
- score: 0-100
- biggestWeakness: What happened (one sentence/phrase)
- why: Why it matters
- fix: Actionable instruction
- retryPrompt: E.g., "Answer the same question in 30 seconds."
- improvedExample: A better way they could have said it.
`;
};

export async function analyzeCommunicationSegment(
  segmentText: string,
  mode: string = "conversation",
  contextJd?: string
): Promise<CoachingFeedback | { serverError: string } | null> {
  if (!segmentText || segmentText.trim().length < 5) return null;

  try {
    let profileContext = "";
    try {
      const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";
      const { data: { user } } = await supabase.auth.getUser();
      const activeUserId = user?.id || MVP_USER_ID;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeUserId)
        .single();
        
      if (profile && (profile.target_role || profile.career_goal || profile.experience_level)) {
        profileContext = `
USER PROFILE CONTEXT:
- Target Role: ${profile.target_role || "Not specified"}
- Experience Level: ${profile.experience_level || "Not specified"}
- Career Goal: ${profile.career_goal || "Not specified"}
Tailor your feedback appropriately (e.g. use executive language if they are aiming for a senior role).
`;
      }
    } catch (e) {
      console.error("Failed to fetch profile for context:", e);
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: `Analyze the following spoken segment:\n\n"${segmentText}"\n\n${profileContext}${contextJd && contextJd.length > 5 ? `\n\nTARGET JOB DESCRIPTION:\n${contextJd}\nEvaluate the user's response against the requirements of this job description.` : ""}` }],
        },
      ],
      config: {
        systemInstruction: `You are an elite AI Communication Coach.
Your goal is to provide highly specific, actionable coaching to improve the user's communication.
Do not over-correct natural conversation variations or minor speech disfluencies.
Focus on: Language Correction, Natural English, and Communication Strategy.

The current training mode is: ${mode.toUpperCase()}
Base your primary communication feedback on this mode's specific criteria:
- CONVERSATION: Natural English, Fluency, Confidence, Clarity, Relevance, Response quality, Conciseness, Spontaneous thinking.
- STORYTELLING: Hook, Setup, Conflict, Escalation, Emotion, Turning point, Resolution, Meaning, Memorable ending, Pacing, Wit.
- PUBLIC SPEAKING: Opening, Structure, Confidence, Voice, Pace, Pauses, Audience engagement, Storytelling.
- INTERVIEW: Directness, Relevance, Confidence, Structure, STAR-style storytelling, Evidence/examples, Conciseness.
- WIT: Spontaneity, Timing, Cleverness, Observational humor, Wordplay, Natural delivery.
- EXPLANATION: Logical thinking, Clarity, Simplicity, Structure, Analogies, Examples, Removing complexity.
- Q&A: Thinking speed, Understanding the question, Direct response, Handling pressure, Avoiding rambling.

Always return strict JSON conforming exactly to the requested schema. Ensure \`coachingTip\` is actionable and memorable. If the user's answer is good, don't invent unnecessary criticism.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            languageCorrection: {
              type: "OBJECT",
              properties: {
                detected: { type: "BOOLEAN" },
                original: { type: "STRING" },
                corrected: { type: "STRING" },
                explanation: { type: "STRING" }
              }
            },
            naturalEnglish: {
              type: "OBJECT",
              properties: {
                detected: { type: "BOOLEAN" },
                original: { type: "STRING" },
                betterVersion: { type: "STRING" },
                explanation: { type: "STRING" }
              }
            },
            communicationIssue: {
              type: "OBJECT",
              properties: {
                detected: { type: "BOOLEAN" },
                title: { type: "STRING" },
                description: { type: "STRING" },
                whyItMatters: { type: "STRING" }
              }
            },
            coachingTip: { type: "STRING" },
            improvementAreas: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  area: { type: "STRING" },
                  score: { type: "INTEGER" },
                  status: { type: "STRING" } // "good", "needs_improvement", "strong", "not_applicable"
                }
              }
            },
            overallScore: { type: "INTEGER" },
            retryRequired: { type: "BOOLEAN" },
            retryInstruction: { type: "STRING" }
          },
          required: ["languageCorrection", "naturalEnglish", "communicationIssue", "coachingTip", "improvementAreas", "overallScore", "retryRequired"]
        },
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    if (response.text) {
      let cleaned = response.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
      try {
        const { jsonrepair } = await import('jsonrepair');
        const repaired = jsonrepair(cleaned.trim());
        const parsed = JSON.parse(repaired) as CoachingFeedback;
        return parsed;
      } catch (parseError: any) {
        console.error("Failed to parse or repair Gemini JSON. Raw text:", response.text);
        throw parseError;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error("AI Analysis failed:", error);
    const errorMessage = error?.message || "Unknown AI Analysis failure";
    return { serverError: `Gemini analysis failed: ${errorMessage}` };
  }
}

const ComparisonFeedbackSchema = z.object({
  didImprove: z.boolean().describe("Whether the user actually fixed the problem from Attempt 1"),
  whatImproved: z.string().describe("What improved in Attempt 2 compared to Attempt 1"),
  whatRemainsWeak: z.string().describe("What still needs work"),
  newScore: z.number().describe("The score for Attempt 2 out of 100")
});

export type ComparisonFeedback = z.infer<typeof ComparisonFeedbackSchema>;

export async function compareAttempts(
  previousAttempt: string,
  newAttempt: string,
  previousFeedback: CoachingFeedback,
  mode: string = "conversation"
): Promise<ComparisonFeedback | { serverError: string } | null> {
  if (!previousAttempt || !newAttempt) return null;

  const previousTip = previousFeedback.coachingTip || previousFeedback.communicationIssue?.description || previousFeedback.naturalEnglish?.betterVersion || "Try to communicate more clearly.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: `Compare these two attempts at answering/speaking.\n\nAttempt 1: "${previousAttempt}"\n\nPrevious Feedback Given: "${previousTip}"\n\nAttempt 2: "${newAttempt}"\n\nDid the user follow the feedback? What improved? What remains weak?` }],
        },
      ],
      config: {
        systemInstruction: `You are an AI Communication Coach evaluating a retry attempt.
The user is in ${mode.toUpperCase()} mode. Compare Attempt 2 to Attempt 1.
Check if they actually improved based on the previous feedback.
Provide your response strictly in the requested JSON format.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            didImprove: { type: "BOOLEAN" },
            whatImproved: { type: "STRING" },
            whatRemainsWeak: { type: "STRING" },
            newScore: { type: "INTEGER" }
          },
          required: ["didImprove", "whatImproved", "whatRemainsWeak", "newScore"]
        },
        temperature: 0.3,
      },
    });

    if (response.text) {
      let cleaned = response.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
      try {
        const { jsonrepair } = await import('jsonrepair');
        const repaired = jsonrepair(cleaned.trim());
        return JSON.parse(repaired) as ComparisonFeedback;
      } catch (err) {
        console.error("Comparison parse failed. Raw:", response.text);
        throw err;
      }
    }
    return null;
  } catch (error: any) {
    console.error("AI Comparison failed:", error);
    const errorMessage = error?.message || "Unknown AI Comparison failure";
    return { serverError: `Gemini comparison failed: ${errorMessage}` };
  }
}



export async function generateTotalInsights(historicalData: any) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: "Analyze this historical communication data and generate an action plan and hidden patterns. Data: \n\n" + JSON.stringify(historicalData) }],
        },
      ],
      config: {
        systemInstruction: "You are an AI Analytics Engine. Analyze the historical session data and extract deep patterns, strengths, weaknesses, and a recommended action plan. Return ONLY JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            hiddenPatterns: { type: "ARRAY", items: { type: "STRING" } },
            stop: { type: "STRING" },
            start: { type: "STRING" },
            continue: { type: "STRING" },
            focus: { type: "STRING" },
            exercises: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["hiddenPatterns", "stop", "start", "continue", "focus", "exercises"]
        },
        temperature: 0.2,
      },
    });

    if (response.text) {
      let cleaned = response.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
      try {
        const { jsonrepair } = await import('jsonrepair');
        const repaired = jsonrepair(cleaned.trim());
        return JSON.parse(repaired);
      } catch (err) {
        console.error("Parse failed. Raw:", response.text);
        throw err;
      }
    }
    return null;
  } catch (error: any) {
    console.error("AI Insights generation failed:", error);
    return null;
  }
}


export async function generateSessionDimensions(feedbacks: any[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: "Analyze these communication transcripts and feedbacks for a single practice session: \n\n" + JSON.stringify(feedbacks) }],
        },
      ],
      config: {
        systemInstruction: "You are an AI Coach scoring a user. Evaluate their performance across 9 dimensions out of 100 based on the provided session data. If a dimension is not applicable (e.g., Body Language if there is no video data mentioned), score it 0 or omit it. The 9 dimensions: Grammar, Natural English, Fluency, Confidence, Storytelling, Logical Thinking, Filler Words, Public Speaking, Body Language. Return JSON array of objects with 'dimension' (string) and 'score' (number).",
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              dimension: { type: "STRING" },
              score: { type: "INTEGER" }
            },
            required: ["dimension", "score"]
          }
        },
        temperature: 0.1,
      },
    });

    if (response.text) {
      let cleaned = response.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
      try {
        const { jsonrepair } = await import('jsonrepair');
        const repaired = jsonrepair(cleaned.trim());
        return JSON.parse(repaired);
      } catch (err) {
        console.error("Parse failed. Raw:", response.text);
        throw err;
      }
    }
    return [];
  } catch (error: any) {
    console.error("Failed to generate dimensions:", error);
    return [];
  }
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = "audio/webm"
): Promise<{ transcript?: string; serverError?: string }> {
  const { transcribeAudio: transcribe } = await import("./interview/actions");
  return transcribe(base64Audio, mimeType);
}

