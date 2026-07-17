import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'B3S Leads',
  description: 'Lead-gen cualificado para FLOC*. El envío es siempre humano.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
