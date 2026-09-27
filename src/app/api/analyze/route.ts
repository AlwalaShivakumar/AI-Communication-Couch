import { GoogleGenAI } from "@google/genai";
import { supabase } from "@/lib/supabase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { segmentText, mode, contextJd, userId } = await req.json();

    if (!segmentText || segmentText.trim().length < 5) {
      return new Response("Invalid request", { status: 400 });
    }

    let profileContext = "";
    if (userId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (profile && (profile.target_role || profile.career_goal || profile.experience_level)) {
          profileContext = `
USER PROFILE CONTEXT:
- Target Role: ${profile.target_role || "Not specified"}
- Experience Level: ${profile.experience_level || "Not specified"}
- Career Goal: ${profile.career_goal || "Not specified"}
`;
        }
      } catch (e) {
        console.error("Failed to fetch profile for context:", e);
      }
    }

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite", // Matches previous model, could also be gemini-2.5-flash
      contents: [
        {
          role: "user",
          parts: [{ text: `Analyze the following spoken response:\n\n"${segmentText}"\n\n${profileContext}${contextJd && contextJd.length > 5 ? `\n\nTARGET JOB DESCRIPTION:\n${contextJd}\nEvaluate the user's response against the requirements of this job description.` : ""}` }],
        },
      ],
      config: {
        systemInstruction: `You are an elite AI Communication Coach.
Your goal is to provide fast, progressive, structured, and actionable communication feedback using Markdown.
Focus heavily on grammar, fluency, natural English, vocabulary, storytelling, and public speaking.
Use clear headings (e.g., ## Overall Feedback, ## Grammar, ## Natural English, ## Fluency, ## Top Improvements).
Keep explanations concise. Use formats like:
### Your Sentence
...
### Better Version
...
### Explanation
...

Do not fabricate metrics. Base all feedback strictly on the provided text.
Do not wrap your entire response in a JSON block. Output clean Markdown.
Start with the most important feedback immediately. Never use generic motivational statements.`,
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
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff'
      }
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
