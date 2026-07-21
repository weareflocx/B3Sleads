'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scan } from '@/lib/types';

// Conecta la ficha con B3S Scanner API. El navegador sólo usa endpoints
// internos de B3Sleads; las credenciales permanecen en el servidor.
export function ScanButton({
  companyId,
  domain,
  leadId,
  scan,
}: {
  companyId: string;
  domain: string;
  // Los fondos se escanean igual que las startups, pero no son un lead.
  leadId?: string | null;
  scan: Scan | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'launch' | 'url' | 'search' | null>(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  // El mensaje del servidor ya viene redactado para humanos; interpolar el
  // objeto Error añadía un "Error: Error:" delante.
  function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  useEffect(() => {
    if (!scan || !['queued', 'running'].includes(scan.status)) return;
    const localScanId = scan.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function sync() {
      try {
        const response = await fetch(`/api/scans/${localScanId}/sync`, { method: 'POST' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo sincronizar el scan');
        if (cancelled) return;
        if (['ready', 'failed', 'cancelled', 'blocked'].includes(body.scan?.status)) {
          router.refresh();
          return;
        }
      } catch (error) {
        if (!cancelled) setMsg({ text: `No pude sincronizar el scan: ${reason(error)}`, tone: 'error' });
      }
      if (!cancelled) timer = setTimeout(sync, 5_000);
    }

    timer = setTimeout(sync, 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, scan]);

  async function launchScan() {
    setBusy('launch');
    setMsg(null);
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch('/api/scans/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({ companyId, leadId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo lanzar el scan');
      idempotencyKey.current = null;
      router.refresh();
    } catch (error) {
      setMsg({ text: reason(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

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
      if (json.error) setMsg({ text: json.error, tone: 'error' });
      else if (json.found === false) setMsg({ text: json.message, tone: 'info' });
      else {
        setUrl('');
        router.refresh();
      }
    } catch (e) {
      setMsg({ text: reason(e), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Una sola fila: pegar un informe existente y lanzar uno nuevo son la
          misma decisión, así que las acciones van juntas. El input se queda
          en lo que mide una URL de informe, no ocupa todo el ancho. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && importScan({ reportUrl: url }, 'url')}
          placeholder="pega un informe: b3s.fly.dev/report/…"
          className="min-w-0 max-w-xs flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--cta)]"
        />
        <button
          onClick={() => importScan({ reportUrl: url }, 'url')}
          disabled={busy !== null || !url.trim()}
          className="rounded-md border border-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)] hover:text-[var(--cta-text)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--cta)]"
        >
          {busy === 'url' ? 'Importando…' : 'Importar'}
        </button>
        <button
          onClick={launchScan}
          disabled={busy !== null || scan?.status === 'running' || scan?.status === 'queued'}
          className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta-text)] disabled:opacity-50"
        >
          {busy === 'launch'
            ? 'Lanzando…'
            : scan?.status === 'running' || scan?.status === 'queued'
              ? 'Scan en curso…'
              : scan?.status === 'ready'
                ? 'Lanzar nuevo scan'
                : 'Escanear con B3S'}
        </button>
        {scan?.status === 'blocked' && (
          <span className="text-xs text-[var(--muted)]">Scan bloqueado por evidencia insuficiente.</span>
        )}
        {scan?.status === 'failed' && (
          <span className="text-xs text-[var(--danger)]">El último scan falló; puedes reintentarlo.</span>
        )}
      </div>

      {/* Búsqueda del último resultado por dominio en B3S API. */}
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

      {msg && (
        <p
          className={`text-xs ${msg.tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
