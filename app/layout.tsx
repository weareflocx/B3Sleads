import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'B3S Leads',
  description: 'Lead-gen cualificado para FLOC*. El envío es siempre humano.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jetbrains.variable} ${GeistSans.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
