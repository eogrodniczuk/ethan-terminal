'use client';

import { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  let mounted = true;

  supabaseBrowser.auth.getSession().then(({ data }) => {
    if (!mounted) return;
    setSession(data.session ?? null);
    setLoading(false);
  });

  const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setLoading(false);
  });

  const handleUnload = () => {
    supabaseBrowser.auth.signOut();
  };

  window.addEventListener('beforeunload', handleUnload);

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
    window.removeEventListener('beforeunload', handleUnload);
  };
}, []);

  const value = useMemo(() => ({ session, loading }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
