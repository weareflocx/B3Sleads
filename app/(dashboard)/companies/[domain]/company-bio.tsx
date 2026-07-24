'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BioProposal } from '@/lib/bio-discovery';
import { BTN_OUTLINE } from '../../buttons';

// La bio de la startup: qué es, en una o dos frases. Se rellena a mano (de
// su LinkedIn, por ejemplo) y más adelante podrá precargarse del scan. El
// gesto es el de siempre: en reposo solo texto; lápiz al pasar el ratón;
// vacía, una invitación punteada.
export function CompanyBio({
  companyId,
  initial,
}: {
  companyId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [proposals, setProposals] = useState<BioProposal[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setValue(initial ?? ''), [initial]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function save(explicit?: string) {
    const next = (explicit ?? value).trim();
    setEditing(false);
    if (next === (initial ?? '').trim()) {
      setValue(initial ?? '');
      return;
    }
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, description: next }),
      });
      if (res.ok) router.refresh();
      else setValue(initial ?? '');
    } catch {
      setValue(initial ?? '');
    } finally {
      setSaving(false);
    }
  }

  async function discover() {
    setSearching(true);
    setNote(null);
    setProposals(null);
    try {
      const res = await fetch('/api/companies/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (json.error) setNote(String(json.error));
      else {
        setProposals(json.proposals ?? []);
        if (json.message) setNote(String(json.message));
      }
    } catch {
      setNote('No pude completar la búsqueda');
    } finally {
      setSearching(false);
    }
  }

  // Las candidatas se enseñan con su fuente; aprobar una la guarda.
  const candidatas = proposals && proposals.length > 0 && (
    <ul className="mt-2 space-y-1.5">
      {proposals.map((p, i) => (
        <li key={`${p.sourceUrl}-${i}`} className="rounded-md border border-[var(--border)] p-2.5">
          <p className="text-sm leading-relaxed">{p.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setProposals(null);
                setNote(null);
                save(p.text);
              }}
              className="rounded-md border border-[var(--cta)] px-2.5 py-1 text-xs font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)] hover:text-[var(--cta-text)]"
            >
              Usar esta
            </button>
            {p.sourceUrl ? (
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-[var(--muted)] hover:text-[var(--cta)]"
              >
                {p.sourceLabel} ↗
              </a>
            ) : (
              <span className="font-mono text-[11px] text-[var(--soft)]">{p.sourceLabel}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  const acciones = (
    <div className="mt-2.5">
      <button onClick={discover} disabled={searching} className={`${BTN_OUTLINE} text-xs`}>
        {searching ? 'Buscando bio…' : 'Buscar bio'}
      </button>
      {note && <p className="mt-1.5 text-[11px] text-[var(--soft)]">{note}</p>}
    </div>
  );

  if (editing) {
    return (
      <textarea
        ref={ref}
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(initial ?? '');
            setEditing(false);
          }
        }}
        placeholder="qué hace la startup, en una o dos frases (cópialo de su LinkedIn)"
        className="w-full resize-y rounded-md border border-[var(--cta)] bg-[var(--bg)] px-2.5 py-2 text-sm leading-relaxed outline-none"
      />
    );
  }

  if (!value.trim()) {
    return (
      <div>
        <button
          onClick={() => setEditing(true)}
          className="text-left text-sm text-[var(--soft)] underline decoration-dotted underline-offset-4 hover:text-[var(--cta)]"
        >
          añadir bio (qué hace la startup)
        </button>
        {acciones}
        {candidatas}
      </div>
    );
  }

  return (
    <div>
    <span className="group flex items-start gap-2">
      <p className={`text-sm leading-relaxed ${saving ? 'opacity-50' : ''}`}>{value}</p>
      <button
        onClick={() => setEditing(true)}
        title="Editar bio"
        aria-label="Editar bio"
        className="mt-0.5 shrink-0 text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </span>
    {acciones}
    {candidatas}
    </div>
  );
}
