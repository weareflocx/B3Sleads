'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Avatar } from '../avatar';

// Perfil del usuario: el nombre se guarda en user_metadata de Supabase Auth
// y se refleja en el chip de cuenta y en el leaderboard.
export function ProfileCard({
  initialName,
  email,
}: {
  initialName: string | null;
  email: string | null;
}) {
  const fallback = email ? email.split('@')[0].replace(/^./, (c) => c.toUpperCase()) : '';
  const [name, setName] = useState(initialName ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    setState('saving');
    const { error } = await getBrowserSupabase().auth.updateUser({
      data: { name: name.trim() || null },
    });
    if (error) {
      setState('error');
    } else {
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
      // El chip del layout lee el nombre en servidor: refresco suave
      window.location.reload();
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-semibold">Perfil</h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={name || fallback || '?'} size={40} />
        <div className="min-w-0 flex-1">
          <label htmlFor="pf-name" className="text-xs text-[var(--muted)]">
            Nombre
          </label>
          <input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={fallback || 'Tu nombre'}
            className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]"
          />
        </div>
      </div>
      <div className="mt-2.5 text-xs text-[var(--muted)]">
        Email: <span className="text-[var(--text)]">{email ?? '—'}</span>
      </div>
      <button
        onClick={save}
        disabled={state === 'saving'}
        className="mt-3 rounded-md bg-[var(--cta)] px-3.5 py-1.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado ✓' : 'Guardar'}
      </button>
      {state === 'error' && (
        <p className="mt-2 text-xs text-[var(--danger)]">No se pudo guardar. Reintenta.</p>
      )}
    </div>
  );
}
