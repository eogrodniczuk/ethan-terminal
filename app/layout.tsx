import './globals.css';
import { IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';

const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = {
  title: "ETHAN'S TERMINAL",
  description: 'Private Bloomberg-inspired portfolio terminal for neurovelo.com'
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
