'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseLinkedInHandle, humanizeHandle } from '@/lib/types';

// Añadir al radar. Vale con el founder, con la marca, o con ambos:
//  - LinkedIn → el nombre se autocompleta desde el handle (editable)
//  - dominio → se crea la ficha y se busca su scan en B3S automáticamente
// Nada de esto lee LinkedIn (spec §9): Sergio pega lo que ya está viendo.
export function ImportBox() {
  const router = useRouter();
  const [mode, setMode] = useState<'uno' | 'lote'>('uno');

  // Modo uno a uno
  const [linkedin, setLinkedin] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');

  // Común
  const [warm, setWarm] = useState(false);
  const [replied, setReplied] = useState(false);
  const [text, setText] = useState(''); // modo lote
  const [log, setLog] = useState<{ input: string; status: string; detail?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // Autocompletar el nombre desde el handle, estilo LinkedIn
  function onLinkedinChange(value: string) {
    setLinkedin(value);
    if (!nameEdited) {
      const handle = parseLinkedInHandle(value);
      setName(handle ? humanizeHandle(handle) : '');
    }
  }

  async function post(entries: Record<string, string | undefined>[]) {
    setBusy(true);
    try {
      const res = await fetch('/api/founders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, warm, replied }),
      });
      const json = await res.json();
      if (json.error) setLog([{ input: '—', status: 'error', detail: json.error }]);
      else {
        setLog(json.results);
        setLinkedin('');
        setName('');
        setNameEdited(false);
        setDomain('');
        setNote('');
        setText('');
        router.refresh();
      }
    } catch (e) {
      setLog([{ input: '—', status: 'error', detail: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  function submitUno() {
    if (!linkedin.trim() && !domain.trim()) return;
    post([
      {
        linkedin: linkedin.trim() || undefined,
        name: name.trim() || undefined,
        domain: domain.trim() || undefined,
        note: note.trim() || undefined,
      },
    ]);
  }

  function submitLote() {
    const entries = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        const [li, nm, third, fourth, nt] = parts;
        const looksDomain = (s?: string) =>
          !!s && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.replace(/^https?:\/\//, ''));
        return {
          linkedin: li || undefined,
          name: nm || undefined,
          company: looksDomain(third) ? undefined : third || undefined,
          domain: looksDomain(third) ? third : looksDomain(fourth) ? fourth : undefined,
          note: nt || undefined,
        };
      });
    if (entries.length) post(entries);
  }

  const inputCls =
    'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cta)]';

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Añadir al radar</h2>
        <button
          onClick={() => setMode(mode === 'uno' ? 'lote' : 'uno')}
          className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          {mode === 'uno' ? 'modo lote →' : '← uno a uno'}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {mode === 'uno'
          ? 'Con el founder, con la marca, o con ambos. El nombre se completa solo desde la URL; con dominio se busca su scan en B3S.'
          : 'Una línea por founder: url-linkedin | nombre | empresa | dominio.com | nota'}
      </p>

      {mode === 'uno' ? (
        <div className="mt-3.5 space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label htmlFor="li" className="text-xs text-[var(--muted)]">
                Founder · URL de LinkedIn
              </label>
              <input
                id="li"
                value={linkedin}
                onChange={(e) => onLinkedinChange(e.target.value)}
                placeholder="linkedin.com/in/janedoe"
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label htmlFor="dm" className="text-xs text-[var(--muted)]">
                Marca · dominio
              </label>
              <input
                id="dm"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acmelabs.io"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label htmlFor="nm" className="text-xs text-[var(--muted)]">
                Nombre {linkedin && !nameEdited && name ? '· auto' : ''}
              </label>
              <input
                id="nm"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder="Jane Doe"
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label htmlFor="nt" className="text-xs text-[var(--muted)]">
                Nota · ángulo personal
              </label>
              <input
                id="nt"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="comentó mi post sobre marcas"
                className={`mt-1 ${inputCls}`}
                onKeyDown={(e) => e.key === 'Enter' && submitUno()}
              />
            </div>
          </div>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={
            'https://www.linkedin.com/in/janedoe | Jane Doe | Acme Labs | acmelabs.io | comentó mi post\nhttps://www.linkedin.com/in/maxweber | Max Weber | verdeo.eu'
          }
          className={`mt-3.5 ${inputCls}`}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          onClick={mode === 'uno' ? submitUno : submitLote}
          disabled={busy || (mode === 'uno' ? !linkedin.trim() && !domain.trim() : !text.trim())}
          className="rounded-md bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Añadiendo…' : 'Añadir al radar'}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={warm}
            onChange={(e) => setWarm(e.target.checked)}
            disabled={replied}
            className="accent-[var(--cta)]"
          />
          Interactuaron con mis posts (+20)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--success)]">
          <input
            type="checkbox"
            checked={replied}
            onChange={(e) => setReplied(e.target.checked)}
            className="accent-[var(--cta)]"
          />
          Ya me respondió por privado
        </label>
      </div>

      {log.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs">
          {log.map((r, i) => (
            <li key={i}>
              <span
                className={
                  r.status === 'ok'
                    ? 'text-[var(--success)]'
                    : r.status === 'error'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--muted)]'
                }
              >
                {r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : '·'}
              </span>{' '}
              {r.input}
              {r.detail ? ` — ${r.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
