"use client";
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ensureUser } from '@/lib/auth';
import { useAuth } from './AuthProvider';
export function AuthStatus() {
  const [error, setError] = useState(false);
  const router = useRouter(), pathname = usePathname();
  const { loading, user, error: authError, refresh } = useAuth();
  useEffect(() => {
    let active = true;
    if (!pathname.startsWith('/auth') && pathname !== '/account' && !loading && !user && !authError) {
      void ensureUser().then(async () => {
        if (active) { await refresh(); router.refresh(); }
      }).catch(() => { if (active) setError(true); });
    }
    return () => { active = false; };
  }, [pathname, router, loading, user, authError, refresh]);
  const failed = authError || (error && !user);
  return <Link href="/auth" className={failed ? 'text-amber-400' : 'text-gray-400 hover:text-white'}>{failed ? 'Sign in to continue' : 'Account'}</Link>;
}
