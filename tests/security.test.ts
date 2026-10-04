import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInput, evaluateInput, summarySchema, sessionInput, audioInput } from '../src/lib/validation';
import { readFeedback } from '../src/lib/stream-protocol';
const summary = { score: 0, biggest_weakness: 'Structure', fix: 'Lead with the answer', dimensions: [{dimension:'Grammar',score:0}] };
test('rejects supplied identities, wrong types and oversized input', () => {
 assert.equal(analyzeInput.safeParse({segmentText:'A valid response',userId:'someone'}).success,false);
 assert.equal(analyzeInput.safeParse({segmentText:42}).success,false);
 assert.equal(analyzeInput.safeParse({segmentText:'x'.repeat(12001)}).success,false);
 assert.equal(analyzeInput.safeParse({segmentText:'A valid response',mode:'ignore instructions'}).success,false);
 assert.equal(evaluateInput.safeParse({question:'',answer:'A valid response'}).success,false);
});
test('validates scores and duplicate dimensions, including a legitimate zero', () => {
 assert.equal(summarySchema.safeParse(summary).success,true);
 assert.equal(summarySchema.safeParse({...summary,score:101}).success,false);
 assert.equal(summarySchema.safeParse({...summary,dimensions:[...summary.dimensions,...summary.dimensions]}).success,false);
});
test('rejects invalid audio and inconsistent timing', () => {
 assert.equal(audioInput.safeParse({base64Audio:'!'.repeat(100),mimeType:'audio/webm'}).success,false);
 assert.equal(sessionInput.safeParse({id:'00000000-0000-4000-8000-000000000001',mode:'interview',duration_ms:1,speaking_time_ms:2,feedbacks:[]}).success,false);
});
test('decodes split stream frames and requires a validated final result', async () => {
 const text = JSON.stringify({type:'text',text:'Feedback'})+'\n'+JSON.stringify({type:'result',result:summary})+'\n';
 const bytes = new TextEncoder().encode(text);
 const stream = new ReadableStream({start(c){for(const part of [bytes.slice(0,3),bytes.slice(3,22),bytes.slice(22)])c.enqueue(part);c.close();}});
 const result=await readFeedback(new Response(stream),()=>{},new AbortController().signal);
 assert.equal(result.markdown,'Feedback'); assert.equal(result.result.score,0);
 await assert.rejects(readFeedback(new Response(JSON.stringify({type:'text',text:'Partial'})+'\n'),()=>{},new AbortController().signal),/interrupted/);
});
test('propagates safe stream errors and cancellation', async () => {
 await assert.rejects(readFeedback(new Response(JSON.stringify({type:'error',message:'Retry later'})+'\n'),()=>{},new AbortController().signal),/Retry later/);
 const cancel=new AbortController();cancel.abort();
 await assert.rejects(readFeedback(new Response(''),()=>{},cancel.signal));
});
