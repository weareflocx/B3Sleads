'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scan } from '@/lib/types';

// Conecta la ficha con B3S. Dos vías (sin token):
//  - pegar la URL de un informe de b3s.fly.dev (la fiable)
//  - buscar por dominio en el Observatorio de brand3.fly.dev
// Cada import añade un scan al histórico de la marca.
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
  const [busy, setBusy] = useState<'url' | 'search' | null>(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function importScan(body: Record<string, string>, which: 'url' | 'search') {
    setBusy(which);
    setMsg(null);
    try {
      const res = await fetch('/api/scans/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, ...body }),
      });
      const json = await res.json();
      if (json.error) setMsg(`Error: ${json.error}`);
      else if (json.found === false) setMsg(json.message);
      else {
        setUrl('');
        router.refresh();
      }
    } catch (e) {
      setMsg(`Error: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Pegar la URL del informe: la vía fiable */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && importScan({ reportUrl: url }, 'url')}
          placeholder="pega la URL del informe: b3s.fly.dev/report/…"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--cta)]"
        />
        <button
          onClick={() => importScan({ reportUrl: url }, 'url')}
          disabled={busy !== null || !url.trim()}
          className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta-text)] disabled:opacity-50"
        >
          {busy === 'url' ? 'Importando…' : scan?.status === 'ready' ? 'Añadir scan' : 'Importar'}
        </button>
      </div>

      {/* Búsqueda automática por dominio (Observatorio brand3.fly.dev) */}
      <div className="flex items-center gap-3 text-xs">
        <button
          onClick={() => importScan({ domain }, 'search')}
          disabled={busy !== null}
          className="text-[var(--muted)] hover:text-[var(--cta)] disabled:opacity-50"
        >
          {busy === 'search' ? 'Buscando…' : 'o buscar por dominio en el histórico'}
        </button>
        <a
          href={`https://b3s.fly.dev/`}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--muted)] hover:text-[var(--cta)]"
        >
          escanear en b3s.fly.dev ↗
        </a>
      </div>

      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
