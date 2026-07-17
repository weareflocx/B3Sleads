import Link from 'next/link';
import { isDemoMode } from '@/lib/supabase';
import { ThemeToggle } from './theme-toggle';
import { Logo } from './logo';

const NAV = [
  { href: '/briefing', label: 'briefing' },
  { href: '/pipeline', label: 'pipeline' },
  { href: '/founders', label: 'founders' },
  { href: '/settings', label: 'settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto my-6 min-h-[calc(100vh-48px)] w-[min(1200px,calc(100%-32px))] border border-[var(--border)] bg-[var(--page-bg)] shadow-[var(--page-shadow)]">
      {/* Cabecera tipo terminal, como Brand3: logo · nav · tema */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[var(--border)] px-7 py-3">
        <Link href="/briefing" aria-label="B3S Leads" className="flex items-center">
          <Logo />
          <span className="ml-2 text-xs font-semibold text-[var(--muted)]">Leads</span>
        </Link>
        <nav className="flex flex-wrap justify-center gap-4 text-xs">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </header>

      <div className="px-7 pb-16 pt-8">
        {isDemoMode() && (
          <div className="mb-6 border border-[var(--warning)]/40 bg-[var(--accent-soft)]/30 px-4 py-2 text-xs text-[var(--warning)]">
            Modo demo: sin Supabase configurado. Los datos son de ejemplo y los cambios no se
            guardan. Configura .env.local para producción.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
