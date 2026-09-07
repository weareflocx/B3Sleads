'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Grupo } from '@/lib/benchmark';
import { CompanyLogo } from '../../company-logo';
import { ScoreRing } from '../../score-ring';
import { ScanProgress } from '../../scan-progress';
import { NotaMarca } from './nota-marca';
import { useEstudio } from './estudio-estado';

// Lo que el SERVIDOR sabe de cada marca: su scan y su identidad. Es una
// vista fina a propósito, el scan entero pesa. Va indexada por dominio y sin
// orden: la composición (a qué grupo pertenece, en qué posición y si está
// oculta) es del cliente, y por eso se refleja al instante al tocarla.
export interface DatosMarca {
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

// Lo de arriba más lo que aporta el grupo.
export interface MarcaEnGrupo extends DatosMarca {
  oculta: boolean;
  nota: string | null;
}

function sinDatos(domain: string): DatosMarca {
  return { domain, name: domain, logoUrl: null, score: null, estado: 'sin-scan', scanId: null, detectados: 0 };
}

const ESTADO: Record<MarcaEnGrupo['estado'], string> = {
  listo: '',
  escaneando: 'escaneando…',
  retenido: 'retenido',
  'sin-scan': 'sin scan',
};

const MINI =
  'inline-flex h-6 min-w-6 items-center justify-center rounded border border-[var(--border)] px-1.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--muted)]';

export function GrupoEstudio({
  nombre,
  datos,
  candidatas,
  hrefBase,
  cliente,
}: {
  // El grupo se identifica por nombre y se lee del estado del estudio, no de
  // una prop: así reordenar u ocultar se ve en el acto.
  nombre: string;
  datos: Record<string, DatosMarca>;
  candidatas: { domain: string; name: string }[];
  hrefBase: string; // /marcas/<cliente>
  cliente: string; // dominio del cliente, para guardar las notas
}) {
  const router = useRouter();
  const { grupos, editar: editarEstudio, query } = useEstudio();
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verOcultas, setVerOcultas] = useState(false);

  const grupo = grupos.find((g) => g.nombre === nombre);
  const editar = (fn: (g: Grupo) => Grupo) =>
    editarEstudio((gs) => gs.map((g) => (g.nombre === nombre ? fn(g) : g)));

  const marcas: MarcaEnGrupo[] = (grupo?.dominios ?? []).map((d) => ({
    ...(datos[d] ?? sinDatos(d)),
    oculta: (grupo?.ocultas ?? []).includes(d),
    nota: grupo?.notas?.[d] ?? null,
  }));

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
    if (grupo?.dominios.includes(d)) return setAviso('Ya está en este grupo.');
    setAviso(null);
    const meter = () => editar((g) => ({ ...g, dominios: [...g.dominios, d] }));

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

  // Las operaciones sobre una marca. Todas pasan por la URL, como añadir:
  // un solo camino para el estado del estudio, y el guardado va detrás.
  const quitar = (d: string) =>
    editar((g) => ({
      ...g,
      dominios: g.dominios.filter((x) => x !== d),
      ocultas: (g.ocultas ?? []).filter((x) => x !== d),
    }));

  const mover = (d: string, paso: -1 | 1) =>
    editar((g) => {
      // Se mueve entre las de su misma clase (visibles con visibles): saltar
      // por encima de una oculta no se vería y parecería que no hizo nada.
      const ocultas = new Set(g.ocultas ?? []);
      const misma = g.dominios.filter((x) => ocultas.has(x) === ocultas.has(d));
      const i = misma.indexOf(d);
      const j = i + paso;
      if (i < 0 || j < 0 || j >= misma.length) return g;
      const vecino = misma[j];
      const a = g.dominios.indexOf(d);
      const b = g.dominios.indexOf(vecino);
      const dominios = [...g.dominios];
      dominios[a] = vecino;
      dominios[b] = d;
      return { ...g, dominios };
    });

  const ocultar = (d: string, si: boolean) =>
    editar((g) => {
      const resto = (g.ocultas ?? []).filter((x) => x !== d);
      const ocultas = si ? [...resto, d] : resto;
      return { ...g, ocultas: ocultas.length ? ocultas : undefined };
    });

  const moverA = (d: string, destino: string) => {
    if (!destino || destino === nombre) return;
    editarEstudio((gs) =>
      gs.map((g) => {
        if (g.nombre === nombre) {
          return {
            ...g,
            dominios: g.dominios.filter((x) => x !== d),
            ocultas: (g.ocultas ?? []).filter((x) => x !== d),
          };
        }
        if (g.nombre === destino && !g.dominios.includes(d)) {
          return { ...g, dominios: [...g.dominios, d] };
        }
        return g;
      }),
    );
  };

  const visibles = marcas.filter((m) => !m.oculta);
  const ocultas = marcas.filter((m) => m.oculta);
  const otros = grupos.filter((g) => g.nombre !== nombre);

  function Fila({ m, lista }: { m: MarcaEnGrupo; lista: MarcaEnGrupo[] }) {
    const i = lista.indexOf(m);
    return (
      <li className={`group flex items-start gap-3 px-4 py-2.5 ${m.oculta ? 'opacity-60' : ''}`}>
        <Link
          href={`${hrefBase}/${m.domain}${query ? `?g=${query}` : ''}`}
          className="mt-0.5 shrink-0"
          tabIndex={-1}
        >
          <CompanyLogo domain={m.domain} name={m.name} size={30} src={m.logoUrl} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`${hrefBase}/${m.domain}${query ? `?g=${query}` : ''}`}
              className="min-w-0 hover:underline"
            >
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="block font-mono text-[11px] text-[var(--soft)]">
                {m.domain}
                {m.estado === 'listo' && m.detectados < 8 && ` · ${m.detectados}/10 detectados`}
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
            </span>
          </div>

          {/* El porqué, editable donde se lee. */}
          <NotaMarca cliente={cliente} marca={m.domain} inicial={m.nota} className="mt-1" />

          {/* Los mandos, en su propia línea y discretos: aparecen al pasar
              por la fila. Son gestos de montaje, no de lectura. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            {!m.oculta && (
              <>
                <button onClick={() => mover(m.domain, -1)} disabled={i <= 0} className={MINI} title="Subir">
                  ↑
                </button>
                <button
                  onClick={() => mover(m.domain, 1)}
                  disabled={i >= lista.length - 1}
                  className={MINI}
                  title="Bajar"
                >
                  ↓
                </button>
              </>
            )}
            {m.oculta ? (
              <button
                onClick={() => ocultar(m.domain, false)}
                className={`${MINI} border-[var(--cta)]/50 text-[var(--cta)]`}
                title="Vuelve a entrar en la comparación"
              >
                volver al estudio
              </button>
            ) : (
              <button
                onClick={() => ocultar(m.domain, true)}
                className={MINI}
                title="Sigue en el grupo, sale de la matriz y de las medias"
              >
                ocultar
              </button>
            )}
            {otros.length > 0 && (
              <select
                value=""
                onChange={(e) => moverA(m.domain, e.target.value)}
                className={`${MINI} cursor-pointer appearance-none bg-transparent pr-1.5`}
                title="Mover a otro grupo"
                aria-label={`Mover ${m.name} a otro grupo`}
              >
                <option value="">mover a…</option>
                {otros.map((g) => (
                  <option key={g.nombre} value={g.nombre}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => quitar(m.domain)}
              className={`${MINI} ml-auto hover:border-[var(--danger)] hover:text-[var(--danger)]`}
              title="Quitar del grupo (el scan y la nota no se borran del corpus)"
            >
              quitar
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          {nombre}
          <span className="ml-2 font-mono text-xs font-normal text-[var(--soft)]">
            {visibles.length}
            {ocultas.length > 0 && ` · ${ocultas.length} fuera`}
          </span>
        </h3>
        <button
          onClick={() => editarEstudio((gs) => gs.filter((g) => g.nombre !== nombre))}
          className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
        >
          quitar grupo
        </button>
      </header>

      {visibles.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {visibles.map((m) => (
            <Fila key={m.domain} m={m} lista={visibles} />
          ))}
        </ul>
      )}

      {/* Las ocultas, plegadas: se ve cuántas hay sin que ocupen la lista.
          Volver a meterlas es un clic, y la nota de por qué estaban sigue. */}
      {ocultas.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <button
            onClick={() => setVerOcultas((v) => !v)}
            aria-expanded={verOcultas}
            className="flex w-full items-center justify-between px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-[var(--soft)] hover:text-[var(--muted)]"
          >
            <span>
              {ocultas.length === 1 ? '1 marca fuera de la comparación' : `${ocultas.length} marcas fuera de la comparación`}
            </span>
            <span>{verOcultas ? '−' : '+'}</span>
          </button>
          {verOcultas && (
            <ul className="divide-y divide-[var(--border)] border-t border-dashed border-[var(--border)]">
              {ocultas.map((m) => (
                <Fila key={m.domain} m={m} lista={ocultas} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Un solo campo para las dos cosas: pegar un dominio nuevo o elegir uno
          del corpus. Distinguirlas con dos controles obligaría a saber de
          antemano si una marca ya está escaneada, que es justo lo que no se
          sabe. */}
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <input
            list={`corpus-${nombre}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !ocupado && añadir()}
            placeholder="dominio.com · nueva o del corpus"
            disabled={ocupado}
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-sm outline-none transition-colors focus:border-[var(--cta)] disabled:opacity-60"
          />
          <datalist id={`corpus-${nombre}`}>
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
