'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadStage } from '@/lib/types';
import { STAGES, DISCARD_REASONS } from '@/lib/types';

// Seguimiento del lead: etapa del pipeline y notas de la conversación.
// La etapa se guarda al cambiar; descartar exige motivo (spec §10.1).
export function FollowUp({
  lead,
  contactId,
  initialNotes,
}: {
  lead: Lead;
  contactId: string | null;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<LeadStage>(lead.stage);
  const [discardReason, setDiscardReason] = useState('');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState<'stage' | 'notes' | null>(null);

  async function changeStage(next: LeadStage, reason?: string) {
    if (next === 'discarded' && !reason) {
      setStage('discarded'); // muestra el select de motivo, aún sin guardar
      return;
    }
    setSaving('stage');
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, stage: next, discardReason: reason }),
    });
    setSaving(null);
    if (res.ok) {
      setStage(next);
      router.refresh();
    }
  }

  async function saveNotes() {
    if (!contactId) return;
    setSaving('notes');
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, notes }),
    });
    setSaving(null);
    if (res.ok) setSavedNotes(notes);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="stage" className="text-xs text-[var(--muted)]">
          Etapa
        </label>
        <select
          id="stage"
          value={stage}
          onChange={(e) => changeStage(e.target.value as LeadStage)}
          disabled={saving === 'stage'}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--cta)]"
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value="lost">Perdido</option>
        </select>
      </div>

      {stage === 'discarded' && lead.stage !== 'discarded' && (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => e.target.value && changeStage('discarded', e.target.value)}
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Motivo del descarte…
          </option>
          {DISCARD_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}

      <p className="mt-2 text-xs text-[var(--muted)]">
        Última actividad: {fmt(lead.updated_at)}
      </p>

      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <label htmlFor="notes" className="text-xs text-[var(--muted)]">
          Notas de seguimiento (qué se ha hablado, ángulo personal)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="ej: respondió interesado, le mando el informe el lunes"
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm leading-relaxed outline-none focus:border-[var(--cta)]"
        />
        <button
          onClick={saveNotes}
          disabled={saving === 'notes' || notes === savedNotes || !contactId}
          className="mt-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
        >
          {saving === 'notes' ? 'Guardando…' : notes === savedNotes ? 'Guardado' : 'Guardar notas'}
        </button>
      </div>
    </div>
  );
}
