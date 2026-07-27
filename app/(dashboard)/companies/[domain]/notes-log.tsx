'use client';

import { useEffect, useRef, useState } from 'react';
import { BTN_OUTLINE } from '../../buttons';
import { useRouter } from 'next/navigation';
import type { Note } from '@/lib/types';
import { SIGNAL_TYPES } from '@/lib/radar';

// Bitácora del lead. Cada entrada queda con su fecha y su hora: lo que se
// habló el martes sigue ahí cuando anotas lo del jueves. Antes esto era un
// campo que se sobrescribía, así que cada nota nueva borraba la anterior.
const KIND_LABEL: Record<string, string> = {
  call_report: 'Informe de llamada',
  insight: 'Hallazgo',
};

// "Hoy · 17:42", "ayer · 09:05", "18 jul · 12:30". La hora importa: saber
// que respondió a las 5 de la mañana dice algo del founder.
function stamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return `Hoy · ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return `Ayer · ${time}`;
  const date = d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${date} · ${time}`;
}

export function NotesLog({
  leadId,
  companyId,
  contactId,
  notes,
}: {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  notes: Note[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, companyId, contactId, body }),
      });
      if (res.ok) {
        setDraft('');
        router.refresh();
      } else {
        setError('No se pudo guardar la nota');
      }
    } catch {
      setError('No se pudo guardar la nota');
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    if (!confirm('¿Eliminar esta nota de la bitácora?')) return;
    setBusy(true);
    const res = await fetch('/api/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      <label htmlFor="new-note" className="text-xs text-[var(--muted)]">
        Anotar (qué se ha hablado, ángulo personal)
      </label>
      <textarea
        id="new-note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl + Enter guarda sin soltar el teclado.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add();
        }}
        rows={3}
        placeholder="ej: respondió interesado, le mando el informe el lunes"
        className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm leading-relaxed outline-none focus:border-[var(--cta)]"
      />
      <button
        onClick={add}
        disabled={busy || !draft.trim()}
        className={`${BTN_OUTLINE} mt-2 w-full`}
      >
        {busy ? 'Guardando…' : 'Añadir nota'}
      </button>
      {error ? (
        <p className="mt-1.5 text-xs text-[var(--danger)]">{error}</p>
      ) : (
        <p className="mt-1.5 text-center text-[10px] text-[var(--soft)]">⌘ + Enter</p>
      )}

      {notes.length > 0 && (
        <ol className="mt-4 space-y-3 border-t border-[var(--border)] pt-3">
          {notes.map((n) => (
            <li key={n.id} className="group">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  {stamp(n.created_at)}
                  {KIND_LABEL[n.kind] ? ` · ${KIND_LABEL[n.kind]}` : ''}
                </span>
                <button
                  onClick={() => remove(n.id)}
                  title="Eliminar nota"
                  aria-label="Eliminar nota"
                  className="shrink-0 text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100 focus:opacity-100"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
              {companyId && <MarkAsSignal companyId={companyId} note={n} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Promover una nota a señal del radar. La bitácora ya es la fuente natural de
// las señales A y B: el cuerpo de la nota es la evidencia literal y su fecha
// es cuándo ocurrió, que es lo que decae. Nada que reescribir a mano.
function MarkAsSignal({ companyId, note }: { companyId: string; note: Note }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function mark(type: string, label: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/signals/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          type,
          occurredAt: note.created_at,
          evidence: note.body,
          detail: { source: 'bitacora', note_id: note.id },
        }),
      });
      if (res.ok) {
        setDone(label);
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="mt-1 font-mono text-[10px] text-[var(--cta)]">✓ señal registrada · {done}</p>;
  }

  return (
    <div ref={ref} className="relative mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="font-mono text-[10px] text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--cta)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
      >
        {busy ? 'registrando…' : 'marcar como señal ↑'}
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 mt-1 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
          style={{ animation: 'b3s-pop 130ms cubic-bezier(0.23, 1, 0.32, 1)', transformOrigin: 'top' }}
        >
          <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            Qué señal es esta nota
          </p>
          {SIGNAL_TYPES.filter((s) => s.level !== 'C').map((s) => (
            <button
              key={s.type}
              onClick={() => mark(s.type, s.label)}
              title={s.hint}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)]"
            >
              <span className="truncate">{s.label}</span>
              <span
                className={`shrink-0 font-mono text-[10px] ${
                  s.level === 'A' ? 'text-[var(--cta)]' : 'text-[var(--muted)]'
                }`}
              >
                {s.level} · {s.weight}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
