'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { serializeGrupos, type Grupo } from '@/lib/benchmark';
import { CompanyLogo } from '../../company-logo';
import { ScoreRing } from '../../score-ring';
import { ScanProgress } from '../../scan-progress';

// Lo que un grupo necesita saber de cada marca. Es una vista fina a
// propósito: el scan entero pesa y aquí solo hace falta el estado.
export interface MarcaEnGrupo {
  domain: string;
  name: string;
  logoUrl: string | null;
  score: number | null;
  // listo: con puntuación · escaneando: job en marcha · retenido: scan
  // terminado sin puntuación publicable · sin-scan: nada todavía
  estado: 'listo' | 'escaneando' | 'retenido' | 'sin-scan';
  scanId: string | null;
  detectados: number;
}

const ESTADO: Record<MarcaEnGrupo['estado'], string> = {
  listo: '',
  escaneando: 'escaneando…',
  retenido: 'retenido',
  'sin-scan': 'sin scan',
};

export function GrupoEstudio({
  grupo,
  marcas,
  grupos,
  candidatas,
  hrefBase,
}: {
  grupo: Grupo;
  marcas: MarcaEnGrupo[];
  grupos: Grupo[];
  candidatas: { domain: string; name: string }[];
  hrefBase: string; // /marcas/<cliente>
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const aplicar = (gs: Grupo[]) => {
    const q = serializeGrupos(gs);
    router.replace(q ? `${pathname}?g=${q}` : pathname);
  };
  const query = serializeGrupos(grupos);

  // Mientras haya scans en marcha en este grupo, se les pregunta al servidor
  // y se refresca la página cuando terminan. Un scan tarda uno o dos
  // minutos; sin esto habría que recargar a mano para ver el resultado.
  const enMarcha = marcas.filter((m) => m.estado === 'escaneando' && m.scanId);
  const [progreso, setProgreso] = useState<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enMarcha.length) return;
    let parado = false;
    const tic = async () => {
      let alguno = false;
      for (const m of enMarcha) {
        try {
          const r = await fetch(`/api/scans/${m.scanId}/sync`, { method: 'POST' });
          const j = (await r.json()) as { scan?: { status?: string }; progress?: number };
          if (j.scan?.status && !['queued', 'running', 'blocked'].includes(j.scan.status)) alguno = true;
          if (typeof j.progress === 'number') setProgreso((p) => ({ ...p, [m.domain]: j.progress! }));
        } catch {}
      }
      if (parado) return;
      if (alguno) router.refresh();
      timer.current = setTimeout(tic, 8000);
    };
    tic();
    return () => {
      parado = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enMarcha.map((m) => m.scanId).join(',')]);

  const añadir = async () => {
    const d = texto.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!d) return;
    if (grupo.dominios.includes(d)) return setAviso('Ya está en este grupo.');
    setAviso(null);
    const meter = () =>
      aplicar(grupos.map((g) => (g.nombre === grupo.nombre ? { ...g, dominios: [...g.dominios, d] } : g)));

    // Si ya está en el corpus, no hay nada que lanzar. Si no, alta y scan.
    // El scan NO se espera: la marca entra ya al grupo como "escaneando" y
    // el sondeo la rellena cuando acabe.
    if (candidatas.some((c) => c.domain === d)) {
      setTexto('');
      return meter();
    }
    setOcupado(true);
    try {
      const r = await fetch('/api/estudio/marca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `Error ${r.status}`);
      setTexto('');
      meter();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo añadir.');
    } finally {
      setOcupado(false);
    }
  };

  const quitar = (d: string) =>
    aplicar(grupos.map((g) => (g.nombre === grupo.nombre ? { ...g, dominios: g.dominios.filter((x) => x !== d) } : g)));

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          {grupo.nombre}
          <span className="ml-2 font-mono text-xs font-normal text-[var(--soft)]">{marcas.length}</span>
        </h3>
        <button
          onClick={() => aplicar(grupos.filter((g) => g.nombre !== grupo.nombre))}
          className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
        >
          quitar grupo
        </button>
      </header>

      {marcas.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {marcas.map((m) => (
            <li key={m.domain} className="flex items-center gap-3 px-4 py-2.5">
              <Link
                href={`${hrefBase}/${m.domain}${query ? `?g=${query}` : ''}`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
              >
                <CompanyLogo domain={m.domain} name={m.name} size={30} src={m.logoUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block font-mono text-[11px] text-[var(--soft)]">
                    {m.domain}
                    {m.estado === 'listo' && m.detectados < 8 && ` · ${m.detectados}/10 detectados`}
                  </span>
                </span>
              </Link>
              <span className="flex shrink-0 items-center gap-3">
                {m.estado === 'listo' && m.score != null ? (
                  <ScoreRing score={m.score} size={26} />
                ) : m.estado === 'escaneando' ? (
                  <span className="w-28">
                    <ScanProgress value={progreso[m.domain] ?? 8} label={null} />
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-[var(--soft)]">{ESTADO[m.estado]}</span>
                )}
                <button
                  onClick={() => quitar(m.domain)}
                  className="text-xs text-[var(--soft)] hover:text-[var(--danger)]"
                  title="Quitar del grupo"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Un solo campo para las dos cosas: pegar un dominio nuevo o elegir uno
          del corpus. Distinguirlas con dos controles obligaría a saber de
          antemano si una marca ya está escaneada, que es justo lo que no se
          sabe. */}
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <input
            list={`corpus-${grupo.nombre}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !ocupado && añadir()}
            placeholder="dominio.com · nueva o del corpus"
            disabled={ocupado}
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-sm outline-none transition-colors focus:border-[var(--cta)] disabled:opacity-60"
          />
          <datalist id={`corpus-${grupo.nombre}`}>
            {candidatas.map((c) => (
              <option key={c.domain} value={c.domain}>
                {c.name}
              </option>
            ))}
          </datalist>
          <button
            onClick={añadir}
            disabled={ocupado || !texto.trim()}
            className="rounded-md bg-[var(--text)] px-3 py-1.5 text-sm text-[var(--bg)] transition-opacity disabled:opacity-40"
          >
            {ocupado ? 'lanzando…' : 'Añadir'}
          </button>
        </div>
        {aviso && <p className="mt-2 text-xs text-[var(--danger)]">{aviso}</p>}
      </div>
    </section>
  );
}
