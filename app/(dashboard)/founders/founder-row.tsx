'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { displayName, STAGES } from '@/lib/types';
import type { BriefingLead, LeadStage } from '@/lib/types';
import type { Temperature } from '@/lib/scoring';
import { ScoreRing } from '../score-ring';
import { Heat } from '../heat';
import { Avatar } from '../avatar';

// Una fila de la cola de LinkedIn. Fricción mínima: copiar y abrir el perfil.
// El envío lo hace Sergio, a mano, en LinkedIn.
// conversation = founder que ya respondió: se destaca en verde.
export function FounderRow({
  initial,
  opener = null,
  temp,
  conversation = false,
}: {
  initial: BriefingLead;
  opener?: string | null; // frase de entrada del argumentario (lib/pitch.ts, sin API)
  temp: Temperature; // temperatura viva del lead (lib/scoring.leadTemperature)
  conversation?: boolean;
}) {
  const bl = initial;
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  // 'briefed' es interno del pipeline; en la UI se opera como 'detected'.
  const [stage, setStage] = useState<LeadStage>(
    bl.lead.stage === 'briefed' ? 'detected' : bl.lead.stage,
  );
  const [savingStage, setSavingStage] = useState(false);
  const [domain, setDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);

  const name = displayName(bl.contact?.full_name);
  const firstName = name.split(' ')[0] || 'el founder';

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
  // toque (o la saca de /founders si ya no es operable aquí).
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
    if (res.ok) router.refresh();
    else {
      const j = await res.json();
      alert(`No se pudo añadir: ${j.error}`);
    }
  }

  const hasCompany = bl.company != null;
  const score = bl.scan?.status === 'ready' ? bl.scan.score : null;
  const scanning = bl.scan?.status === 'queued' || bl.scan?.status === 'running';

  return (
    <div
      className={`rounded-lg border bg-[var(--surface)] p-4 ${
        conversation ? 'border-[var(--success)]/50' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Identidad: avatar + nombre, marca debajo, headline y meta */}
        <div className="flex min-w-0 gap-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold">{name}</span>
              {bl.contact?.role && (
                <span className="text-xs text-[var(--muted)]">{bl.contact.role}</span>
              )}
            </div>
            {hasCompany ? (
              <Link
                href={`/companies/${bl.company!.domain}`}
                className="text-sm text-[var(--muted)] hover:text-[var(--text)] hover:underline"
              >
                {bl.company!.name}
              </Link>
            ) : (
              <span className="text-xs text-[var(--warning)]">
                Sin empresa · no se puede escanear todavía
              </span>
            )}
            {bl.contact?.headline && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {bl.contact.headline}
              </p>
            )}
            {(bl.company?.sector || bl.company?.size || bl.contact?.notes) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                {bl.company?.sector && <span>{bl.company.sector}</span>}
                {bl.company?.size && <span>{bl.company.size}</span>}
                {bl.contact?.notes && <span>· {bl.contact.notes}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Métricas a la derecha: temperatura (llamas) + score */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Heat temp={temp} />
          {score != null ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Score</span>
              <ScoreRing score={score} size={34} />
            </div>
          ) : hasCompany ? (
            <span className="text-xs text-[var(--muted)]">{scanning ? 'escaneando…' : 'sin scan'}</span>
          ) : null}
        </div>
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

      {/* Contexto para escribir: el borrador si existe; si no, el primer ángulo
          del argumentario (determinista, sin API). El borrador con IA aparece
          aquí cuando el pipeline corre con ANTHROPIC_API_KEY. */}
      {hasCompany &&
        (bl.message ? (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Borrador</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/90">
              {bl.message.draft}
            </p>
          </div>
        ) : opener ? (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Ángulo para abrir
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text)]/90">{opener}</p>
            <Link
              href={`/companies/${bl.company!.domain}`}
              className="mt-1.5 inline-block text-xs text-[var(--cta)] hover:underline"
            >
              Ver argumentario completo →
            </Link>
          </div>
        ) : (
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">
            Añade su scan de B3S para generar el argumentario para hablar con {firstName}.
          </p>
        ))}

      {/* Acciones: Ver ficha (blanco) → LinkedIn (contorno azul) → etapa */}
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
