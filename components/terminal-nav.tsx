'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const items = [
  { href: '/terminal', label: 'TERMINAL' },
  { href: '/admin', label: 'ADMIN' }
];

export function TerminalNav() {
  const pathname = usePathname();
  return (
    <nav className="terminal-nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={clsx('terminal-tab', pathname.startsWith(item.href) && 'terminal-tab-active')}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
