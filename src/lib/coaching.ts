import 'server-only';
import { analyzeInput, evaluateInput, profileSchema, summarySchema } from './validation';
import { requireUser } from './supabase/server';
import { consumeQuota } from './quota';
import { aiClient, COACH_MODEL, dataInstruction, generateJson } from './ai';
import { AppError, publicError } from './errors';

export async function coachingResponse(req: Request, interview: boolean) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) throw new AppError('Request origin is not allowed.', 403);
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Expected JSON.', 415);
    const { db, user } = await requireUser();
    if (Number(req.headers.get('content-length') || 0) > 150000) throw new AppError('Request is too large.', 413);
    const reader = req.body?.getReader();
    if (!reader) throw new AppError('Missing request body.');
    let raw = '', bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 150000) throw new AppError('Request is too large.', 413); raw += decoder.decode(value, { stream: true }); }
      raw += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new AppError('Invalid JSON.'); }
    const input = interview ? evaluateInput.parse(body) : analyzeInput.parse(body);
    const { data: profile, error } = await db.from('profiles').select('preferred_name,target_role,career_goal,experience_level').eq('id', user.id).maybeSingle();
    if (error) throw new AppError('Profile context is unavailable. Please retry.', 503);
    const context = profile ? profileSchema.parse(profile) : null;
    await consumeQuota(db, 2);
    const cancel = new AbortController();
    const signal = AbortSignal.any([req.signal, cancel.signal, AbortSignal.timeout(90000)]);
    const instruction = interview
      ? 'You are an expert interview coach. Assess directness, STAR structure, relevance, evidence, grammar and fluency. Use concise Markdown headings: Overall Assessment, What Was Missing, Grammar & Fluency, Better Example. Start with the most important feedback.'
      : 'You are an expert communication coach. Assess the supplied training mode. Use concise Markdown headings: Overall Feedback, Grammar, Natural English, Fluency, Top Improvements. Start with the most important feedback.';
    const response = await aiClient().models.generateContentStream({ model: COACH_MODEL, contents: JSON.stringify({ ...input, profile: context }), config: { systemInstruction: dataInstruction + '\n' + instruction, maxOutputTokens: 4096, temperature: 0.3, abortSignal: signal } });
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
        try {
          let markdown = '';
          for await (const chunk of response) {
            signal.throwIfAborted();
            if (!chunk.text) continue;
            markdown += chunk.text;
            if (markdown.length > 24000) throw new AppError('Feedback exceeded the allowed size.', 502);
            send({ type: 'text', text: chunk.text });
          }
          if (!markdown.trim()) throw new AppError('The coach returned an empty response.', 502);
          const result = await generateJson(summarySchema, 'Evaluate the same response and produce its integer score (0-100), single biggest weakness, actionable fix and applicable dimension scores. Use the supplied critique consistently. Return only the required JSON. Scores are subjective coaching estimates.', { input, critique: markdown }, signal);
          send({ type: 'result', result });
        } catch (error) { if (!closed && !req.signal.aborted) send({ type: 'error', message: publicError(error, 'coaching-stream').message }); }
        finally { if (!closed) { closed = true; controller.close(); } cancel.abort(); }
      },
      cancel() { closed = true; cancel.abort(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const failure = publicError(error, 'coaching-request');
    return Response.json({ error: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store', ...(failure.status === 429 ? { 'Retry-After': '60' } : {}) } });
  }
}
