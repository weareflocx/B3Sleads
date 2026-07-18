'use client';

import { useState } from 'react';
import type { BriefingLead, LeadStage } from '@/lib/types';
import { STAGES, displayName } from '@/lib/types';

// Columnas visibles del kanban (detected y briefed se agrupan como "Detectado")
const COLUMNS: { key: LeadStage; label: string; includes: LeadStage[] }[] = [
  { key: 'briefed', label: 'Detectado', includes: ['detected', 'briefed'] },
  { key: 'contacted', label: 'Contactado', includes: ['contacted'] },
  { key: 'conversation', label: 'Conversación', includes: ['conversation'] },
  { key: 'call', label: 'Call', includes: ['call'] },
  { key: 'proposal', label: 'Propuesta', includes: ['proposal'] },
  { key: 'won', label: 'Cerrado', includes: ['won', 'lost'] },
  { key: 'discarded', label: 'Descartado', includes: ['discarded'] },
];

export function Kanban({ initial }: { initial: BriefingLead[] }) {
  const [leads, setLeads] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  async function moveTo(leadId: string, stage: LeadStage) {
    const prev = leads;
    setLeads((ls) =>
      ls.map((l) => (l.lead.id === leadId ? { ...l, lead: { ...l.lead, stage } } : l)),
    );
    const body: Record<string, string> = { leadId, stage };
    if (stage === 'discarded') body.discardReason = 'Otro';
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) setLeads(prev); // revertir si falla
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = leads.filter((l) => col.includes.includes(l.lead.stage));
        return (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) moveTo(dragId, col.key);
              setDragId(null);
            }}
            className="flex min-w-[256px] flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5"
          >
            <h3 className="mb-3.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              {col.label}
              <span className="font-mono">{items.length}</span>
            </h3>
            <div className="space-y-2.5">
              {items.map((bl) => (
                <div
                  key={bl.lead.id}
                  draggable
                  onDragStart={() => setDragId(bl.lead.id)}
                  className="cursor-grab rounded-md border border-[var(--border)] bg-[var(--bg)] p-3.5 transition-colors hover:border-[var(--muted)] active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium leading-snug">
                      {bl.company?.name ?? (displayName(bl.contact?.full_name) || 'Sin nombre')}
                    </span>
                    {bl.lead.priority_score != null && (
                      <span className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-xs text-[var(--muted)]">
                        {Math.round(bl.lead.priority_score)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-xs text-[var(--muted)]">
                    {bl.company?.domain ?? (bl.contact ? 'founder sin empresa' : '')}
                  </p>
                  {bl.lead.discard_reason && (
                    <p className="mt-1.5 text-xs text-red-400/70">{bl.lead.discard_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
