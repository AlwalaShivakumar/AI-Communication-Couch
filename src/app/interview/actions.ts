"use server";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const InterviewQuestionsSchema = z.object({
  questions: z.array(z.string()).describe("A list of relevant interview questions")
});

export async function generateInterviewQuestions(formData: FormData): Promise<string[] | { serverError: string }> {
  try {
    const jobDescription = formData.get("jobDescription") as string;
    const focus = formData.get("focus") as string;
    const resumeFile = formData.get("resumeFile") as File | null;

    let resumeText = "";
    if (resumeFile) {
      const arrayBuffer = await resumeFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (resumeFile.type === "application/pdf" || resumeFile.name.endsWith(".pdf")) {
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const parsed = await pdfParse(buffer);
        resumeText = parsed.text;
      } else {
        resumeText = buffer.toString("utf-8");
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: `Generate 5 targeted interview questions based on the following:\n\nJob Description:\n${jobDescription}\n\nResume (optional):\n${resumeText || "No resume provided"}` }],
        },
      ],
      config: {
        systemInstruction: `You are an expert technical and behavioral interviewer. Generate challenging but fair interview questions tailored to the provided job description and resume. The focus of the questions should be heavily on ${focus} topics. Include a mix of behavioral (STAR method) and role-specific questions based on the selected focus.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            questions: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["questions"]
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
        const parsed = JSON.parse(repaired);
        return parsed.questions || [];
      } catch (err) {
        console.error("Interview Questions parse failed. Raw:", response.text);
        throw err;
      }
    }
    return [];
  } catch (error: any) {
    console.error("AI Interview Questions generation failed:", error);
    return { serverError: `Gemini interview questions failed: ${error.message}` };
  }
}

const InterviewEvaluationSchema = z.object({
  score: z.number().describe("Score out of 100 for the answer"),
  critique: z.string().describe("Direct, honest critique of the answer"),
  whatWasMissing: z.string().describe("Key points or evidence (like STAR method) that were missing"),
  betterExample: z.string().describe("A better, stronger way to answer the question"),
  followUpQuestion: z.string().optional().describe("A challenging follow-up question based on their answer (optional)")
});

export type InterviewEvaluation = z.infer<typeof InterviewEvaluationSchema>;

export async function evaluateInterviewAnswer(
  question: string,
  answer: string,
  contextJd?: string
): Promise<InterviewEvaluation | { serverError: string } | null> {
  if (!answer || answer.trim().length < 10) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: `Evaluate this interview answer.\n\nQuestion: "${question}"\n\nCandidate's Answer: "${answer}"${contextJd && contextJd.length > 5 ? `\n\nTARGET JOB DESCRIPTION:\n${contextJd}\nEvaluate the user's response against the requirements of this job description.` : ""}` }],
        },
      ],
      config: {
        systemInstruction: `You are an elite, strict Interview Coach evaluating a candidate's answer.
Focus on: Clarity, Relevance, Confidence, Structure, and use of Evidence (like the STAR method).
Do not be overly polite. If the answer is weak, generic, or rambles, say so.
Provide your response strictly in the requested JSON format.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            score: { type: "INTEGER" },
            critique: { type: "STRING" },
            whatWasMissing: { type: "STRING" },
            betterExample: { type: "STRING" },
            followUpQuestion: { type: "STRING" }
          },
          required: ["score", "critique", "whatWasMissing", "betterExample"]
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
        return JSON.parse(repaired) as InterviewEvaluation;
      } catch (err) {
        console.error("Interview Evaluation parse failed. Raw:", response.text);
        throw err;
      }
    }
    return null;
  } catch (error: any) {
    console.error("AI Interview Evaluation failed:", error);
    return { serverError: `Gemini interview evaluation failed: ${error.message}` };
  }
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = "audio/webm"
): Promise<{ transcript?: string; serverError?: string }> {
  if (!base64Audio || base64Audio.length < 50) {
    return { transcript: "" };
  }

  try {
    const cleanMime = mimeType.split(";")[0] || "audio/webm";
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: cleanMime,
              },
            },
            {
              text: "Transcribe the spoken words in this audio verbatim into plain, clean text. Return ONLY the transcribed words. If the audio is silent or contains only noise or breathing, return an empty response.",
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
      },
    });

    const text = response.text?.trim() || "";
    return { transcript: text };
  } catch (error: any) {
    console.error("AI audio transcription error:", error);
    return { serverError: error.message || "Transcription failed" };
  }
}
