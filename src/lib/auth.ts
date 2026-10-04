import { supabase } from './supabase';

let pending: ReturnType<typeof establishUser> | null = null;
async function establishUser() {
  const { data, error } = await supabase.auth.getUser();
  if (data.user && !error) return data.user;
  const { data: local } = await supabase.auth.getSession();
  if (local.session) throw new Error("Your session could not be verified. Please sign in again or retry.");
  const result = await supabase.auth.signInAnonymously();
  if (result.error || !result.data.user) throw new Error('Guest access is unavailable. Please sign in or try again later.');
  return result.data.user;
}
export async function ensureUser() {
  if (!pending) pending = establishUser().finally(() => { pending = null; });
  return pending;
}
