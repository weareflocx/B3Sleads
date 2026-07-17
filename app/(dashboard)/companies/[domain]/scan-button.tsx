'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scan } from '@/lib/types';

// Conecta la ficha con Brand3. Importa el análisis del Observatorio público
// (sin token): trae score, gaps y el link al informe de una marca ya escaneada.
export function ScanButton({
  domain,
  leadId,
  scan,
}: {
  domain: string;
  leadId: string;
  scan: Scan | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function importScan() {
    setBusy(true);
    setMsg(null);
    setNotFound(false);
    try {
      const res = await fetch('/api/scans/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, leadId }),
      });
      const json = await res.json();
      if (json.error) setMsg(`Error: ${json.error}`);
      else if (json.found === false) setNotFound(true);
      else router.refresh(); // ya tiene el scan: la ficha se repinta con score + gaps
    } catch (e) {
      setMsg(`Error: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  // Ya hay scan importado: enlace al informe
  if (scan?.status === 'ready' && scan.ui_url) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={scan.ui_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
        >
          Ver informe Brand3 ↗
        </a>
        <button
          onClick={importScan}
          disabled={busy}
          className="text-xs text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          {busy ? 'Actualizando…' : 're-importar'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={importScan}
          disabled={busy}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Importando…' : 'Importar scan de Brand3'}
        </button>
        {msg && <span className="text-xs text-[var(--muted)]">{msg}</span>}
      </div>
      {notFound && (
        <p className="text-xs text-[var(--muted)]">
          Esa marca aún no está en Brand3.{' '}
          <a
            href={`https://brand3.fly.dev/magnetism-scanner?url=https://${domain}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            Escanéala en brand3.fly.dev ↗
          </a>{' '}
          y vuelve a importarla.
        </p>
      )}
    </div>
  );
}
