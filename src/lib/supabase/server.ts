import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
import { AppError } from '../errors';
export async function serverSupabase() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, { cookies: {
    getAll: () => store.getAll(),
    setAll: values => {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* Server Components cannot set cookies; proxy refreshes them. */ }
    },
  } });
}
export async function requireUser() {
  const db = await serverSupabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AppError('Your session expired. Please sign in or continue as a guest.', 401);
  return { db, user: data.user };
}
