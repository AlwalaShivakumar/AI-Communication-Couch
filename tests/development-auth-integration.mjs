import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { verifyDevelopmentApp } from './development-app-boundaries.mjs';

const target = 'https://dekorxyetwpgpyjeypfq.supabase.co';
assert.equal(process.argv[2], target, 'Explicit development target required');
const env = parseEnv(readFileSync('.env.integration.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, target, 'Development configuration mismatch');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.startsWith('sb_publishable_'));
assert.ok(env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'));
const guardedFetch = (url, options = {}) => {
  assert.equal(new URL(url).origin, target, 'Non-development network request blocked');
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
};
const client = (key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY) => createClient(target, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: guardedFetch },
});
const admin = client(env.SUPABASE_SECRET_KEY), anonymous = client();
const checks = [], created = [];
const checked = async (name, test) => {
  try { await test(); checks.push({ name, status: 'passed' }); }
  catch (error) { checks.push({ name, status: 'failed', code: error.code || 'assertion' }); }
  console.log(name + ': ' + checks.at(-1).status);
};
const ok = result => { if (result.error) { const e = new Error('Supabase operation failed'); e.code = result.error.code || result.error.status; throw e; } return result.data; };
const denied = result => assert.ok(result.error || result.data?.length === 0, 'Unauthorized operation exposed or changed records');
const settings = await (await guardedFetch(target + '/auth/v1/settings', { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })).json();
const authConfiguration = { email: settings.external?.email, confirmationRequired: settings.mailer_autoconfirm === false, anonymous: settings.external?.anonymous_users };
let a, b, sessionA;
try {
  for (const label of ['A', 'B']) {
    const email = 'coach-integration-' + randomUUID() + '@example.test';
    const password = randomBytes(24).toString('base64url');
    const { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { integration_test: true } }));
    created.push(user.id);
    const db = client();
    const { session } = ok(await db.auth.signInWithPassword({ email, password }));
    assert.equal(session.user.id, user.id);
    const fixture = { db, id: user.id, email, password, session };
    if (label === 'A') a = fixture; else b = fixture;
  }
  await checked('Two real Auth users and password login', async () => assert.equal(created.length, 2));
  await checked('Real JWT identity verified by Auth service', async () => {
    for (const fixture of [a, b]) {
      const user = ok(await fixture.db.auth.getUser()).user;
      const claims = JSON.parse(Buffer.from(fixture.session.access_token.split('.')[1], 'base64url'));
      assert.equal(user.id, fixture.id); assert.equal(claims.sub, fixture.id);
      assert.equal(claims.role, 'authenticated'); assert.ok(claims.exp > Date.now() / 1000);
    }
  });
  await checked('Session refresh and persistence in a new client', async () => {
    const refreshed = ok(await a.db.auth.refreshSession()).session;
    assert.equal(refreshed.user.id, a.id);
    assert.notEqual(refreshed.refresh_token, a.session.refresh_token);
    a.session = refreshed;
    const persisted = client();
    ok(await persisted.auth.setSession({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token }));
    assert.equal(ok(await persisted.auth.getUser()).user.id, a.id);
  });
  await checked('Recovery token verification and password reset', async () => {
    const link = ok(await admin.auth.admin.generateLink({ type: 'recovery', email: b.email }));
    const recovered = client();
    ok(await recovered.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'recovery' }));
    const nextPassword = randomBytes(24).toString('base64url');
    ok(await recovered.auth.updateUser({ password: nextPassword }));
    ok(await b.db.auth.signOut());
    const oldLogin = await client().auth.signInWithPassword({ email: b.email, password: b.password });
    assert.ok(oldLogin.error);
    b.session = ok(await b.db.auth.signInWithPassword({ email: b.email, password: nextPassword })).session;
    b.password = nextPassword;
  });
  await checked('Own profiles saved', async () => {
    for (const fixture of [a, b]) ok(await fixture.db.from('profiles').upsert({ id: fixture.id, preferred_name: 'Integration ' + (fixture === a ? 'A' : 'B') }));
  });
  sessionA = { id: randomUUID(), mode: 'interview', duration_ms: 60000, speaking_time_ms: 30000, feedbacks: [{ transcript: 'Development isolation test response only.', score: 80, biggest_weakness: 'Test pacing', fix: 'Test pause', is_retry: false, retry_improvement: null, raw_feedback: 'Development fixture', dimensions: [{ dimension: 'Confidence', score: 80 }] }] };
  await checked('A saves interview, feedback and dimensions using real JWT RPC', async () => {
    assert.equal(ok(await a.db.rpc('save_practice_session', { p_session: sessionA })), sessionA.id);
    const rows = ok(await a.db.from('sessions').select('*,session_feedbacks(*),session_dimensions(*)').eq('id', sessionA.id));
    assert.equal(rows.length, 1); assert.equal(rows[0].user_id, a.id);
    assert.equal(rows[0].session_feedbacks.length, 1); assert.equal(rows[0].session_dimensions.length, 1);
    assert.equal(rows[0].overall_score, 80);
  });
  await checked('A idempotent save and own history', async () => {
    assert.equal(ok(await a.db.rpc('save_practice_session', { p_session: sessionA })), sessionA.id);
    const rows = ok(await a.db.from('sessions').select('id,session_feedbacks(id),session_dimensions(id)').eq('user_id', a.id));
    assert.equal(rows.length, 1); assert.equal(rows[0].session_feedbacks.length, 1);
  });
  if (process.argv.includes('--application')) await verifyDevelopmentApp({ target, env, a, b, sessionA, checked, ok });
  for (const [table, column, identity] of [['profiles', 'id', a.id], ['sessions', 'id', sessionA.id], ['session_feedbacks', 'session_id', sessionA.id], ['session_dimensions', 'session_id', sessionA.id]]) {
    await checked('B cannot read A ' + table, async () => assert.deepEqual(ok(await b.db.from(table).select('*').eq(column, identity)), []));
    const update = table === 'profiles' ? { preferred_name: 'ATTACK' } : table === 'sessions' ? { mode: 'story' } : { score: 1 };
    await checked('B cannot update A ' + table, async () => denied(await b.db.from(table).update(update).eq(column, identity).select()));
    await checked('B cannot delete A ' + table, async () => denied(await b.db.from(table).delete().eq(column, identity).select()));
    await checked('Anonymous cannot read ' + table, async () => assert.equal((await anonymous.from(table).select('*').limit(1)).error?.code, '42501'));
  }
  await checked('B history excludes A session', async () => assert.deepEqual(ok(await b.db.from('sessions').select('id,session_feedbacks(*),session_dimensions(*)')), []));
  await checked('B cannot forge session ownership on INSERT', async () => assert.equal((await b.db.from('sessions').insert({ id: randomUUID(), user_id: a.id, mode: 'interview', duration_ms: 1, speaking_time_ms: 0 })).error?.code, '42501'));
  await checked('B cannot forge profile ownership', async () => assert.ok((await b.db.from('profiles').upsert({ id: a.id, preferred_name: 'ATTACK' })).error));
  for (const table of ['session_feedbacks', 'session_dimensions']) {
    await checked('B cannot insert child under A ' + table, async () => {
      const row = table === 'session_dimensions' ? { session_id: sessionA.id, dimension: 'Grammar', score: 1 } : { session_id: sessionA.id, transcript: 'Unauthorized test insert', score: 1, biggest_weakness: '', fix: '', is_retry: false };
      assert.equal((await b.db.from(table).insert(row)).error?.code, '42501');
    });
  }
  await checked('RPC rejects browser-supplied user identity', async () => assert.equal((await b.db.rpc('save_practice_session', { p_session: { ...sessionA, id: randomUUID(), user_id: a.id } })).error?.code, '22023'));
  await checked('RPC cannot overwrite A session UUID', async () => assert.ok((await b.db.rpc('save_practice_session', { p_session: sessionA })).error));
  await checked('B own session uses B authenticated identity', async () => {
    const own = { ...sessionA, id: randomUUID() };
    ok(await b.db.rpc('save_practice_session', { p_session: own }));
    assert.equal(ok(await b.db.from('sessions').select('user_id').eq('id', own.id))[0].user_id, b.id);
    assert.equal((await b.db.from('sessions').update({ user_id: a.id }).eq('id', own.id)).error?.code, '42501');
  });
  await checked('Foreign attack attempts leave A records intact', async () => {
    const own = ok(await a.db.from('sessions').select('*,session_feedbacks(*),session_dimensions(*)').eq('id', sessionA.id))[0];
    assert.equal(own.mode, 'interview'); assert.equal(own.session_feedbacks[0].score, 80); assert.equal(own.session_dimensions[0].score, 80);
    assert.equal(ok(await a.db.from('profiles').select('preferred_name').eq('id', a.id))[0].preferred_name, 'Integration A');
  });
  await checked('Private quota inaccessible to normal clients', async () => {
    for (const db of [a.db, b.db, anonymous]) assert.ok((await db.schema('private').from('ai_quota').select('*')).error);
  });
  for (const name of ['save_practice_session', 'consume_ai_quota']) await checked('Anonymous RPC denied: ' + name, async () => assert.equal((await anonymous.rpc(name, name === 'consume_ai_quota' ? { p_cost: 1 } : { p_session: sessionA })).error?.code, '42501'));
  await checked('Quota rejects supplied user identity', async () => assert.ok((await b.db.rpc('consume_ai_quota', { p_cost: 1, user_id: a.id })).error));
  await checked('Quota counters isolate authenticated A and B', async () => {
    for (let i = 0; i < 6; i++) assert.equal(ok(await a.db.rpc('consume_ai_quota', { p_cost: 2 })), true);
    assert.equal(ok(await a.db.rpc('consume_ai_quota', { p_cost: 1 })), false);
    assert.equal(ok(await b.db.rpc('consume_ai_quota', { p_cost: 1 })), true);
  });
  await checked('Logout clears session and invalidates refresh token', async () => {
    const refresh = b.session.refresh_token;
    ok(await b.db.auth.signOut());
    assert.equal(ok(await b.db.auth.getSession()).session, null);
    assert.ok((await client().auth.refreshSession({ refresh_token: refresh })).error);
  });
} catch (error) {
  checks.push({ name: 'Integration setup or execution', status: 'failed', code: error.code || 'assertion' });
} finally {
  for (const id of created) await checked('Remove newly created test user and owned fixtures', async () => ok(await admin.auth.admin.deleteUser(id)));
  const report = { project: target, authConfiguration, checks, limitations: ['Confirmed test accounts are admin-provisioned: application signup and actual email delivery are not proven.', 'Recovery links are verified directly; email delivery and browser PKCE callback are not proven.', 'Quota reservations remain until normal database expiry/pruning; no AI provider called.', 'Signed-out access JWTs can remain valid until expiration; refresh is revoked.'], productionAccess: false };
  mkdirSync('scratch', { recursive: true });
  writeFileSync('scratch/development-auth-integration.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ project: target, authConfiguration, passed: checks.filter(c => c.status === 'passed').length, failed: checks.filter(c => c.status === 'failed') }, null, 2));
  if (checks.some(c => c.status === 'failed')) process.exitCode = 1;
}
