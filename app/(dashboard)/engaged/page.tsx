'use client';

import { useState } from 'react';

// Vista Engaged (spec §10.3): Sergio pega URLs/dominios de founders que
// interactuaron con sus posts. Cada línea entra al pipeline con source='engaged'
// y bonus de prioridad (+20). Warm siempre gana a cold.
export default function EngagedPage() {
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function process() {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    const results: string[] = [];
    for (const line of lines) {
      // Aceptar "dominio.com", "https://dominio.com" o "Nombre | dominio.com"
      const parts = line.split('|').map((p) => p.trim());
      const name = parts.length > 1 ? parts[0] : undefined;
      const url = parts.length > 1 ? parts[1] : parts[0];
      try {
        const res = await fetch('/api/scans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, name, source: 'engaged' }),
        });
        const json = await res.json();
        if (json.error) results.push(`✗ ${line}: ${json.error}`);
        else if (json.deduped) results.push(`· ${line}: ya existía`);
        else results.push(`✓ ${line}: ${json.demo ? json.message : 'en cola del Scanner'}`);
      } catch (e) {
        results.push(`✗ ${line}: ${e}`);
      }
    }
    setLog(results);
    setText('');
    setBusy(false);
  }

  return (
    <main className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Engaged</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Pega founders que interactuaron con tus posts, uno por línea. Formato libre:{' '}
        <code className="rounded bg-[var(--surface)] px-1">dominio.com</code> o{' '}
        <code className="rounded bg-[var(--surface)] px-1">Nombre | dominio.com</code>. Entran al
        pipeline con prioridad warm (+20).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'acmelabs.io\nJane Doe | janestartup.com'}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button
        onClick={process}
        disabled={busy || !text.trim()}
        className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Procesando…' : 'Procesar'}
      </button>
      {log.length > 0 && (
        <ul className="mt-6 space-y-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
