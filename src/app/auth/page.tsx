"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { ensureUser } from '@/lib/auth';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
export default function AccountPage() {
  const [mode, setMode] = useState<'login'|'signup'|'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  useEffect(() => { if (new URLSearchParams(window.location.search).has('error')) queueMicrotask(() => setMessage('This verification link could not be used. Open it in the browser where you requested it, or request a new link.')); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const address = z.email().max(254).parse(email.trim());
      const redirect = window.location.origin + '/auth/callback?next=/auth/update-password';
      if (mode === 'login') {
        z.string().min(1).max(128).parse(password);
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw new Error('Sign-in failed. Check your email and password, and verify your email.');
        setPassword(''); await auth.refresh();
        router.push('/profile'); router.refresh();
      } else if (mode === 'signup') {
        const user = await ensureUser();
        if (!user.is_anonymous) throw new Error('You already have an account. Sign out before creating another.');
        const { error } = await supabase.auth.updateUser({ email: address }, { emailRedirectTo: redirect });
        if (error) throw new Error('Account creation could not be completed. Please try again.');
        await auth.refresh();
        setMessage('Check your email to verify your address, then choose a password. Your guest practice stays with this account.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: redirect });
        if (error) throw new Error('The reset request could not be sent. Please try again later.');
        setMessage('If an account exists for this email, a password reset link will arrive shortly.');
      }
    } catch (error) { setMessage(error instanceof z.ZodError ? 'Enter a valid email and password.' : error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.auth.resend({ type: data.user?.is_anonymous ? 'email_change' : 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin + '/auth/callback?next=/auth/update-password' } });
    setMessage(error ? 'Verification could not be resent. Please try again later.' : 'If verification is pending, check your email.');
    setBusy(false);
  }
  async function logout() {
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.signOut();
    if (error) { setBusy(false); setMessage('Sign-out failed. Please retry.'); return; }
    for (const key of ['target_jd','target_focus','interview_questions','pacing_profile']) localStorage.removeItem(key);
    setEmail(''); setPassword(''); setMode('login'); await auth.refresh();
    router.refresh(); setBusy(false); setMessage('Signed out. You can sign in or continue with a new guest session.');
  }
  if (auth.loading) return <div className="max-w-lg mx-auto p-8" role="status">Checking your account…</div>;
  if (auth.error) return <div className="max-w-lg mx-auto p-8"><p role="alert">{auth.error}</p><button onClick={() => void auth.refresh()} className="text-blue-400 mt-4">Retry account verification</button><button onClick={logout} disabled={busy} className="block mt-4">Sign out</button></div>;
  if (auth.user && !auth.user.is_anonymous) return <div className="max-w-lg mx-auto p-8 text-gray-200">
    <h2 className="text-3xl font-semibold mb-6">Your Account</h2>
    <p className="font-semibold">Signed in</p><p className="mt-2 break-all">{auth.user.email}</p>
    <p className="mt-3">{auth.user.email_confirmed_at ? 'Email verified' : 'Email verification pending'}</p>
    <div className="flex flex-col gap-4 mt-6">
      <Link href="/auth/update-password" className="text-blue-400">Change password</Link>
      <Link href="/profile" className="text-blue-400">Professional and coaching profile</Link>
      <button disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.auth.resetPasswordForEmail(auth.user!.email!, { redirectTo: window.location.origin + '/auth/callback?next=/auth/update-password' }); setMessage(error ? 'The reset request could not be sent. Please try again later.' : 'Check your email for a password reset link.'); setBusy(false); }} className="text-blue-400">Send password reset email</button>
      {!auth.user.email_confirmed_at && <button disabled={busy} onClick={async () => { setBusy(true); const { error } = await supabase.auth.resend({ type: 'signup', email: auth.user!.email! }); setMessage(error ? 'Verification could not be resent.' : 'Check your email for verification.'); setBusy(false); }}>Resend account verification</button>}
      <button disabled={busy} onClick={logout} className="text-gray-400">{busy ? 'Please wait…' : 'Sign out'}</button>
    </div>
    {message && <p role="status" className="mt-4">{message}</p>}
  </div>;
  return <div className="max-w-lg mx-auto p-8 text-gray-200">
    <h2 className="text-3xl font-semibold mb-6">Your Account</h2>
    {auth.user?.is_anonymous && <p className="mb-6">You are practicing with a guest account. Create an account to keep access to your practice across devices.</p>}
    <div className="flex gap-4 mb-6">{(['login','signup','reset'] as const).map(value => <button key={value} disabled={busy} onClick={() => { setMode(value); setMessage(''); }} className={mode === value ? 'text-blue-400' : 'text-gray-400'}>{value === 'login' ? 'Sign in' : value === 'signup' ? 'Create account' : 'Reset password'}</button>)}</div>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="block w-full mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg" /></label>
      {mode === 'login' && <label>Password<input type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="block w-full mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg" /></label>}
      <button disabled={busy} className="p-3 bg-blue-600 rounded-lg disabled:opacity-50">{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Verify email and create account' : 'Send reset link'}</button>
    </form>
    {message && <p role="status" className="mt-4 text-gray-300">{message}</p>}
    <div className="flex flex-col gap-3 mt-6">
      <button disabled={busy || !z.email().safeParse(email.trim()).success} onClick={resend} className="text-blue-400">Resend verification email</button>
      {auth.user && <button disabled={busy} onClick={logout} className="text-gray-400">Sign out of guest account</button>}
      <button disabled={busy} onClick={async () => { setBusy(true); try { await ensureUser(); router.push('/'); router.refresh(); } catch { setMessage('Guest access is unavailable. Please sign in.'); } finally { setBusy(false); } }} className="text-gray-400">Continue practicing as a guest</button>
    </div>
  </div>;
}
