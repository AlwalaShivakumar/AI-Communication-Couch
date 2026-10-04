"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
export default function UpdatePassword() {
  const [password,setPassword] = useState(''), [confirm,setConfirm] = useState(''), [message,setMessage] = useState(''), [busy,setBusy] = useState(false);
  const router = useRouter();
  return <form className="max-w-lg mx-auto p-8 flex flex-col gap-4" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    try {
      z.string().min(12).max(128).parse(password);
      if (password !== confirm) throw new Error('Passwords must match.');
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) throw new Error('Open a valid verification or reset link first.');
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw new Error('Password could not be updated. Please request another link.');
      router.replace('/profile'); router.refresh();
    } catch (error) { setMessage(error instanceof z.ZodError ? 'Use a password with 12 to 128 characters.' : error instanceof Error ? error.message : 'Please retry.'); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-3xl font-semibold">Choose your password</h2>
    <label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="block w-full mt-2 p-3 rounded-lg bg-gray-900 border border-gray-700" /></label>
    <label>Confirm password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="block w-full mt-2 p-3 rounded-lg bg-gray-900 border border-gray-700" /></label>
    <button disabled={busy} className="p-3 rounded-lg bg-blue-600 disabled:opacity-50">Save password</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
