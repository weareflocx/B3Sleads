'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { displayName, STAGES } from '@/lib/types';
import type { BriefingLead, LeadStage } from '@/lib/types';
import { ScoreRing } from '../score-ring';
import { Heat } from '../heat';

// Una fila de la cola de LinkedIn. Fricción mínima: copiar y abrir el perfil.
// El envío lo hace Sergio, a mano, en LinkedIn.
// conversation = founder que ya respondió: se destaca en verde.
export function FounderRow({
  initial,
  conversation = false,
}: {
  initial: BriefingLead;
  conversation?: boolean;
}) {
  const bl = initial;
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState<LeadStage>(bl.lead.stage);
  const [savingStage, setSavingStage] = useState(false);
  const [domain, setDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);

  async function copyAndOpen() {
    if (bl.message) {
      await navigator.clipboard.writeText(bl.message.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    if (bl.contact?.linkedin_url) window.open(bl.contact.linkedin_url, '_blank');
  }

  // Cambiar la etapa desde el desplegable. La card NUNCA desaparece en
  // cliente: tras guardar, router.refresh() la recoloca en la sección que
  // toque (o la saca de /founders si ya no es operable aquí, p.ej. cerrado).
  async function changeStage(next: LeadStage) {
    const prev = stage;
    setStage(next);
    setSavingStage(true);
    const body: Record<string, string> = { leadId: bl.lead.id, stage: next };
    if (next === 'discarded') body.discardReason = 'Otro';
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSavingStage(false);
    if (res.ok) router.refresh();
    else setStage(prev);
  }

  async function saveDomain() {
    if (!domain.trim()) return;
    setSavingDomain(true);
    const res = await fetch('/api/founders/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: bl.lead.id, domain, companyName: bl.company?.name }),
    });
    setSavingDomain(false);
    if (res.ok) router.refresh(); // recarga la fila ya con empresa + scan
    else {
      const j = await res.json();
      alert(`No se pudo añadir: ${j.error}`);
    }
  }

  const hasCompany = bl.company != null;
  const score = bl.scan?.status === 'ready' ? bl.scan.score : null;

  return (
    <div
      className={`rounded-lg border bg-[var(--surface)] p-4 ${
        conversation ? 'border-[var(--success)]/50' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{displayName(bl.contact?.full_name)}</span>
            {bl.contact?.role && (
              <span className="text-sm text-[var(--muted)]">{bl.contact.role}</span>
            )}
            {hasCompany && (
              <>
                <span className="text-sm text-[var(--muted)]">·</span>
                <Link href={`/companies/${bl.company!.domain}`} className="text-sm hover:underline">
                  {bl.company!.name}
                </Link>
              </>
            )}
          </div>
          {bl.contact?.headline && (
            <p className="mt-1 text-xs text-[var(--muted)]">{bl.contact.headline}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {hasCompany ? (
              score != null ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)]">Score</span>
                  <ScoreRing score={score} size={30} />
                </span>
              ) : (
                <span className="text-[var(--muted)]">
                  Score: {bl.scan?.status === 'queued' || bl.scan?.status === 'running' ? 'escaneando…' : 'sin scan'}
                </span>
              )
            ) : (
              <span className="text-[var(--warning)]">Sin empresa · no se puede escanear todavía</span>
            )}
            {bl.company?.sector && <span className="text-[var(--muted)]">{bl.company.sector}</span>}
            {bl.company?.size && <span className="text-[var(--muted)]">{bl.company.size}</span>}
            {bl.contact?.notes && <span className="text-[var(--muted)]">· {bl.contact.notes}</span>}
          </div>
        </div>
        <Heat priority={bl.lead.priority_score} />
      </div>

      {/* Founder sin empresa: completar el dominio dispara ficha + Scanner */}
      {!hasCompany && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveDomain()}
            placeholder="dominio de su empresa, ej: acmelabs.io"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]"
          />
          <button
            onClick={saveDomain}
            disabled={savingDomain || !domain.trim()}
            className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {savingDomain ? 'Añadiendo…' : 'Añadir empresa y escanear'}
          </button>
        </div>
      )}

      {hasCompany &&
        (bl.message ? (
          <p className="mt-3 whitespace-pre-wrap border-t border-[var(--border)] pt-3 text-sm leading-relaxed text-[var(--text)]/90">
            {bl.message.draft}
          </p>
        ) : (
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">
            Sin borrador todavía. El pipeline lo genera cuando el scan esté listo.
          </p>
        ))}

      {/* Orden: Ver ficha (blanco) → LinkedIn (contorno azul) → etapa (select) */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {hasCompany && (
          <Link
            href={`/companies/${bl.company!.domain}`}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 font-medium text-black transition-opacity hover:opacity-85"
          >
            Ver ficha
          </Link>
        )}
        <button
          onClick={copyAndOpen}
          className="rounded-md border border-[var(--linkedin-soft)] px-3 py-1.5 font-medium text-[var(--linkedin-soft)] transition-colors hover:bg-[var(--linkedin-soft)]/10"
        >
          {copied
            ? 'Copiado ✓ · abriendo LinkedIn'
            : bl.message
              ? 'Copiar y abrir LinkedIn'
              : 'Abrir LinkedIn'}
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)]">
          Etapa
          <select
            value={stage}
            disabled={savingStage}
            onChange={(e) => changeStage(e.target.value as LeadStage)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--cta)] disabled:opacity-50"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
