'use client';

import { Protected } from '@/components/protected';
import { TerminalNav } from '@/components/terminal-nav';
import { Section } from '@/components/section';
import Link from 'next/link';

export default function AdminPage() {
  return (
    <Protected>
      <main className="terminal-shell">
        <TerminalNav />
        <Section title="System Files">
          <div className="bbg-note">
            positions table lives in Supabase and is edited from the Portfolio Settings page.<br />
            Python backend serves market analytics and portfolio analytics.<br />
            Vercel hosts the frontend at terminal.neurovelo.com.<br />
            Supabase handles auth and database persistence.
          </div>
        </Section>
        <Section title="Admin Actions">
          <div className="bbg-note">
            <Link className="admin-link" href="/admin/portfolio">Open Portfolio Settings</Link>
          </div>
        </Section>
      </main>
    </Protected>
  );
}
