import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServerClient } from '@supabase/ssr';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyDevelopmentApp({ target, env, a, b, sessionA, checked, ok }) {
  const guardPath = resolve('scratch/development-fetch-guard.mjs');
  writeFileSync(guardPath, `const original=globalThis.fetch;globalThis.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);if(u.origin!=='https://dekorxyetwpgpyjeypfq.supabase.co'&&!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('Non-development fetch blocked');return original(input,options);};`);
  const runtimeEnv = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: target, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, GEMINI_API_KEY: 'development-test-provider-disabled', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--import=' + pathToFileURL(guardPath).href };
  delete runtimeEnv.SUPABASE_SECRET_KEY; delete runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
  const finished = child => new Promise((resolveDone, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolveDone() : reject(new Error('Local application process failed'))); });
  await finished(spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: runtimeEnv, stdio: 'ignore' }));
  console.log('Development-configured application build: passed');
  const reserve = createServer(); await new Promise(done => reserve.listen(0, '127.0.0.1', done));
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  const base = 'http://127.0.0.1:' + port;
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: runtimeEnv, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      if (app.exitCode !== null) break;
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, 'Development application failed to start');
    const cookieFor = async fixture => {
      const cookies = new Map();
      const db = createServerClient(target, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)) } });
      ok(await db.auth.setSession(fixture.session));
      return Array.from(cookies, ([name, value]) => name + '=' + value).join('; ');
    };
    const cookieA = await cookieFor(a), cookieB = await cookieFor(b);
    for (const route of ['/api/analyze', '/api/evaluate']) {
      const input = route.endsWith('analyze') ? { segmentText: 'Development test response only.', mode: 'conversation' } : { question: 'Development test question', answer: 'Development test response only.' };
      const post = (body, cookie) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
      await checked(route + ' rejects missing Auth session', async () => assert.equal((await post(input)).status, 401));
      await checked(route + ' rejects invalid Auth cookie', async () => assert.equal((await post(input, 'sb-dekorxyetwpgpyjeypfq-auth-token=base64-invalid')).status, 401));
      await checked(route + ' verified JWT rejects body userId', async () => assert.equal((await post({ ...input, userId: b.id }, cookieA)).status, 400));
    }
    const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
    const action = async (name, route, args, cookie) => {
      const id = Object.entries(manifest.node).find(([, value]) => value.exportedName === name)?.[0]; assert.ok(id);
      const response = await fetch(base + route, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(args) });
      assert.equal(response.status, 200); return response.text();
    };
    await checked('Server action saves profile under authenticated A identity', async () => {
      assert.match(await action('saveProfile', '/profile', [{ preferred_name: 'Integration A', target_role: '', career_goal: '', experience_level: '' }], cookieA), /"saved":true/);
      assert.equal(ok(await a.db.from('profiles').select('preferred_name').eq('id', a.id))[0].preferred_name, 'Integration A');
    });
    await checked('Profile action rejects browser ownership field', async () => assert.match(await action('saveProfile', '/profile', [{ id: b.id, preferred_name: 'ATTACK', target_role: '', career_goal: '', experience_level: '' }], cookieA), /serverError/));
    await checked('Profile action rejects missing authenticated session', async () => assert.match(await action('saveProfile', '/profile', [{ preferred_name: 'ATTACK', target_role: '', career_goal: '', experience_level: '' }]), /serverError/));
    await checked('Practice server action persists real authenticated session', async () => {
      const payload = { ...sessionA, id: randomUUID(), mode: 'conversation' };
      assert.match(await action('savePracticeSession', '/', [payload], cookieA), new RegExp(payload.id));
      assert.equal(ok(await a.db.from('sessions').select('user_id').eq('id', payload.id))[0].user_id, a.id);
    });
    await checked('Practice server action rejects missing session', async () => assert.match(await action('savePracticeSession', '/', [{ ...sessionA, id: randomUUID() }]), /serverError/));
    await checked('Practice server action cannot overwrite another owner', async () => assert.match(await action('savePracticeSession', '/', [sessionA], cookieB), /serverError/));
    await checked('Server-rendered history isolates real A and B cookies', async () => {
      const aPage = await (await fetch(base + '/insights', { headers: { Cookie: cookieA } })).text();
      const bPage = await (await fetch(base + '/insights', { headers: { Cookie: cookieB } })).text();
      assert.ok(aPage.includes(sessionA.id)); assert.ok(!bPage.includes(sessionA.id));
    });
    await checked('Cached insights server action is owner isolated', async () => {
      const marker = 'Only A development insight';
      ok(await a.db.from('profiles').update({ last_insights_cache: { hiddenPatterns: [marker], stop: '', start: '', continue: '', focus: '', exercises: [] }, last_insights_timestamp: new Date(Date.now() + 1000).toISOString() }).eq('id', a.id));
      assert.ok((await action('generateTotalInsights', '/insights', [], cookieA)).includes(marker));
      const bResult = await action('generateTotalInsights', '/insights', [], cookieB);
      assert.ok(!bResult.includes(marker));
    });
    await checked('Browser bundles contain no development privileged key', async () => {
      const scan = directory => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); if (entry.isDirectory()) scan(path); else if (entry.name.endsWith('.js')) assert.ok(!readFileSync(path, 'utf8').includes(env.SUPABASE_SECRET_KEY)); } };
      scan('.next/static');
    });
  } finally {
    if (app.exitCode === null && app.signalCode === null) { const stopped = new Promise(done => app.once('exit', done)); app.kill(); await stopped; }
  }
}
