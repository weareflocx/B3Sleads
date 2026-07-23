import Link from 'next/link';
import { LogoMark } from './logo-mark';

// Pie de la plataforma. De momento discreto: marca, un recordatorio de la
// regla que define el producto, y accesos. El contenido concreto se afina
// más adelante.
export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--border)] px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <LogoMark size={26} />
          <div>
            <p className="text-sm font-semibold">B3S Leads</p>
            <p className="mt-0.5 max-w-xs text-xs text-[var(--muted)]">
              Generación de leads de valor para FLOC*. El envío es siempre humano, por LinkedIn.
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
          <div className="flex flex-col gap-2">
            <span className="font-mono uppercase tracking-wider text-[var(--soft)]">Radar</span>
            <Link href="/briefing" className="text-[var(--muted)] hover:text-[var(--text)]">
              Briefing
            </Link>
            <Link href="/pipeline" className="text-[var(--muted)] hover:text-[var(--text)]">
              Pipeline
            </Link>
            <Link href="/founders" className="text-[var(--muted)] hover:text-[var(--text)]">
              Founders
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono uppercase tracking-wider text-[var(--soft)]">Cuenta</span>
            <Link href="/leaderboard" className="text-[var(--muted)] hover:text-[var(--text)]">
              Leaderboard
            </Link>
            <Link href="/settings" className="text-[var(--muted)] hover:text-[var(--text)]">
              Configuración
            </Link>
            <a
              href="https://b3s.fly.dev/"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--muted)] hover:text-[var(--text)]"
            >
              B3S Scanner ↗
            </a>
          </div>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-[1180px] border-t border-[var(--border)] pt-4">
        <p className="font-mono text-[11px] text-[var(--soft)]">
          FLOC* · B3S Leads — uso interno.
        </p>
      </div>
    </footer>
  );
}
