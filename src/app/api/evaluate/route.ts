import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { question, answer, contextJd } = await req.json();

    if (!answer || answer.trim().length < 10) {
      return new Response("Invalid request", { status: 400 });
    }

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{ text: `Evaluate my answer to this interview question.\n\nQuestion: "${question}"\n\nMy Answer:\n"${answer}"\n\n${contextJd && contextJd.length > 5 ? `\n\nTARGET JOB DESCRIPTION:\n${contextJd}\nEvaluate my answer against the requirements of this job description.` : ""}` }],
        },
      ],
      config: {
        systemInstruction: `You are an expert technical and behavioral interviewer and communication coach.
Your goal is to provide fast, progressive, structured, and actionable interview feedback using Markdown.
Focus on: directness, STAR method storytelling, relevance, evidence, conciseness, grammar, and fluency.
Use clear headings (e.g., ## Overall Assessment, ## What Was Missing, ## Grammar & Fluency, ## Better Example, ## Follow-Up Question).
Keep explanations concise. Use examples where useful.
Do not fabricate metrics. Base all feedback strictly on the provided answer.
Output clean Markdown. Start with the most important feedback immediately.`,
        temperature: 0.3,
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
