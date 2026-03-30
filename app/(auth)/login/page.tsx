'use client';

import { FormEvent, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { assertEnv } from '@/lib/env';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('ethan.19@me.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const missing = assertEnv();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/terminal');
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-title">ETHAN&apos;S TERMINAL</div>
        <div className="login-subtitle">Private Bloomberg-inspired portal for terminal.neurovelo.com</div>
        {missing.length > 0 && <div className="login-error">Missing env: {missing.join(', ')}</div>}
        <form onSubmit={onSubmit} className="login-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="bbg-button" disabled={loading} type="submit">
            {loading ? 'Signing in...' : 'Log In'}
          </button>
        </form>
      </div>
    </main>
  );
}
