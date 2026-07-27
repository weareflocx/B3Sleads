'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadStage } from '@/lib/types';
import { STAGES, DISCARD_REASONS } from '@/lib/types';
import { Select } from '../../select';

// Seguimiento del lead: etapa del pipeline. Las notas viven ahora en la
// bitácora (NotesLog), con fecha y hora por entrada.
// La etapa se guarda al cambiar; descartar exige motivo (spec §10.1).
export function FollowUp({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [stage, setStage] = useState<LeadStage>(lead.stage);
  const [saving, setSaving] = useState<'stage' | null>(null);

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

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--muted)]">Etapa</span>
        <Select
          value={stage}
          onChange={(v) => changeStage(v as LeadStage)}
          options={STAGES.map((s) => ({ value: s.key, label: s.label }))}
          ariaLabel="Etapa del lead"
          disabled={saving === 'stage'}
        />
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
    </div>
  );
}
