'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BriefingLead } from '@/lib/types';
import { DISCARD_REASONS } from '@/lib/types';
import { priorityBreakdown } from '@/lib/scoring';

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

function signalLabel(bl: BriefingLead): string {
  const d = bl.signal?.detail;
  if (!bl.signal) return 'sin señal registrada';
  if (bl.signal.type === 'engagement') return `Engaged · ${timeAgo(bl.signal.detected_at)}`;
  const parts = [d?.round, d?.amount, (d?.investors as string[] | undefined)?.join(', ')]
    .filter(Boolean)
    .join(' · ');
  return `${parts || bl.signal.type} · ${timeAgo(bl.signal.detected_at)}`;
}

function tldrText(bl: BriefingLead): string | null {
  const t = bl.scan?.tldr;
  if (!t) return null;
  if (typeof t === 'string') return t;
  return (t.summary as string) ?? JSON.stringify(t).slice(0, 200);
}

export function LeadCard({ initial }: { initial: BriefingLead }) {
  const bl = initial;
  const [draft, setDraft] = useState(bl.message?.draft ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [copied, setCopied] = useState(false);

  if (gone) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm text-[var(--muted)]">
        {bl.company.name} → {gone}
      </div>
    );
  }

  async function patchLead(stage: string, discardReason?: string) {
    setBusy(stage);
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: bl.lead.id, stage, discardReason }),
    });
    setBusy(null);
    if (res.ok) setGone(stage === 'contacted' ? 'Contactado' : 'Descartado');
  }

  async function copyAndOpen() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Guardar lo editado como edited_final (feedback loop)
    if (bl.message && draft !== bl.message.draft) {
      fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: bl.message.id, editedFinal: draft }),
      });
    }
    if (bl.contact?.linkedin_url) window.open(bl.contact.linkedin_url, '_blank');
  }

  async function regenerate() {
    setBusy('regen');
    try {
      const res = await fetch('/api/messages/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: bl.lead.id }),
      });
      const json = await res.json();
      if (json.draft) setDraft(json.draft);
      else if (json.error) alert(`No se pudo regenerar: ${json.error}`);
    } finally {
      setBusy(null);
    }
  }

  const tldr = tldrText(bl);

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">
            <Link href={`/companies/${bl.company.domain}`} className="hover:underline">
              {bl.company.name}
            </Link>{' '}
            <a
              href={`https://${bl.company.domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-normal text-[var(--muted)] hover:underline"
            >
              {bl.company.domain}
            </a>
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: bl.company.source === 'engaged' ? '#22c55e' : 'var(--accent)' }}
            />
            {signalLabel(bl)}
          </p>
        </div>
        {bl.lead.priority_score != null && (
          <span
            className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-sm"
            title="Desglose del priority score"
          >
            {Math.round(bl.lead.priority_score)}
          </span>
        )}
      </div>

      {/* Por qué está aquí este lead (patrón Explee: trace visible) */}
      {(() => {
        const b = priorityBreakdown({ company: bl.company, signal: bl.signal, scan: bl.scan });
        return (
          <p className="mt-2 font-mono text-xs text-[var(--muted)]">
            señal {b.recencia} · ronda {b.ronda} · gap marca {b.gap_marca} · fit {b.fit_icp}
            {b.bonus_engaged > 0 && (
              <span className="text-green-400"> · warm +{b.bonus_engaged}</span>
            )}
          </p>
        );
      })()}

      {bl.scan && (
        <div className="mt-4 text-sm">
          {bl.scan.status === 'ready' ? (
            <>
              <span className="font-mono">Brand3: {bl.scan.score ?? '—'}/100</span>
              {tldr && <span className="text-[var(--muted)]"> · “{tldr}”</span>}{' '}
              {bl.scan.ui_url && (
                <a
                  href={bl.scan.ui_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Ver informe completo ↗
                </a>
              )}
            </>
          ) : (
            <span className="text-[var(--muted)]">Brand3: scan {bl.scan.status}…</span>
          )}
        </div>
      )}

      {bl.contact && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            {bl.contact.full_name}
            {bl.contact.role ? `, ${bl.contact.role}` : ''}
          </span>
          {bl.contact.linkedin_url && (
            <a
              href={bl.contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              LinkedIn ↗
            </a>
          )}
          {bl.contact.email && (
            <a href={`mailto:${bl.contact.email}`} className="text-[var(--muted)] hover:underline">
              {bl.contact.email}
            </a>
          )}
          {bl.contact.notes && (
            <span className="text-xs text-[var(--muted)]">({bl.contact.notes})</span>
          )}
        </div>
      )}

      {bl.message && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm leading-relaxed outline-none focus:border-[var(--accent)]"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/90">
              {draft}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button
              onClick={copyAndOpen}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
            >
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
            <button
              onClick={() => setEditing(!editing)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--muted)]"
            >
              {editing ? 'Hecho' : 'Editar'}
            </button>
            <button
              onClick={regenerate}
              disabled={busy === 'regen'}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--muted)] disabled:opacity-50"
            >
              {busy === 'regen' ? 'Regenerando…' : 'Regenerar'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4 text-sm">
        <button
          onClick={() => patchLead('contacted')}
          disabled={busy !== null}
          className="rounded-md border border-green-700/50 px-3 py-1.5 text-green-400 hover:bg-green-950/40 disabled:opacity-50"
        >
          → Contactado
        </button>
        {discarding ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => e.target.value && patchLead('discarded', e.target.value)}
            onBlur={() => setDiscarding(false)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Motivo…
            </option>
            {DISCARD_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setDiscarding(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--muted)]"
          >
            Descartar ▾
          </button>
        )}
      </div>
    </article>
  );
}
