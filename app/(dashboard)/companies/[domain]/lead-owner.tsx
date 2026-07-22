'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '../../avatar';
import type { TeamMember } from '@/lib/team';

// Quién responde por el lead. Dos datos distintos que conviene no mezclar:
//  - Detectado por: quién lo trajo al radar. Es historia, no cambia nunca.
//  - Responsable: quién lo trabaja hoy. Cambia al delegar.
// Mientras el equipo sea una persona esto parece de más, pero es justo lo
// que evita que dos personas escriban al mismo founder la misma semana.
export function LeadOwner({
  leadId,
  owner,
  detectedBy,
  team,
}: {
  leadId: string;
  owner: TeamMember;
  detectedBy: TeamMember | null;
  team: TeamMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function delegate(email: string) {
    if (email === owner.email) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, ownerEmail: email }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError('No se pudo delegar');
      }
    } catch {
      setError('No se pudo delegar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <Avatar name={owner.label} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{owner.label}</p>
          <p className="truncate font-mono text-[11px] text-[var(--muted)]">{owner.email}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
        >
          {busy ? 'Delegando…' : 'Delegar'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
          {team.map((m) => (
            <button
              key={m.email}
              onClick={() => delegate(m.email)}
              disabled={busy}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)] ${
                m.email === owner.email ? 'text-[var(--cta)]' : 'text-[var(--text)]'
              }`}
            >
              <Avatar name={m.label} size={22} />
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              {m.email === owner.email && <span className="text-xs">actual</span>}
            </button>
          ))}
          {team.length === 1 && (
            <p className="px-2 pt-1 text-[11px] leading-snug text-[var(--soft)]">
              De momento solo estás tú. Los compañeros aparecerán aquí en cuanto entren por
              primera vez.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      {detectedBy && detectedBy.email !== owner.email && (
        <p className="mt-3 border-t border-[var(--border)] pt-2 font-mono text-[11px] text-[var(--muted)]">
          Detectado por {detectedBy.label}
        </p>
      )}
    </div>
  );
}
