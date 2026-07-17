'use client';

import { useState } from 'react';
import type { BriefingLead, LeadStage } from '@/lib/types';
import { STAGES } from '@/lib/types';

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
            className="min-w-[210px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              {col.label}
              <span className="font-mono">{items.length}</span>
            </h3>
            <div className="space-y-2">
              {items.map((bl) => (
                <div
                  key={bl.lead.id}
                  draggable
                  onDragStart={() => setDragId(bl.lead.id)}
                  className="cursor-grab rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {bl.company?.name ?? bl.contact?.full_name ?? 'Sin nombre'}
                    </span>
                    {bl.lead.priority_score != null && (
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {Math.round(bl.lead.priority_score)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    {bl.company?.domain ?? (bl.contact ? 'founder sin empresa' : '')}
                  </p>
                  {bl.lead.discard_reason && (
                    <p className="mt-1 text-xs text-red-400/70">{bl.lead.discard_reason}</p>
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
