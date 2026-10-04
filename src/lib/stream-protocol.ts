import { z } from 'zod';
import { summarySchema } from './validation';
export const streamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(24000) }),
  z.object({ type: z.literal('result'), result: summarySchema }),
  z.object({ type: z.literal('error'), message: z.string().max(300) }),
]);
export async function readFeedback(response: Response, onText: (text: string) => void, signal: AbortSignal) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'The coach is unavailable. Please retry.');
  }
  if (!response.body) throw new Error('The coach returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', markdown = '', result;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      if (pending.length > 100000) throw new Error('Invalid feedback stream.');
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!line) continue;
        const event = streamEvent.parse(JSON.parse(line));
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'text') {
          markdown += event.text;
          if (markdown.length > 24000) throw new Error('Feedback exceeded the allowed size.');
          onText(markdown);
        } else result = event.result;
      }
      if (chunk.done) break;
    }
    if (pending.trim() || !result) throw new Error('Feedback was interrupted. Please retry.');
    return { markdown, result };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
