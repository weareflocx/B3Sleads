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
  // Progreso del job remoto (0..100, ya normalizado por el servidor).
  const [progress, setProgress] = useState<{ value: number; phase: string | null } | null>(null);
  // Último valor confirmado por el servidor: el goteo visual nunca lo
  // adelanta en más de unos puntos, para no mentir.
  const serverPct = useRef(0);

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

    // La barra combina dos fuentes: el progreso real del servidor (suelo) y
    // una curva temporal calibrada con las duraciones reales de los scans
    // (mediana 89s, p75 99s): pct = 95·(1 − e^(−t/40)). Así en un scan
    // típico se cruza el rojo en ~30s, el azul hacia el minuto y se llega
    // al verde antes del final; el 95% es techo hasta que el servidor
    // confirma. Se ancla a created_at, así que sobrevive a recargas.
    const t0 = new Date(scan.created_at).getTime();
    const displayPct = () => {
      const elapsed = Math.max(0, (Date.now() - t0) / 1000);
      const curve = 95 * (1 - Math.exp(-elapsed / 40));
      return Math.min(95, Math.max(serverPct.current, curve, 2));
    };
    setProgress((p) => ({ value: Math.max(p?.value ?? 0, displayPct()), phase: p?.phase ?? null }));
    const trickle = setInterval(() => {
      setProgress((p) => {
        const next = displayPct();
        if (!p) return { value: next, phase: null };
        return p.value >= next ? p : { ...p, value: next };
      });
    }, 1_000);

    async function sync() {
      try {
        const response = await fetch(`/api/scans/${localScanId}/sync`, { method: 'POST' });
        const body = await readJson(response);
        if (cancelled) return;
        // Un timeout suelto durante el sondeo no merece alarma: se reintenta.
        if (body === null) {
          if (!cancelled) timer = setTimeout(sync, 3_000);
          return;
        }
        if (!response.ok) throw new Error((body.error as string) || 'No se pudo sincronizar el scan');
        if (typeof body.progress === 'number') {
          const confirmed = body.progress as number;
          serverPct.current = confirmed;
          // Nunca hacia atrás: si el goteo iba por delante, se queda donde está.
          setProgress((p) => ({
            value: Math.max(p?.value ?? 0, confirmed),
            phase: (body.phase as string | null) ?? null,
          }));
        }
        const status = (body.scan as { status?: string } | undefined)?.status;
        if (status && ['ready', 'failed', 'cancelled', 'blocked'].includes(status)) {
          if (status === 'ready') {
            // El remate: la barra se llena hasta el verde final antes de que
            // el refresco la sustituya por el resultado.
            setProgress((p) => ({ value: 100, phase: p?.phase ?? null }));
            setTimeout(() => router.refresh(), 800);
          } else {
            setProgress(null);
            router.refresh();
          }
          return;
        }
      } catch (error) {
        if (!cancelled) setMsg({ text: `No pude sincronizar el scan: ${reason(error)}`, tone: 'error' });
      }
      if (!cancelled) timer = setTimeout(sync, 3_000);
    }

    timer = setTimeout(sync, 600);
    return () => {
      cancelled = true;
      clearInterval(trickle);
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

  // Cabecera de estado sobre el botón: espeja la fila de avatar de la ficha
  // del founder, así "Lanzar scan" queda a la altura de "Abrir LinkedIn".
  function relTime(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return 'hoy';
    if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30);
    return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  }
  const estado: { text: string; tone: 'muted' | 'danger' | 'warning' } = running
    ? { text: 'Scan en curso…', tone: 'muted' }
    : scan?.status === 'failed'
      ? { text: 'El último scan falló. Puedes reintentarlo.', tone: 'danger' }
      : scan?.status === 'blocked'
        ? { text: 'Bloqueado por evidencia insuficiente.', tone: 'warning' }
        : scan?.status === 'ready'
          ? { text: `Último scan ${relTime(scan.completed_at ?? scan.created_at)}`, tone: 'muted' }
          : { text: 'Sin scan todavía', tone: 'muted' };

  return (
    <div className="flex h-full flex-col">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">Estado</p>
      <p
        className={`mt-1 text-sm ${
          estado.tone === 'danger'
            ? 'text-[var(--danger)]'
            : estado.tone === 'warning'
              ? 'text-[var(--warning)]'
              : 'text-[var(--muted)]'
        }`}
      >
        {estado.text}
      </p>

      <button
        onClick={launchScan}
        disabled={busy !== null || running}
        className="mt-3 w-full rounded-md bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-text)] disabled:opacity-50"
      >
        {busy === 'launch' ? 'Lanzando…' : running ? 'Scan en curso…' : 'Lanzar scan'}
      </button>

      {/* Mientras el scan corre, solo las barras: el color (rojo → azul →
          verde) ya cuenta cuánto queda, sin números que distraigan. */}
      {running && progress && (
        <div className="py-2 text-[var(--text)]">
          <ScanProgress value={progress.value} label={progress.phase} />
        </div>
      )}

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
          O importa un informe
        </p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && importScan({ reportUrl: url }, 'url')}
          placeholder="b3s.fly.dev/report/…"
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--cta)]"
        />
        <button
          onClick={() => importScan({ reportUrl: url }, 'url')}
          disabled={busy !== null || !url.trim()}
          className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
        >
          {busy === 'url' ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {/* Cada acción secundaria en su propia línea: nada de saltos raros. */}
      <div className="mt-auto flex flex-col items-start gap-1 pt-3 font-mono text-[11px]">
        <button
          onClick={() => importScan({ domain }, 'search')}
          disabled={busy !== null}
          className="text-[var(--muted)] transition-colors hover:text-[var(--cta)] disabled:opacity-50"
        >
          {busy === 'search' ? 'buscando…' : 'buscar por dominio en el histórico'}
        </button>
        <a
          href="https://b3s.fly.dev/"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--muted)] transition-colors hover:text-[var(--cta)]"
        >
          escanear en b3s.fly.dev ↗
        </a>
      </div>

      {msg && (
        <p
          className={`mt-2 text-xs ${msg.tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
