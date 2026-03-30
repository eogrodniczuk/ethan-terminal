'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { supabaseBrowser } from '@/lib/supabase-browser';

const items = [
  { href: '/terminal', label: 'TERMINAL' },
  { href: '/admin', label: 'ADMIN' }
];

export function TerminalNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="terminal-nav">
      <div className="terminal-nav-left">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'terminal-tab',
              pathname.startsWith(item.href) && 'terminal-tab-active'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="terminal-nav-right">
        <button type="button" onClick={handleLogout} className="terminal-tab">
          LOG OUT
        </button>
      </div>
    </nav>
  );
}