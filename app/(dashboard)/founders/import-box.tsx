'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseLinkedInHandle, humanizeHandle } from '@/lib/types';
import type { PreviewRow } from '@/app/api/founders/preview/route';

interface LogRow {
  input: string;
  status: string;
  detail?: string;
  domain?: string;
  name?: string;
}

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

  // Modo lote: dos módulos, se emparejan por fila
  const [foundersText, setFoundersText] = useState('');
  const [brandsText, setBrandsText] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Común
  const [warm, setWarm] = useState(false);
  const [replied, setReplied] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Autocompletar el nombre desde el handle, estilo LinkedIn
  function onLinkedinChange(value: string) {
    setLinkedin(value);
    if (!nameEdited) {
      const handle = parseLinkedInHandle(value);
      setName(handle ? humanizeHandle(handle) : '');
    }
  }

  function resetForm() {
    setLinkedin('');
    setName('');
    setNameEdited(false);
    setDomain('');
    setNote('');
    setFoundersText('');
    setBrandsText('');
    setPreview(null);
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
        setLog(json.results as LogRow[]);
        resetForm();
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

  // Empareja founders y marcas por fila en el texto que entiende el parser.
  function pairedText(): string {
    const f = foundersText.split('\n').map((l) => l.trim());
    const b = brandsText.split('\n').map((l) => l.trim());
    const n = Math.max(f.length, b.length);
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      const line = [f[i], b[i]].filter(Boolean).join(' ');
      if (line.trim()) lines.push(line);
    }
    return lines.join('\n');
  }

  // Paso 1 del lote: analizar (parsea + busca scan + detecta duplicados)
  async function analyze() {
    const text = pairedText();
    if (!text.trim()) return;
    setAnalyzing(true);
    setLog([]);
    try {
      const res = await fetch('/api/founders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (json.error) setLog([{ input: '—', status: 'error', detail: json.error }]);
      else setPreview(json.rows as PreviewRow[]);
    } catch (e) {
      setLog([{ input: '—', status: 'error', detail: String(e) }]);
    } finally {
      setAnalyzing(false);
    }
  }

  // Paso 2 del lote: añadir solo las filas nuevas y válidas
  function submitLote() {
    if (!preview) return;
    const entries = preview
      .filter((r) => r.status === 'new')
      .map((r) => ({
        linkedin: r.linkedin,
        name: r.name,
        company: r.company,
        domain: r.domain,
        note: r.note,
      }));
    if (entries.length) post(entries);
  }

  const inputCls =
    'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cta)]';

  const nuevos = preview?.filter((r) => r.status === 'new').length ?? 0;
  const dups = preview?.filter((r) => r.status === 'dup').length ?? 0;
  const invalidos = preview?.filter((r) => r.status === 'invalid').length ?? 0;
  const loteHasInput = !!(foundersText.trim() || brandsText.trim());

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Añadir al radar</h2>
        <button
          onClick={() => {
            setMode(mode === 'uno' ? 'lote' : 'uno');
            setLog([]);
            setPreview(null);
          }}
          className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          {mode === 'uno' ? 'modo lote →' : '← uno a uno'}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {mode === 'uno'
          ? 'Con el founder, con la marca, o con ambos. El nombre se completa solo desde la URL; con dominio se busca su scan en B3S.'
          : 'Pega varios de golpe: los founders a la izquierda y sus marcas a la derecha, uno por línea. La fila 1 de founders empareja con la fila 1 de marcas.'}
      </p>

      {mode === 'uno' ? (
        <>
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

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              onClick={submitUno}
              disabled={busy || (!linkedin.trim() && !domain.trim())}
              className="rounded-md bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Añadiendo…' : 'Añadir al radar'}
            </button>
            <Checkboxes {...{ warm, setWarm, replied, setReplied }} />
          </div>
        </>
      ) : preview ? (
        <>
          <div className="mt-3.5 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5">
            {preview.map((r, i) => (
              <PreviewRowView key={i} row={r} />
            ))}
          </div>
          <p className="mt-2.5 text-xs text-[var(--muted)]">
            {nuevos} {nuevos === 1 ? 'nuevo' : 'nuevos'}
            {dups > 0 && ` · ${dups} ya en el radar`}
            {invalidos > 0 && ` · ${invalidos} sin reconocer`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              onClick={submitLote}
              disabled={busy || nuevos === 0}
              className="rounded-md bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Añadiendo…' : `Añadir ${nuevos} al radar`}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              ← editar
            </button>
            <Checkboxes {...{ warm, setWarm, replied, setReplied }} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
            <div>
              <label htmlFor="lf" className="text-xs text-[var(--muted)]">
                Founders · una URL de LinkedIn por línea
              </label>
              <textarea
                id="lf"
                value={foundersText}
                onChange={(e) => setFoundersText(e.target.value)}
                rows={5}
                placeholder={'linkedin.com/in/janedoe\nlinkedin.com/in/maxweber\nAna Ruiz  linkedin.com/in/anaruiz'}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="lb" className="text-xs text-[var(--muted)]">
                Marcas · un dominio por línea (empareja por fila)
              </label>
              <textarea
                id="lb"
                value={brandsText}
                onChange={(e) => setBrandsText(e.target.value)}
                rows={5}
                placeholder={'acmelabs.io\nverdeo.eu\n'}
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              onClick={analyze}
              disabled={analyzing || !loteHasInput}
              className="rounded-md border border-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-40"
            >
              {analyzing ? 'Analizando…' : 'Analizar'}
            </button>
            <Checkboxes {...{ warm, setWarm, replied, setReplied }} />
          </div>
        </>
      )}

      {log.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
          {log.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
              </span>
              <span className="font-medium">{r.name || r.input}</span>
              {r.detail && <span className="text-[var(--muted)]">— {r.detail}</span>}
              {r.status === 'ok' && r.domain && (
                <Link
                  href={`/companies/${r.domain}`}
                  className="ml-auto rounded-md border border-[var(--border)] px-2 py-0.5 font-medium text-[var(--text)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
                >
                  Ver ficha →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Checkboxes({
  warm,
  setWarm,
  replied,
  setReplied,
}: {
  warm: boolean;
  setWarm: (v: boolean) => void;
  replied: boolean;
  setReplied: (v: boolean) => void;
}) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={warm}
          onChange={(e) => setWarm(e.target.checked)}
          disabled={replied}
          className="accent-[var(--cta)]"
        />
        Interactuaron con mis posts
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--success)]">
        <input
          type="checkbox"
          checked={replied}
          onChange={(e) => setReplied(e.target.checked)}
          className="accent-[var(--cta)]"
        />
        Respondió por DM
      </label>
    </>
  );
}

function PreviewRowView({ row: r }: { row: PreviewRow }) {
  const dim = r.status === 'invalid' || r.status === 'dup';
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[var(--border)] py-1.5 text-sm last:border-0 ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <span className="font-medium">{r.name || (r.domain ?? '(sin nombre)')}</span>
      {r.handle && (
        <span className="font-mono text-xs text-[var(--linkedin-soft)]">in/{r.handle}</span>
      )}
      {r.domain && <span className="font-mono text-xs text-[var(--muted)]">{r.domain}</span>}

      {r.status === 'invalid' ? (
        <span className="text-xs text-[var(--danger)]">no se reconoció LinkedIn ni dominio</span>
      ) : r.status === 'dup' ? (
        <span className="text-xs text-[var(--warning)]">
          ya en el radar{r.dupContactName ? ` · ${r.dupContactName}` : ''}
        </span>
      ) : r.scanFound ? (
        <span className="text-xs text-[var(--cta)]">
          Brand3 {r.score ?? '—'}/100
          {r.quadrant ? ` · ${r.quadrant}` : ''}
        </span>
      ) : r.domain ? (
        <span className="text-xs text-[var(--muted)]">sin scan en B3S aún</span>
      ) : (
        <span className="text-xs text-[var(--muted)]">añade su dominio para el scan</span>
      )}

      {r.status === 'new' && r.dupCompany && (
        <span className="text-xs text-[var(--muted)]">· marca ya en el radar</span>
      )}

      {r.note && <span className="text-xs text-[var(--soft)]">· {r.note}</span>}
    </div>
  );
}
