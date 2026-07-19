'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Home no está en la nav: se va pulsando el logo. Settings vive en la
// cuenta de usuario (chip de abajo a la izquierda).
const NAV = [
  { href: '/briefing', label: 'briefing' },
  { href: '/pipeline', label: 'pipeline' },
  { href: '/founders', label: 'founders' },
  { href: '/leaderboard', label: 'leaderboard' },
];

// La sección activa se marca con el rojo de identidad (mismo patrón que la
// nav de Brand3). Las fichas de compañía cuelgan de briefing a efectos de nav.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap justify-center gap-1.5 text-xs">
      {NAV.map((n) => {
        const active =
          pathname.startsWith(n.href) ||
          (n.href === '/briefing' && pathname.startsWith('/companies'));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md border px-2.5 py-1 transition-colors ${
              active
                ? 'border-[var(--nav-active-border)] bg-[var(--nav-active-bg)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
