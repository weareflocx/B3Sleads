'use client';

import { useState } from 'react';
import type { Scan } from '@/lib/types';

// Conecta la ficha con el Brand3 Scanner: lanza el scan o muestra su estado.
export function ScanButton({
  domain,
  companyName,
  scan,
}: {
  domain: string;
  companyName: string;
  scan: Scan | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function launch() {
    setBusy(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: domain, name: companyName, source: 'manual' }),
      });
      const json = await res.json();
      setResult(json.error ? `Error: ${json.error}` : json.message || 'Scan lanzado. Vuelve en unos minutos.');
    } catch (e) {
      setResult(`Error: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  if (scan?.status === 'ready') {
    return scan.ui_url ? (
      <a
        href={scan.ui_url}
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
      >
        Ver informe Brand3 ↗
      </a>
    ) : null;
  }

  if (scan && ['queued', 'running'].includes(scan.status)) {
    return (
      <span className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)]">
        Escaneando marca…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={launch}
        disabled={busy}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Lanzando…' : scan?.status === 'failed' ? 'Reintentar scan' : 'Escanear marca'}
      </button>
      {result && <span className="text-xs text-[var(--muted)]">{result}</span>}
    </div>
  );
}
