'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scan } from '@/lib/types';
import { ScanProgress } from '../../scan-progress';

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
  // Progreso del job remoto, tal cual lo reporta la API en cada sondeo.
  const [progress, setProgress] = useState<{ value: number; phase: string | null } | null>(null);

  // El mensaje del servidor ya viene redactado para humanos; interpolar el
  // objeto Error añadía un "Error: Error:" delante.
  function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  // Si la función tarda más de lo que aguanta el hosting (Netlify corta a los
  // ~10s), la respuesta no es JSON sino su página de error en HTML. Leerla con
  // .json() soltaba un "Unexpected token '<'" que no dice nada. Se detecta y
  // se trata aparte: el trabajo suele haberse creado igual en el servidor.
  async function readJson(res: Response): Promise<Record<string, unknown> | null> {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!scan || !['queued', 'running'].includes(scan.status)) return;
    const localScanId = scan.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function sync() {
      try {
        const response = await fetch(`/api/scans/${localScanId}/sync`, { method: 'POST' });
        const body = await readJson(response);
        if (cancelled) return;
        // Un timeout suelto durante el sondeo no merece alarma: se reintenta.
        if (body === null) {
          if (!cancelled) timer = setTimeout(sync, 5_000);
          return;
        }
        if (!response.ok) throw new Error((body.error as string) || 'No se pudo sincronizar el scan');
        if (typeof body.progress === 'number') {
          setProgress({ value: body.progress, phase: (body.phase as string | null) ?? null });
        }
        const status = (body.scan as { status?: string } | undefined)?.status;
        if (status && ['ready', 'failed', 'cancelled', 'blocked'].includes(status)) {
          setProgress(null);
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
      const body = await readJson(response);
      if (body === null) {
        // El hosting cortó la respuesta, pero el scan ya se habrá creado.
        // No se afirma que haya ido bien: se refresca y que hable el estado.
        setMsg({
          text: 'La respuesta ha tardado más de la cuenta. Compruebo si el scan ha arrancado…',
          tone: 'info',
        });
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error((body.error as string) || 'No se pudo lanzar el scan');
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
      const json = await readJson(res);
      if (json === null) {
        setMsg({
          text: 'La respuesta ha tardado más de la cuenta. Recarga la ficha para ver si el informe ha entrado.',
          tone: 'info',
        });
        return;
      }
      if (json.error) setMsg({ text: String(json.error), tone: 'error' });
      else if (json.found === false) setMsg({ text: String(json.message), tone: 'info' });
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

  const running = scan?.status === 'running' || scan?.status === 'queued';

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

      {/* Mientras el scan corre, solo las barras: el color (rojo → azul →
          verde) ya cuenta cuánto queda, sin números que distraigan. */}
      {running && progress && (
        <div className="py-1 text-[var(--text)]">
          <ScanProgress value={progress.value} label={progress.phase} />
        </div>
      )}

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
