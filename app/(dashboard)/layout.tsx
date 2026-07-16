import Link from 'next/link';
import { isDemoMode } from '@/lib/supabase';

const NAV = [
  { href: '/briefing', label: 'Briefing' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/engaged', label: 'Engaged' },
  { href: '/settings', label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <Link href="/briefing" className="text-lg font-bold tracking-tight">
          FLOC<span style={{ color: 'var(--accent)' }}>*</span> Radar
        </Link>
        <nav className="flex gap-6 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {isDemoMode() && (
        <div className="mb-6 rounded-md border border-amber-600/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-400">
          Modo demo: sin Supabase configurado. Los datos son de ejemplo y los cambios no se
          guardan. Configura .env.local para producción.
        </div>
      )}
      {children}
    </div>
  );
}
