'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseLinkedInHandle, humanizeHandle } from '@/lib/types';
import { BTN_CTA, BTN_OUTLINE } from './buttons';

// El formulario de alta, compartido por la caja del Briefing y por el modal
// global del menú. Una sola lógica: el alta funciona igual venga de donde
// venga. Nada de esto lee LinkedIn (spec §9): se pega lo que ya se está viendo.
export interface LogRow {
  input: string;
  status: string;
  detail?: string;
  domain?: string;
  name?: string;
}

// La respuesta de error puede llegar como página HTML (timeout del proxy),
// no como JSON: parsear a ciegas convertía un 502 en un "SyntaxError"
// críptico. Se lee como texto y se traduce a un mensaje útil.
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: res.ok
        ? 'El servidor devolvió una respuesta inesperada. Recarga y comprueba si el lead entró.'
        : `El servidor no respondió a tiempo (${res.status}). Puede que el lead se haya creado: búscalo antes de reintentar.`,
    };
  }
}

const FIELD =
  'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cta)]';

// Estado y envío del alta. Lo comparten la caja compacta y el modal por
// pasos: una sola lógica, dos formas de preguntarlo.
export function useAddLead(onAdded?: (rows: LogRow[]) => void) {
  const router = useRouter();
  const [linkedin, setLinkedin] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [domain, setDomain] = useState('');
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [warm, setWarm] = useState(false);
  const [replied, setReplied] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

  // El nombre se deduce del handle mientras no se toque a mano.
  function onLinkedinChange(value: string) {
    setLinkedin(value);
    if (!nameEdited) {
      const handle = parseLinkedInHandle(value);
      setName(handle ? humanizeHandle(handle) : '');
    }
  }

  const canSubmit = !busy && (linkedin.trim() !== '' || domain.trim() !== '');

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch('/api/founders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            {
              linkedin: linkedin.trim() || undefined,
              name: name.trim() || undefined,
              role: role.trim() || undefined,
              domain: domain.trim() || undefined,
              note: note.trim() || undefined,
            },
          ],
          warm,
          replied,
        }),
      });
      const json = await readJson(res);
      if (json.error) {
        setLog([{ input: '—', status: 'error', detail: String(json.error) }]);
        return;
      }
      const rows = json.results as LogRow[];
      setLog(rows);
      setLinkedin('');
      setName('');
      setNameEdited(false);
      setDomain('');
      setRole('');
      setNote('');
      router.refresh();
      if (rows.some((r) => r.status === 'ok')) onAdded?.(rows);
    } catch (e) {
      setLog([{ input: '—', status: 'error', detail: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  return {
    linkedin, onLinkedinChange,
    name, setName, setNameEdited, nameEdited,
    domain, setDomain,
    role, setRole,
    note, setNote,
    warm, setWarm, replied, setReplied,
    log, busy, canSubmit, submit,
  };
}

export function AddLeadForm({
  autoFocus = false,
  onAdded,
}: {
  autoFocus?: boolean;
  onAdded?: (rows: LogRow[]) => void;
}) {
  const {
    linkedin, onLinkedinChange, name, setName, setNameEdited, nameEdited,
    domain, setDomain, note, setNote, warm, setWarm, replied, setReplied,
    log, busy, canSubmit, submit,
  } = useAddLead(onAdded);
  const [expanded, setExpanded] = useState(false);

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div>
      {/* Las dos entradas que importan, al mismo peso: una es el canal y la
          otra la marca, y ninguna manda sobre la otra. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          autoFocus={autoFocus}
          value={linkedin}
          onChange={(e) => onLinkedinChange(e.target.value)}
          onKeyDown={onEnter}
          aria-label="URL de LinkedIn del founder"
          placeholder="URL de LinkedIn del founder"
          className={FIELD}
        />
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={onEnter}
          aria-label="Dominio de la marca"
          placeholder="dominio de la marca"
          className={FIELD}
        />
      </div>

      {expanded && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
            onKeyDown={onEnter}
            aria-label="Nombre del founder"
            placeholder={
              linkedin && !nameEdited && name ? 'nombre (auto desde la URL)' : 'nombre del founder'
            }
            className={FIELD}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onEnter}
            aria-label="Nota · ángulo personal"
            placeholder="nota · ángulo personal"
            className={FIELD}
          />
        </div>
      )}

      {/* Pie: señales de temperatura a la izquierda, acción a la derecha. */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
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
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            {expanded ? '− menos campos' : '+ nombre y nota'}
          </button>
          <button onClick={submit} disabled={!canSubmit} className={`${BTN_CTA} px-6`}>
            {busy ? 'Añadiendo…' : 'Añadir'}
          </button>
        </div>
      </div>

      {log.length > 0 && <AddLeadLog rows={log} />}
    </div>
  );
}

export function AddLeadLog({ rows }: { rows: LogRow[] }) {
  return (
    <ul className="mt-3.5 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-2">
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
          <span className="text-sm font-medium">{r.name || r.input}</span>
          {r.detail && <span className="text-xs text-[var(--muted)]">— {r.detail}</span>}
          {/* Mismo botón que el resto del producto: si es una acción, se ve
              como las demás acciones. */}
          {r.status === 'ok' && r.domain && (
            <Link href={`/companies/${r.domain}`} className={`${BTN_OUTLINE} ml-auto`}>
              Ver ficha →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
