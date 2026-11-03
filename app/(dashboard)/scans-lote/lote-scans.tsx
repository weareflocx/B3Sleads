'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface MarcaLote {
  domain: string;
  companyId: string | null;
  name: string | null;
  leadId: string | null;
  ultimaNota: number | null;
  ultimaFecha: string | null;
}

type Estado = { fase: 'pendiente' | 'lanzando' | 'escaneando' | 'listo' | 'error'; nota?: number | null; scanId?: string; detalle?: string };

const ESPERA = 15_000; // entre sondeos de cada scan en marcha

export function LoteScans({ marcas }: { marcas: MarcaLote[] }) {
  const validas = marcas.filter((m) => m.companyId);
  const faltan = marcas.filter((m) => !m.companyId);
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const [corriendo, setCorriendo] = useState(false);
  const pon = (d: string, e: Estado) => setEstado((s) => ({ ...s, [d]: { ...s[d], ...e } }));

  async function sondear(domain: string, scanId: string) {
    for (let i = 0; i < 160; i++) {
      await new Promise((r) => setTimeout(r, ESPERA));
      try {
        const r = await fetch(`/api/scans/${scanId}/sync`, { method: 'POST' });
        const j = (await r.json().catch(() => ({}))) as { scan?: { status?: string; score?: number | null } };
        const st = j.scan?.status;
        if (st === 'ready') return pon(domain, { fase: 'listo', nota: j.scan?.score ?? null });
        if (st === 'failed' || st === 'cancelled' || st === 'blocked') return pon(domain, { fase: 'error', detalle: `scan ${st}` });
      } catch {
        // Un sondeo fallido no tumba el lote: se reintenta en el siguiente.
      }
    }
    pon(domain, { fase: 'error', detalle: 'sigue en marcha tras 40 min: míralo en su ficha' });
  }

  async function lanzar() {
    setCorriendo(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const sondeos: Promise<void>[] = [];
    // Se lanzan de uno en uno (el Scanner encola) y se sondean en paralelo.
    for (const m of validas) {
      if (estado[m.domain]?.fase === 'listo') continue;
      pon(m.domain, { fase: 'lanzando' });
      try {
        const r = await fetch('/api/scans/launch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Mismo día y dominio: reintentar no gasta otro scan.
            'Idempotency-Key': `lote-${hoy}-${m.domain}`,
          },
          body: JSON.stringify({ companyId: m.companyId, leadId: m.leadId ?? undefined }),
        });
        const j = (await r.json().catch(() => ({}))) as { scan?: { id: string; status?: string; score?: number | null }; error?: string };
        if (!r.ok || !j.scan) {
          pon(m.domain, { fase: 'error', detalle: j.error ?? `error ${r.status}` });
          continue;
        }
        if (j.scan.status === 'ready') pon(m.domain, { fase: 'listo', nota: j.scan.score ?? null, scanId: j.scan.id });
        else {
          pon(m.domain, { fase: 'escaneando', scanId: j.scan.id });
          sondeos.push(sondear(m.domain, j.scan.id));
        }
      } catch {
        pon(m.domain, { fase: 'error', detalle: 'sin conexión con el servidor' });
      }
    }
    await Promise.all(sondeos);
    setCorriendo(false);
  }

  const listos = validas.filter((m) => estado[m.domain]?.fase === 'listo').length;
  const csv = () => {
    const filas = validas.map((m) => [m.name ?? m.domain, m.domain, estado[m.domain]?.nota ?? ''].join(';'));
    navigator.clipboard.writeText(['marca;dominio;nota', ...filas].join('\n'));
  };

  return (
    <div>
      {faltan.length > 0 && (
        <p className="mb-4 rounded-md border border-[var(--warning)]/40 px-3 py-2 text-sm text-[var(--warning)]">
          No están en Leads: {faltan.map((m) => m.domain).join(', ')}. Dalas de alta (o corrige su dominio) y vuelve a
          comprobar; si no, quedan fuera del lote.
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={lanzar}
          disabled={corriendo || validas.length === 0}
          className="rounded-md bg-[var(--btn-solid-bg)] px-4 py-2 text-sm font-medium text-[var(--btn-solid-text)] disabled:opacity-40"
        >
          {corriendo ? `Escaneando… ${listos}/${validas.length}` : `Lanzar ${validas.length} scans`}
        </button>
        <button onClick={csv} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--muted)]">
          Copiar resultados
        </button>
        <span className="text-xs text-[var(--muted)]">No cierres la pestaña hasta que terminen: el sondeo vive aquí.</span>
      </div>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm">
        {marcas.map((m) => {
          const e = estado[m.domain];
          return (
            <li key={m.domain} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate">
                {m.companyId ? (
                  <Link href={`/companies/${m.domain}`} className="font-medium hover:underline">
                    {m.name ?? m.domain}
                  </Link>
                ) : (
                  <span className="font-medium text-[var(--muted)]">{m.domain}</span>
                )}
                <span className="ml-2 font-mono text-xs text-[var(--soft)]">{m.domain}</span>
              </span>
              <span className="font-mono text-xs text-[var(--soft)]">
                {m.ultimaNota != null ? `antes ${m.ultimaNota} · ${m.ultimaFecha?.slice(0, 10)}` : 'sin scan previo'}
              </span>
              <span
                className={`w-40 text-right font-mono text-xs ${
                  e?.fase === 'listo' ? 'text-[var(--success)]' : e?.fase === 'error' ? 'text-[var(--danger)]' : 'text-[var(--muted)]'
                }`}
                title={e?.detalle}
              >
                {!m.companyId
                  ? 'no está en Leads'
                  : !e
                    ? 'pendiente'
                    : e.fase === 'listo'
                      ? `nota ${e.nota ?? 'retenida'}`
                      : e.fase === 'error'
                        ? `error: ${e.detalle ?? ''}`.slice(0, 40)
                        : e.fase}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
