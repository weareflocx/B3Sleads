'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Import manual de founders. Sergio pega lo que ya está viendo en LinkedIn.
// Formatos aceptados por línea:
//   https://www.linkedin.com/in/janedoe
//   https://www.linkedin.com/in/janedoe | Jane Doe | acmelabs.io
//   janedoe | Jane Doe | Acme Labs | acmelabs.io | comentó el post de marca
function parseLine(line: string) {
  const parts = line.split('|').map((p) => p.trim());
  const [linkedin, name, third, fourth, note] = parts;
  // El dominio es la parte que parece dominio; el resto, nombre de empresa
  const looksDomain = (s?: string) => !!s && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.replace(/^https?:\/\//, ''));
  return {
    linkedin,
    name: name || undefined,
    company: looksDomain(third) ? undefined : third || undefined,
    domain: looksDomain(third) ? third : looksDomain(fourth) ? fourth : undefined,
    note: note || undefined,
  };
}

export function ImportBox() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [warm, setWarm] = useState(false);
  const [log, setLog] = useState<{ input: string; status: string; detail?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const entries = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseLine);
    if (!entries.length) return;
    setBusy(true);
    try {
      const res = await fetch('/api/founders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, warm }),
      });
      const json = await res.json();
      if (json.error) setLog([{ input: '—', status: 'error', detail: json.error }]);
      else {
        setLog(json.results);
        setText('');
        router.refresh(); // recarga la cola para ver los founders recién añadidos
      }
    } catch (e) {
      setLog([{ input: '—', status: 'error', detail: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-semibold">Añadir founders</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Pega perfiles que ya estés viendo en LinkedIn, uno por línea. Un perfil por línea, con lo
        que sepas separado por <code className="rounded bg-[var(--bg)] px-1">|</code>:
        <br />
        <code className="mt-1 inline-block rounded bg-[var(--bg)] px-1 py-0.5">
          url-linkedin | nombre | empresa | dominio.com | ángulo personal
        </code>
        <br />
        Con dominio, se crea la ficha y se lanza el Brand3 Scanner automáticamente.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={
          'https://www.linkedin.com/in/janedoe | Jane Doe | Acme Labs | acmelabs.io | comentó mi post sobre marcas que no aguantan el pivot\nhttps://www.linkedin.com/in/maxweber | Max Weber | verdeo.eu'
        }
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm outline-none focus:border-[var(--accent)]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Procesando…' : 'Añadir a la cola'}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={warm}
            onChange={(e) => setWarm(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Interactuaron con mis posts (warm, +20 de prioridad)
        </label>
      </div>
      {log.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs">
          {log.map((r, i) => (
            <li key={i}>
              <span
                className={
                  r.status === 'ok'
                    ? 'text-green-400'
                    : r.status === 'error'
                      ? 'text-red-400'
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
