'use client';

import { getBrowserSupabase } from '@/lib/supabase-browser';

// Cerrar sesión: borra la sesión de Supabase y vuelve al login.
export function UserMenu() {
  async function logout() {
    try {
      await getBrowserSupabase().auth.signOut();
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <button
      onClick={logout}
      title="Cerrar sesión"
      className="min-h-[30px] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--nav-active-border)] hover:text-[var(--accent)]"
    >
      salir
    </button>
  );
}
