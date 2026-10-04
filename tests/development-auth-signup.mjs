import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const target = 'https://dekorxyetwpgpyjeypfq.supabase.co';
assert.equal(process.argv[2], target);
const env = parseEnv(readFileSync('.env.integration.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, target);
const guardedFetch = (url, options = {}) => { assert.equal(new URL(url).origin, target); return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) }); };
const client = (key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY) => createClient(target, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: guardedFetch } });
const admin = client(env.SUPABASE_SECRET_KEY), checks = [], users = [];
const ok = result => { if (result.error) { const error = new Error('Development operation failed'); error.code = result.error.code || result.error.status; throw error; } return result.data; };
const checked = async (name, test) => { try { await test(); checks.push({ name, status: 'passed' }); } catch (error) { checks.push({ name, status: 'failed', code: error.code || 'assertion' }); } console.log(name + ': ' + checks.at(-1).status); };
try {
  const guest = client();
  const guestSession = ok(await guest.auth.signInAnonymously()).session;
  users.push(guestSession.user.id);
  await checked('Guest receives real authenticated anonymous JWT', async () => {
    const claims = JSON.parse(Buffer.from(guestSession.access_token.split('.')[1], 'base64url'));
    assert.equal(claims.role, 'authenticated'); assert.equal(claims.is_anonymous, true);
    assert.equal(ok(await guest.auth.getUser()).user.id, guestSession.user.id);
  });
  const sid = randomUUID();
  await checked('Authenticated guest can save and read own practice', async () => {
    assert.equal(ok(await guest.rpc('save_practice_session', { p_session: { id: sid, mode: 'conversation', duration_ms: 1, speaking_time_ms: 0, feedbacks: [] } })), sid);
    assert.equal(ok(await guest.from('sessions').select('user_id').eq('id', sid))[0].user_id, guestSession.user.id);
  });
  const email = 'coach-signup-' + randomUUID() + '@example.test';
  const password = randomBytes(24).toString('base64url');
  const link = ok(await admin.auth.admin.generateLink({ type: 'signup', email, password }));
  users.push(link.user.id);
  await checked('Unverified signup cannot password-login', async () => assert.equal((await client().auth.signInWithPassword({ email, password })).error?.code, 'email_not_confirmed'));
  const signup = client();
  await checked('Generated signup token verifies email and returns session', async () => {
    const data = ok(await signup.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'signup' }));
    assert.ok(data.session); assert.equal(data.user.id, link.user.id); assert.ok(data.user.email_confirmed_at);
  });
  await checked('Verified signup can set password and sign in', async () => {
    const nextPassword = randomBytes(24).toString('base64url');
    ok(await signup.auth.updateUser({ password: nextPassword })); ok(await signup.auth.signOut());
    assert.equal(ok(await signup.auth.signInWithPassword({ email, password: nextPassword })).user.id, link.user.id);
  });
  await checked('Registered user cannot see guest practice', async () => assert.deepEqual(ok(await signup.from('sessions').select('id').eq('id', sid)), []));
  await checked('Confirmation token cannot be replayed', async () => assert.ok((await client().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'signup' })).error));
  await checked('Guest session refresh retains identity', async () => assert.equal(ok(await guest.auth.refreshSession()).user.id, guestSession.user.id));
} catch (error) { checks.push({ name: 'Signup integration setup', status: 'failed', code: error.code || 'assertion' }); }
finally {
  for (const id of users) await checked('Clean up new signup/guest fixture', async () => ok(await admin.auth.admin.deleteUser(id)));
  const report = { project: target, checks, limitations: ['Generated signup links test Supabase email verification without sending email.', 'Guest-to-email conversion through updateUser and browser PKCE callback remain unverified; this test does not simulate email delivery.', 'Development anonymous sign-in and manual linking settings were enabled with explicit approval.'], productionAccess: false };
  writeFileSync('scratch/development-auth-signup.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(c => c.status === 'passed').length, failures: checks.filter(c => c.status === 'failed') }));
  if (checks.some(c => c.status === 'failed')) process.exitCode = 1;
}
