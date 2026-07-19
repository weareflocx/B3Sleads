'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Avatar } from './avatar';

// Cuenta del usuario, fija abajo a la izquierda (patrón app de Claude).
// Abre un menú hacia arriba con la configuración y el cierre de sesión.
export function UserChip({ email, name }: { email: string | null; name: string | null }) {
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
    <div ref={rootRef} className="fixed bottom-4 left-4 z-50">
      {open && (
        <div className="mb-2 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--page-shadow)]">
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
        className={`flex items-center gap-2.5 rounded-lg border bg-[var(--surface)] py-1.5 pl-1.5 pr-3.5 shadow-[var(--page-shadow)] transition-colors ${
          open ? 'border-[var(--muted)]' : 'border-[var(--border)] hover:border-[var(--muted)]'
        }`}
      >
        <Avatar name={label} size={28} />
        <span className="max-w-[140px] truncate text-sm">{label}</span>
      </button>
    </div>
  );
}
