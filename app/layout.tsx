import './globals.css';
import { IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import type { Metadata } from 'next';

const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: "ETHAN'S TERMINAL",
  description: 'Private portfolio terminal',

  icons: {
    icon: '/favicon.ico',          // Browser tab (Safari/Chrome)
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',      // iOS / Safari touch icon
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={mono.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}