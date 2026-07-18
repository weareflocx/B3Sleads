'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { displayName } from '@/lib/types';
import type { BriefingLead } from '@/lib/types';

// Una fila de la cola de LinkedIn. Fricción mínima: copiar y abrir el perfil.
// El envío lo hace Sergio, a mano, en LinkedIn.
// conversation = founder que ya respondió: se destaca y el avance es a 'call'.
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
  const [done, setDone] = useState(false);
  const [domain, setDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);

  if (done) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)]">
        {displayName(bl.contact?.full_name)} → {conversation ? 'Call' : 'Contactado'}
      </div>
    );
  }

  async function copyAndOpen() {
    if (bl.message) {
      await navigator.clipboard.writeText(bl.message.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    if (bl.contact?.linkedin_url) window.open(bl.contact.linkedin_url, '_blank');
  }

  async function advance() {
    // Conversación → avanza a 'call'. Cold → marca 'contacted'.
    const stage = conversation ? 'call' : 'contacted';
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: bl.lead.id, stage }),
    });
    if (res.ok) setDone(true);
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
              bl.scan?.status === 'ready' && bl.scan.score != null ? (
                <span className="font-mono">Brand3 {bl.scan.score}/100</span>
              ) : (
                <span className="text-[var(--muted)]">Brand3: {bl.scan?.status ?? 'sin scan'}</span>
              )
            ) : (
              <span className="text-[var(--warning)]">Sin empresa · no se puede escanear todavía</span>
            )}
            {bl.company?.sector && <span className="text-[var(--muted)]">{bl.company.sector}</span>}
            {bl.company?.size && <span className="text-[var(--muted)]">{bl.company.size}</span>}
            {bl.contact?.notes && <span className="text-[var(--muted)]">· {bl.contact.notes}</span>}
          </div>
        </div>
        {bl.lead.priority_score != null && (
          <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-sm">
            {Math.round(bl.lead.priority_score)}
          </span>
        )}
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

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button
          onClick={copyAndOpen}
          className="rounded-md bg-[var(--cta)] px-3 py-1.5 font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          {copied
            ? 'Copiado ✓ · abriendo LinkedIn'
            : bl.message
              ? 'Copiar y abrir LinkedIn'
              : 'Abrir LinkedIn'}
        </button>
        <button
          onClick={advance}
          className="rounded-md border border-[var(--cta)]/50 px-3 py-1.5 text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10"
        >
          {conversation ? '→ Call' : '→ Contactado'}
        </button>
        {hasCompany && (
          <Link
            href={`/companies/${bl.company!.domain}`}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--muted)]"
          >
            Ver ficha
          </Link>
        )}
      </div>
    </div>
  );
}
