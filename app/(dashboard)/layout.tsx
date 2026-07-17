import Link from 'next/link';
import { isDemoMode } from '@/lib/supabase';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/briefing', label: 'briefing' },
  { href: '/pipeline', label: 'pipeline' },
  { href: '/founders', label: 'founders' },
  { href: '/settings', label: 'settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto my-6 min-h-[calc(100vh-48px)] w-[min(1200px,calc(100%-32px))] border border-[var(--border)] bg-[var(--page-bg)] shadow-[var(--page-shadow)]">
      {/* Cabecera tipo terminal, como Brand3 */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-7 py-3 text-xs">
        <Link href="/briefing" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="text-[var(--accent)]">&gt;</span> B3S Leads
        </Link>
        <ThemeToggle />
      </header>

      {/* Nav de chips */}
      <nav className="flex flex-wrap gap-2 px-7 pb-3 pt-3.5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="inline-flex min-h-[30px] items-center border border-[var(--border)] px-3 text-xs text-[var(--muted)] transition-colors hover:border-[var(--nav-active-border)] hover:text-[var(--accent)]"
          >
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="px-7 pb-16">
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
