"use server";
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { consumeQuota } from '@/lib/quota';
import { generateJson } from '@/lib/ai';
import { questionsSchema } from '@/lib/validation';
import { extractResume } from '@/lib/resume';
import { publicError } from '@/lib/errors';
import { transcribeAudio as transcribe } from '../actions';
export async function generateInterviewQuestions(formData: FormData) {
  try {
    const input = z.object({ jobDescription: z.string().trim().min(10).max(20000), focus: z.enum(['Behavioral','Technical','Mixed']) }).parse({ jobDescription: formData.get('jobDescription'), focus: formData.get('focus') });
    const { db } = await requireUser();
    const upload = formData.get('resumeFile');
    const resume = await extractResume(upload instanceof File ? upload : null);
    await consumeQuota(db);
    return await generateJson(questionsSchema, 'Generate exactly five challenging but fair interview questions for the provided focus, role and optional resume. Return a JSON array of question strings.', { ...input, resume });
  } catch (error) { return { serverError: publicError(error, 'interview-questions').message }; }
}
export async function transcribeAudio(base64Audio: string, mimeType = 'audio/webm') { return transcribe(base64Audio, mimeType); }
