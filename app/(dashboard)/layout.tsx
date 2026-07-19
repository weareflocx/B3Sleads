import Link from 'next/link';
import { isDemoMode } from '@/lib/supabase';
import { currentUser } from '@/lib/auth';
import { ThemeToggle } from './theme-toggle';
import { Logo } from './logo';
import { Nav } from './nav';
import { UserChip } from './user-chip';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <div className="mx-auto my-6 min-h-[calc(100vh-48px)] w-[min(1200px,calc(100%-32px))] border border-[var(--border)] bg-[var(--page-bg)] shadow-[var(--page-shadow)]">
      {/* Cabecera tipo terminal, como Brand3: logo (→ home) · nav · tema.
          La cuenta vive en el chip fijo de abajo a la izquierda. */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[var(--border)] px-7 py-3">
        <Link href="/home" aria-label="B3S Leads · ir a home" className="flex items-center">
          <Logo />
          <span className="ml-2 text-xs font-semibold text-[var(--muted)]">Leads</span>
        </Link>
        <Nav />
        <ThemeToggle />
      </header>

      <div className="px-7 pb-24 pt-8">
        {isDemoMode() && (
          <div className="mb-6 border border-[var(--warning)]/40 bg-[var(--accent-soft)]/30 px-4 py-2 text-xs text-[var(--warning)]">
            Modo demo: sin Supabase configurado. Los datos son de ejemplo y los cambios no se
            guardan. Configura .env.local para producción.
          </div>
        )}
        {children}
      </div>

      <UserChip email={user.email} name={user.name} />
    </div>
  );
}
