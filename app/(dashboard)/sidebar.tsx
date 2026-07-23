'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { LogoMark } from './logo-mark';
import { Avatar } from './avatar';
import { ThemeToggle } from './theme-toggle';
import { SearchCommand } from './search-command';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import {
  IconBriefing,
  IconPipeline,
  IconFounders,
  IconLeaderboard,
  IconCollapse,
  IconExpand,
  IconMenu,
  IconClose,
  type IconProps,
} from './nav-icons';

// Menú lateral estilo app-shell (referencia: Netlify). Logo arriba a la
// izquierda, secciones con icono, botón de comprimir, buscador y la cuenta
// abajo. Comprimido deja solo iconos + símbolo. En móvil es un cajón.
//
// Dos instancias del mismo contenido: en escritorio va EN FLUJO (una columna
// del flex, su ancho reordena el contenido); en móvil es un cajón fijo que se
// desliza. Se evita así el hack de una sola <aside> con posición condicional,
// que dejaba un hueco fantasma en móvil.
type NavItem = { href: string; label: string; Icon: (p: IconProps) => React.ReactElement; match?: string[] };

const NAV: NavItem[] = [
  { href: '/briefing', label: 'Briefing', Icon: IconBriefing, match: ['/companies'] },
  { href: '/pipeline', label: 'Pipeline', Icon: IconPipeline },
  { href: '/founders', label: 'Founders', Icon: IconFounders },
  { href: '/leaderboard', label: 'Leaderboard', Icon: IconLeaderboard, match: ['/investors'] },
];

const STORAGE_KEY = 'b3s-sidebar-collapsed';

export function Sidebar({ user }: { user: { email: string | null; name: string | null } }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const isActive = (item: NavItem) =>
    pathname.startsWith(item.href) || (item.match ?? []).some((m) => pathname.startsWith(m));

  return (
    <>
      {/* Barra superior solo en móvil */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--page-bg)] px-4 py-2.5 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--nav-active-bg)] hover:text-[var(--text)]"
        >
          <IconMenu size={20} />
        </button>
        <Link href="/home" aria-label="B3S Leads · home" className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="text-xs font-semibold text-[var(--muted)]">Leads</span>
        </Link>
        <div className="ml-auto">
          <SearchCommand collapsed />
        </div>
      </div>

      {/* Sidebar de escritorio: EN FLUJO, comprimible. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--page-bg)] transition-[width] duration-200 md:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          isActive={isActive}
          user={user}
        />
      </aside>

      {/* Cajón móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[var(--border)] bg-[var(--page-bg)] shadow-2xl transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarBody
          collapsed={false}
          isActive={isActive}
          user={user}
          onClose={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  collapsed,
  onToggleCollapse,
  onClose,
  isActive,
  user,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  isActive: (item: NavItem) => boolean;
  user: { email: string | null; name: string | null };
}) {
  return (
    <>
      {/* Logo + comprimir / cerrar */}
      <div className={`flex items-center gap-2 px-3 py-3.5 ${collapsed ? 'justify-center' : ''}`}>
        <Link href="/home" aria-label="B3S Leads · ir a home" className="flex min-w-0 items-center gap-2">
          {collapsed ? <LogoMark size={24} /> : <Logo />}
          {!collapsed && <span className="text-xs font-semibold text-[var(--muted)]">Leads</span>}
        </Link>
        {onToggleCollapse && !collapsed && (
          <button
            onClick={onToggleCollapse}
            aria-label="Comprimir menú"
            title="Comprimir menú"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--soft)] transition-colors hover:bg-[var(--nav-active-bg)] hover:text-[var(--text)]"
          >
            <IconCollapse size={18} />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--soft)] hover:text-[var(--text)]"
          >
            <IconClose size={18} />
          </button>
        )}
      </div>

      {onToggleCollapse && collapsed && (
        <button
          onClick={onToggleCollapse}
          aria-label="Expandir menú"
          title="Expandir menú"
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--soft)] transition-colors hover:bg-[var(--nav-active-bg)] hover:text-[var(--text)]"
        >
          <IconExpand size={18} />
        </button>
      )}

      <div className={`px-3 py-1.5 ${collapsed ? 'flex justify-center' : ''}`}>
        <SearchCommand collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-[var(--nav-active-bg)] font-medium text-[var(--text)]'
                  : 'text-[var(--muted)] hover:bg-[var(--nav-active-bg)] hover:text-[var(--text)]'
              }`}
            >
              <item.Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-3">
        <div className={`mb-2 ${collapsed ? 'flex justify-center' : ''}`}>
          <ThemeToggle />
        </div>
        <AccountMenu email={user.email} name={user.name} collapsed={collapsed} />
      </div>
    </>
  );
}

// La cuenta, integrada al pie del menú (antes era un chip flotante).
function AccountMenu({
  email,
  name,
  collapsed,
}: {
  email: string | null;
  name: string | null;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!email) return null; // modo demo sin auth

  const label = name || email.split('@')[0].replace(/^./, (c) => c.toUpperCase());

  async function logout() {
    try {
      await getBrowserSupabase().auth.signOut();
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--page-shadow)]">
          <div className="border-b border-[var(--border)] px-3.5 py-2.5">
            <div className="truncate text-sm font-medium">{label}</div>
            <div className="truncate text-xs text-[var(--muted)]">{email}</div>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)]"
          >
            Perfil y configuración
          </Link>
          <button
            onClick={logout}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
          >
            Cerrar sesión
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title={email}
        className={`flex w-full items-center gap-2.5 rounded-md border py-1.5 transition-colors ${
          collapsed ? 'justify-center px-1.5' : 'pl-1.5 pr-3'
        } ${open ? 'border-[var(--muted)] bg-[var(--surface)]' : 'border-transparent hover:bg-[var(--nav-active-bg)]'}`}
      >
        <Avatar name={label} size={28} />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left text-sm">{label}</span>}
      </button>
    </div>
  );
}
