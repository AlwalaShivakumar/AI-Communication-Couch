"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type AuthState = { user: User | null; loading: boolean; error: string | null };
const AuthContext = createContext<(AuthState & { refresh: () => Promise<void> }) | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });
  const revision = useRef(0);
  const router = useRouter();
  const verify = useCallback(async (request: number) => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (request !== revision.current) return;
      if (error && error.name !== 'AuthSessionMissingError') throw error;
      setState({ user: data.user ?? null, loading: false, error: null });
    } catch {
      if (request === revision.current) setState({ user: null, loading: false, error: 'Your session could not be verified. Please retry.' });
    }
  }, []);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    setState({ user: null, loading: true, error: null });
    await verify(request);
  }, [verify]);
  useEffect(() => {
    const requests = revision;
    const { data } = supabase.auth.onAuthStateChange(event => {
      const request = ++revision.current;
      if (event === 'SIGNED_OUT') setState({ user: null, loading: false, error: null });
      else setState({ user: null, loading: true, error: null });
      // Auth callbacks run under the SDK lock; verify after the callback returns.
      setTimeout(() => {
        if (request !== revision.current) return;
        if (event !== 'SIGNED_OUT') void verify(request);
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') router.refresh();
      }, 0);
    });
    const initialRequest = requests.current;
    queueMicrotask(() => { if (requests.current === initialRequest) void refresh(); });
    return () => { requests.current++; data.subscription.unsubscribe(); };
  }, [refresh, verify, router]);
  return <AuthContext.Provider value={{ ...state, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('AuthProvider is required');
  return state;
}
