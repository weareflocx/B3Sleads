'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CompanyLogo } from '../../company-logo';
import { Select } from '../../select';
import { useEstudio } from './estudio-estado';
import type { DatosMarca } from './grupo-estudio';
import {
  CAPAS,
  CAPA_LABEL,
  PRIORIDADES,
  PRIORIDAD_LABEL,
  ROLES,
  ROL_LABEL,
  VERIFICACIONES,
  VERIFICACION_LABEL,
  pesoPrioridad,
  type Capa,
  type Prioridad,
  type Rol,
  type Verificacion,
} from '@/lib/battle-cards';

// La rejilla de clasificación: una fila por marca y una columna por decisión.
//
// Existe porque clasificar cuarenta marcas tarjeta a tarjeta es lento y
// obliga a recordar lo que pusiste tres marcas atrás. Puestas en columna, el
// criterio se ve como lo que es: un reparto. Que una capa tenga catorce
// marcas y otra dos se lee de un vistazo, y ahí es donde se corrige.
//
// La lista de grupos sigue siendo la lista: allí solo se lee el resultado.

const SIN = '—';

const OPCIONES_ROL = [{ value: '', label: SIN }, ...ROLES.map((r) => ({ value: r, label: ROL_LABEL[r] }))];
const OPCIONES_CAPA = [{ value: '', label: SIN }, ...CAPAS.map((c) => ({ value: c, label: CAPA_LABEL[c] }))];
const OPCIONES_PRIORIDAD = [
  { value: '', label: SIN },
  ...PRIORIDADES.map((p) => ({ value: p, label: PRIORIDAD_LABEL[p] })),
];
const OPCIONES_VERIFICACION = VERIFICACIONES.map((v) => ({ value: v, label: VERIFICACION_LABEL[v] }));

export const TONO_VERIFICACION: Record<Verificacion, string> = {
  verified: 'bg-[var(--success)]',
  pending: 'bg-[var(--warning)]',
  no_source: 'bg-[var(--soft)]',
};

// Mismo criterio que el score general: rojo por debajo de 50, azul hasta 75,
// verde por encima. Un número suelto en una tabla no dice nada sin la banda.
function tonoScore(n: number | null): string {
  if (n == null) return 'text-[var(--soft)]';
  if (n <= 50) return 'text-[var(--accent)]';
  if (n <= 75) return 'text-[var(--linkedin-soft)]';
  return 'text-[var(--cta)]';
}

type Orden = 'prioridad' | 'score' | 'nombre' | 'grupo';

export function TablaClasificacion({
  datos,
  hrefBase,
}: {
  datos: Record<string, DatosMarca>;
  hrefBase: string;
}) {
  const { grupos, marcas, clasificar, query } = useEstudio();
  const [abierta, setAbierta] = useState(false);
  const [fRol, setFRol] = useState('');
  const [fCapa, setFCapa] = useState('');
  const [fPrioridad, setFPrioridad] = useState('');
  const [fGrupo, setFGrupo] = useState('');
  const [orden, setOrden] = useState<Orden>('grupo');

  // Una fila por marca del estudio, con el grupo del que viene. El orden de
  // partida es el del estudio; el selector lo cambia sin tocar nada.
  const filas = useMemo(() => {
    const out: { dominio: string; grupo: string; datos: DatosMarca }[] = [];
    for (const g of grupos) {
      for (const d of g.dominios) {
        out.push({
          dominio: d,
          grupo: g.nombre,
          datos: datos[d] ?? {
            domain: d,
            name: d,
            logoUrl: null,
            score: null,
            estado: 'sin-scan',
            scanId: null,
            detectados: 0,
          },
        });
      }
    }
    return out;
  }, [grupos, datos]);

  const visibles = useMemo(() => {
    const filtradas = filas.filter((f) => {
      const m = marcas[f.dominio] ?? {};
      if (fRol && m.role !== fRol) return false;
      if (fCapa && m.layer !== fCapa) return false;
      if (fPrioridad && m.priority !== fPrioridad) return false;
      if (fGrupo && f.grupo !== fGrupo) return false;
      return true;
    });
    const cmp: Record<Orden, (a: typeof filtradas[number], b: typeof filtradas[number]) => number> = {
      // Núcleo primero, Fuera al final: el orden en que se lee un estudio.
      prioridad: (a, b) =>
        pesoPrioridad(marcas[a.dominio]?.priority) - pesoPrioridad(marcas[b.dominio]?.priority) ||
        (b.datos.score ?? -1) - (a.datos.score ?? -1),
      score: (a, b) => (b.datos.score ?? -1) - (a.datos.score ?? -1),
      nombre: (a, b) => a.datos.name.localeCompare(b.datos.name),
      grupo: () => 0, // el orden del estudio, tal cual
    };
    return [...filtradas].sort(cmp[orden]);
  }, [filas, marcas, fRol, fCapa, fPrioridad, fGrupo, orden]);

  const hayFiltro = Boolean(fRol || fCapa || fPrioridad || fGrupo);
  const sinClasificar = filas.filter((f) => !marcas[f.dominio]?.priority).length;

  // Con el cliente y cuatro grupos la tabla no cabe en un portátil. Se
  // desplaza dentro de su caja y la columna de la marca se queda fija: sin
  // eso, al empujar a la derecha pierdes de vista qué fila estás tocando.
  const ANCHO_MINIMO = 1080;
  const fijo = 'sticky left-0 z-10 bg-[var(--surface)]';

  return (
    <section className="mt-8">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--muted)]"
      >
        <span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Clasificación
          </span>
          <span className="ml-3 text-sm text-[var(--muted)]">
            {filas.length} marcas
            {sinClasificar > 0 && (
              <span className="ml-2 text-[var(--soft)]">· {sinClasificar} sin prioridad</span>
            )}
          </span>
        </span>
        <span className="font-mono text-sm text-[var(--muted)]">{abierta ? '−' : '+'}</span>
      </button>

      {abierta && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          {/* Filtros y orden. Filtrar por capa y prioridad es lo que convierte
              cuarenta marcas en las seis que sostienen el argumento. */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fGrupo} onChange={setFGrupo} align="left" ariaLabel="Filtrar por grupo"
              options={[{ value: '', label: 'Todos los grupos' }, ...grupos.map((g) => ({ value: g.nombre, label: g.nombre }))]} />
            <Select value={fRol} onChange={setFRol} align="left" ariaLabel="Filtrar por rol"
              options={[{ value: '', label: 'Cualquier rol' }, ...ROLES.map((r) => ({ value: r, label: ROL_LABEL[r] }))]} />
            <Select value={fCapa} onChange={setFCapa} align="left" ariaLabel="Filtrar por capa"
              options={[{ value: '', label: 'Cualquier capa' }, ...CAPAS.map((c) => ({ value: c, label: CAPA_LABEL[c] }))]} />
            <Select value={fPrioridad} onChange={setFPrioridad} align="left" ariaLabel="Filtrar por prioridad"
              options={[{ value: '', label: 'Cualquier prioridad' }, ...PRIORIDADES.map((p) => ({ value: p, label: PRIORIDAD_LABEL[p] }))]} />
            <span className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                orden
              </span>
              <Select value={orden} onChange={(v) => setOrden(v as Orden)} ariaLabel="Ordenar"
                options={[
                  { value: 'grupo', label: 'Orden del estudio' },
                  { value: 'prioridad', label: 'Prioridad' },
                  { value: 'score', label: 'Score' },
                  { value: 'nombre', label: 'Nombre' },
                ]} />
            </span>
          </div>

          {hayFiltro && (
            <p className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
              {visibles.length} de {filas.length} marcas
              <button
                onClick={() => { setFRol(''); setFCapa(''); setFPrioridad(''); setFGrupo(''); }}
                className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]"
              >
                quitar filtros
              </button>
            </p>
          )}

          <div className="mt-3 overflow-x-auto">
            <div style={{ minWidth: ANCHO_MINIMO }}>
              <div className="flex items-center gap-3 border-b border-[var(--border)] pb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                <span className={`${fijo} w-[230px] shrink-0`}>Marca</span>
                <span className="w-[110px] shrink-0">Grupo</span>
                <span className="w-[52px] shrink-0 text-right">Score</span>
                <span className="w-[200px] shrink-0">Rol</span>
                <span className="w-[150px] shrink-0">Capa</span>
                <span className="w-[130px] shrink-0">Prioridad</span>
                <span className="w-[130px] shrink-0">Verificación</span>
              </div>

              <ul className="divide-y divide-[var(--border)]">
                {visibles.map((f) => {
                  const m = marcas[f.dominio] ?? {};
                  const fuera = m.priority === 'out';
                  const verif: Verificacion = m.verification ?? f.datos.verificacionAuto ?? 'no_source';
                  return (
                    <li
                      key={f.dominio}
                      className={`flex items-center gap-3 py-2 ${fuera ? 'opacity-50' : ''}`}
                    >
                      <span className={`${fijo} flex w-[230px] shrink-0 items-center gap-2.5`}>
                        <span
                          title={`Verificación: ${VERIFICACION_LABEL[verif]}`}
                          className={`h-2 w-2 shrink-0 rounded-full ${TONO_VERIFICACION[verif]}`}
                        />
                        <CompanyLogo domain={f.dominio} name={f.datos.name} size={22} src={f.datos.logoUrl} />
                        <Link
                          href={`${hrefBase}/${f.dominio}${query ? `?g=${query}` : ''}`}
                          className="min-w-0 truncate text-sm hover:underline"
                          title={f.dominio}
                        >
                          {f.datos.name}
                        </Link>
                      </span>
                      <span className="w-[110px] shrink-0 truncate font-mono text-[11px] text-[var(--soft)]">
                        {f.grupo}
                      </span>
                      <span className={`w-[52px] shrink-0 text-right font-mono text-sm ${tonoScore(f.datos.score)}`}>
                        {f.datos.score ?? SIN}
                      </span>
                      <span className="w-[200px] shrink-0">
                        <Select value={m.role ?? ''} align="left" ariaLabel={`Rol de ${f.datos.name}`}
                          options={OPCIONES_ROL}
                          onChange={(v) => clasificar(f.dominio, { role: (v || null) as Rol })} />
                      </span>
                      <span className="w-[150px] shrink-0">
                        <Select value={m.layer ?? ''} align="left" ariaLabel={`Capa de ${f.datos.name}`}
                          options={OPCIONES_CAPA}
                          onChange={(v) => clasificar(f.dominio, { layer: (v || null) as Capa })} />
                      </span>
                      <span className="w-[130px] shrink-0">
                        <Select value={m.priority ?? ''} align="left" ariaLabel={`Prioridad de ${f.datos.name}`}
                          options={OPCIONES_PRIORIDAD}
                          onChange={(v) => clasificar(f.dominio, { priority: (v || null) as Prioridad })} />
                      </span>
                      <span className="w-[130px] shrink-0">
                        <Select value={verif} align="left" ariaLabel={`Verificación de ${f.datos.name}`}
                          options={OPCIONES_VERIFICACION}
                          onChange={(v) => clasificar(f.dominio, { verification: v as Verificacion })} />
                      </span>
                    </li>
                  );
                })}
              </ul>

              {visibles.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--muted)]">
                  Ninguna marca cumple ese filtro.
                </p>
              )}
            </div>
          </div>

          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--soft)]">
            Prioridad «Fuera» saca la marca de la matriz y de las medias, pero no del estudio: se
            queda plegada en su grupo con su porqué. La verificación empieza derivada del estado del
            scan y manda lo que pongas aquí.
          </p>
        </div>
      )}
    </section>
  );
}
