import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get('code');
  try {
  if (code && code.length <= 4096) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = url.searchParams.get('next') === '/auth/update-password' ? '/auth/update-password' : '/profile';
      return NextResponse.redirect(new URL(destination, url.origin), { headers: { 'Cache-Control': 'private, no-store' } });
    }
  }
  } catch { /* Invalid or expired links always return to the account page. */ }
  return NextResponse.redirect(new URL('/auth?error=verification', url.origin), { headers: { 'Cache-Control': 'private, no-store' } });
}
