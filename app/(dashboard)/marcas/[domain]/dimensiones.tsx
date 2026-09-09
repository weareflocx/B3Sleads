'use client';

import { useMemo, useState } from 'react';
import { Select } from '../../select';
import { scoreColor } from '../../score-ring';
import { useEstudio } from './estudio-estado';
import { Radar, type LineaRadar } from './radar';
import { mediasPorDimension, type PerfilDimensiones, type PoliticaNulos } from '@/lib/dimensiones';
import {
  CAPAS,
  CAPA_LABEL,
  PRIORIDADES,
  PRIORIDAD_LABEL,
  type Capa,
} from '@/lib/battle-cards';

// La lectura de categoría, dimensión a dimensión.
//
// Los perfiles llegan del servidor porque salen de los scans; el filtro por
// capa y prioridad se aplica AQUÍ, contra el estado del estudio, para que
// reclasificar una marca cambie las medias sin recargar.

// Hasta cinco líneas en el radar. La del cliente siempre en el verde de la
// casa; las de los grupos, colores del sistema, no una paleta nueva.
const COLOR_GRUPO = ['var(--accent)', 'var(--linkedin-soft)', 'var(--warning)', 'var(--soft)'];

export function Dimensiones({
  perfiles,
  cliente,
  clienteNombre,
}: {
  perfiles: PerfilDimensiones[];
  cliente: PerfilDimensiones | null;
  clienteNombre: string;
}) {
  const { marcas } = useEstudio();
  const [politica, setPolitica] = useState<PoliticaNulos>('excluir');
  const [fCapa, setFCapa] = useState('');
  const [fPrioridad, setFPrioridad] = useState('');
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    const orden: string[] = [];
    const por = new Map<string, PerfilDimensiones[]>();
    for (const p of perfiles) {
      const f = marcas[p.dominio] ?? {};
      if (fCapa ? f.layer !== fCapa : false) continue;
      if (fPrioridad ? f.priority !== fPrioridad : f.priority === 'out') continue;
      if (!por.has(p.grupo)) {
        por.set(p.grupo, []);
        orden.push(p.grupo);
      }
      por.get(p.grupo)!.push(p);
    }
    return orden.map((nombre) => ({ nombre, perfiles: por.get(nombre)! }));
  }, [perfiles, marcas, fCapa, fPrioridad]);

  const filas = useMemo(
    () => mediasPorDimension({ porGrupo: grupos, cliente, politica }),
    [grupos, cliente, politica],
  );

  const lineas: LineaRadar[] = useMemo(() => {
    const out: LineaRadar[] = grupos.map((g, i) => ({
      clave: g.nombre,
      nombre: `${g.nombre} (${g.perfiles.length})`,
      color: COLOR_GRUPO[i % COLOR_GRUPO.length],
      valores: filas.map((f) => f.porGrupo.find((x) => x.nombre === g.nombre)?.celda.media ?? null),
    }));
    if (cliente) {
      out.push({
        clave: '__cliente__',
        nombre: clienteNombre,
        color: 'var(--cta)',
        grueso: true,
        valores: filas.map((f) => f.cliente.valor),
      });
    }
    return out.filter((l) => !apagadas.has(l.clave));
  }, [grupos, filas, cliente, clienteNombre, apagadas]);

  const todas: LineaRadar[] = useMemo(() => {
    const out: LineaRadar[] = grupos.map((g, i) => ({
      clave: g.nombre,
      nombre: `${g.nombre} (${g.perfiles.length})`,
      color: COLOR_GRUPO[i % COLOR_GRUPO.length],
      valores: [],
    }));
    if (cliente) out.push({ clave: '__cliente__', nombre: clienteNombre, color: 'var(--cta)', valores: [] });
    return out;
  }, [grupos, cliente, clienteNombre]);

  const pct = (v: number | null) => (v == null ? '—' : String(Math.round(v * 100)));
  const hayFiltro = Boolean(fCapa || fPrioridad);
  const MINI = 'font-mono text-[10px] uppercase tracking-wider';
  const anchoMinimo = 240 + (grupos.length + 1) * 118;

  if (!perfiles.length) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
        Ninguna marca del estudio tiene scan publicable todavía.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Qué entra en la media. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <span className={`${MINI} text-[var(--soft)]`}>media de</span>
        <Select value={fCapa} onChange={setFCapa} align="left" ariaLabel="Filtrar por capa"
          options={[
            { value: '', label: 'Todas las capas' },
            ...CAPAS.map((c) => ({ value: c, label: CAPA_LABEL[c] })),
          ]} />
        <Select value={fPrioridad} onChange={setFPrioridad} align="left" ariaLabel="Filtrar por prioridad"
          options={[
            { value: '', label: 'Sin las descartadas' },
            ...PRIORIDADES.map((p) => ({ value: p, label: PRIORIDAD_LABEL[p] })),
          ]} />
        {hayFiltro && (
          <button onClick={() => { setFCapa(''); setFPrioridad(''); }}
            className={`${MINI} rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]`}>
            quitar filtros
          </button>
        )}

        {/* Las dos lecturas. No es una preferencia: son dos preguntas. */}
        <span className="ml-auto flex items-center gap-2">
          <span className={`${MINI} text-[var(--soft)]`}>sin rastro</span>
          <Select value={politica} onChange={(v) => setPolitica(v as PoliticaNulos)} ariaLabel="Cómo contar los componentes sin rastro"
            options={[
              { value: 'excluir', label: 'fuera de la media' },
              { value: 'como-cero', label: 'cuenta como 0' },
            ]} />
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── La tabla ── */}
        <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="overflow-x-auto">
            <div style={{ minWidth: anchoMinimo }}>
              <div className="flex items-end gap-3 border-b border-[var(--border)] pb-2">
                <span className={`${MINI} w-[240px] shrink-0 text-[var(--soft)]`}>Dimensión</span>
                <span className={`${MINI} w-[110px] shrink-0 text-right text-[var(--cta)]`}>
                  {clienteNombre}
                </span>
                {grupos.map((g) => (
                  <span key={g.nombre} className={`${MINI} w-[110px] shrink-0 truncate text-right text-[var(--soft)]`}>
                    {g.nombre}
                  </span>
                ))}
              </div>

              <ul className="divide-y divide-[var(--border)]">
                {filas.map((f) => (
                  <li key={f.key} className="flex items-center gap-3 py-2">
                    <span className="w-[240px] shrink-0 truncate text-sm">{f.label}</span>
                    <span className="w-[110px] shrink-0 text-right">
                      {f.cliente.sinRastro ? (
                        <span className="font-mono text-[10px] text-[var(--soft)]">sin rastro</span>
                      ) : (
                        <span className="font-mono text-sm"
                          style={{ color: f.cliente.valor != null ? scoreColor(f.cliente.valor * 100) : undefined }}>
                          {pct(f.cliente.valor)}
                        </span>
                      )}
                    </span>
                    {f.porGrupo.map((g) => (
                      <span key={g.nombre} className="w-[110px] shrink-0 text-right">
                        <span className="font-mono text-sm"
                          style={{ color: g.celda.media != null ? scoreColor(g.celda.media * 100) : undefined }}>
                          {pct(g.celda.media)}
                        </span>
                        {/* n y sin rastro SIEMPRE al lado: una media de tres
                            marcas y una de diecinueve no valen lo mismo. */}
                        <span className="ml-1.5 font-mono text-[10px] text-[var(--soft)]">
                          n{g.celda.n}
                          {g.celda.sinRastro > 0 && politica === 'excluir' && `·${g.celda.sinRastro}✕`}
                        </span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--soft)]">
            n es cuántas marcas sostienen cada media. ✕ son las que el Scanner no llegó a leer en
            esa dimensión, y ahora mismo{' '}
            {politica === 'excluir' ? 'quedan fuera de la media' : 'cuentan como 0'}.
          </p>
        </div>

        {/* ── El radar ── */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <Radar filas={filas} lineas={lineas} />
          <ul className="mt-2 space-y-1">
            {todas.map((l) => {
              const encendida = !apagadas.has(l.clave);
              return (
                <li key={l.clave}>
                  <button
                    onClick={() =>
                      setApagadas((s) => {
                        const n = new Set(s);
                        if (n.has(l.clave)) n.delete(l.clave);
                        else n.add(l.clave);
                        return n;
                      })
                    }
                    className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-opacity hover:bg-[var(--surface-2)] ${encendida ? '' : 'opacity-40'}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                    <span className="min-w-0 truncate">{l.nombre}</span>
                    <span className={`ml-auto shrink-0 ${MINI} text-[var(--soft)]`}>
                      {encendida ? 'ver' : 'oculta'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
