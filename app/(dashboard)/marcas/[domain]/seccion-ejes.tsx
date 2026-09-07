'use client';

import { useEffect, useMemo, useState } from 'react';
import { CompanyLogo } from '../../company-logo';
import { useEstudio } from './estudio-estado';
import type { DatosMarca } from './grupo-estudio';
import {
  EJE_MAX,
  EJE_MIN,
  MAX_EJES,
  PRIORIDAD_LABEL,
  nuevoEjeId,
  type Eje,
} from '@/lib/battle-cards';

// Los ejes de posicionamiento: dónde está cada marca en las tensiones que
// definen la categoría, y dónde quiere estar el cliente.
//
// Estas puntuaciones NO se calculan. El Scanner mide lo que una marca dice de
// sí misma; que eso la sitúe en "local frente a global" es un juicio, y por
// eso se teclea. Lo único que aporta la herramienta es que el juicio quede
// escrito, compartido y comparable.
//
// Solo se listan las marcas con prioridad Núcleo o Sólida: cuarenta marcas
// por cuatro ejes son ciento setenta juicios, y la mayoría no sostienen
// ningún argumento. Las demás quedan plegadas para puntuar alguna suelta.

// Celda de puntuación. Se guarda al salir o con Enter, no en cada tecla:
// escribir "10" pasa por "1", y guardar el 1 movería la marca a otro sitio
// durante un instante y dejaría rastro en el histórico de quién puntuó qué.
function CeldaEje({
  valor,
  onChange,
  etiqueta,
}: {
  valor: number | undefined;
  onChange: (v: number | null) => void;
  etiqueta: string;
}) {
  const [texto, setTexto] = useState(valor?.toString() ?? '');
  useEffect(() => setTexto(valor?.toString() ?? ''), [valor]);

  const guardar = () => {
    const t = texto.trim();
    if (t === '') {
      if (valor != null) onChange(null);
      return;
    }
    const n = Math.min(EJE_MAX, Math.max(EJE_MIN, Math.round(Number(t))));
    if (!Number.isFinite(n)) {
      setTexto(valor?.toString() ?? '');
      return;
    }
    setTexto(String(n));
    if (n !== valor) onChange(n);
  };

  const pct = valor != null ? (valor / EJE_MAX) * 100 : null;

  return (
    <span className="flex w-[76px] shrink-0 items-center gap-1.5">
      <input
        value={texto}
        inputMode="numeric"
        aria-label={etiqueta}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setTexto(valor?.toString() ?? '');
        }}
        placeholder="—"
        className="w-9 shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-center font-mono text-xs outline-none transition-colors focus:border-[var(--cta)]"
      />
      {/* La barra no es decoración: con doce filas, el número solo obliga a
          leer una por una para ver el reparto. */}
      <span className="relative h-1 flex-1 rounded-full bg-[var(--border)]">
        {pct != null && (
          <span
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--cta)]"
            style={{ left: `${pct}%` }}
          />
        )}
      </span>
    </span>
  );
}

function FormularioEje({
  ejes,
  onCrear,
}: {
  ejes: Eje[];
  onCrear: (e: Eje) => void;
}) {
  const [izq, setIzq] = useState('');
  const [der, setDer] = useState('');

  const crear = () => {
    const a = izq.trim();
    const b = der.trim();
    if (!a || !b) return;
    onCrear({ axis_id: nuevoEjeId(ejes), label_left: a, label_right: b });
    setIzq('');
    setDer('');
  };

  if (ejes.length >= MAX_EJES) {
    return (
      <p className="text-xs text-[var(--soft)]">
        Cuatro ejes es el tope. Más de cuatro tensiones a la vez dejan de ser un mapa y pasan a ser
        una hoja de cálculo.
      </p>
    );
  }

  const campo =
    'min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={izq}
        onChange={(e) => setIzq(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="extremo izquierdo"
        className={campo}
      />
      <span className="font-mono text-xs text-[var(--soft)]">←→</span>
      <input
        value={der}
        onChange={(e) => setDer(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="extremo derecho"
        className={campo}
      />
      <button
        onClick={crear}
        disabled={!izq.trim() || !der.trim()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
      >
        Añadir eje
      </button>
    </div>
  );
}

export function SeccionEjes({ datos }: { datos: Record<string, DatosMarca> }) {
  const { grupos, marcas, ejes, posiciones, definirEjes, puntuar, eliminarEje } = useEstudio();
  const [abierta, setAbierta] = useState(false);
  const [verResto, setVerResto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);

  // Núcleo y Sólida primero: son las que sostienen el argumento y las únicas
  // que merecen el trabajo de posicionar.
  const { principales, resto } = useMemo(() => {
    const a: { dominio: string; grupo: string; datos: DatosMarca }[] = [];
    const b: typeof a = [];
    for (const g of grupos) {
      for (const d of g.dominios) {
        const fila = {
          dominio: d,
          grupo: g.nombre,
          datos: datos[d] ?? {
            domain: d, name: d, logoUrl: null, score: null,
            estado: 'sin-scan' as const, scanId: null, detectados: 0,
            verificacionAuto: 'no_source' as const,
          },
        };
        const p = marcas[d]?.priority;
        if (p === 'core' || p === 'solid') a.push(fila);
        else if (p !== 'out') b.push(fila);
      }
    }
    return { principales: a, resto: b };
  }, [grupos, marcas, datos]);

  const puntuadas = principales.filter((f) =>
    ejes.every((e) => marcas[f.dominio]?.axis_scores?.[e.axis_id] != null),
  ).length;

  const ponerPosicion = (lado: 'current' | 'target', eje: string, v: number | null) => {
    const actual = { ...(posiciones[lado] ?? {}) };
    if (v == null) delete actual[eje];
    else actual[eje] = v;
    definirEjes(ejes, {
      ...posiciones,
      ...(Object.keys(actual).length ? { [lado]: actual } : { [lado]: undefined }),
    } as typeof posiciones);
  };

  const anchoMinimo = 300 + ejes.length * 92;

  return (
    <section className="mt-4">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--muted)]"
      >
        <span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Ejes de posicionamiento
          </span>
          <span className="ml-3 text-sm text-[var(--muted)]">
            {ejes.length === 0
              ? 'sin definir'
              : `${ejes.length} ${ejes.length === 1 ? 'eje' : 'ejes'}`}
            {ejes.length > 0 && principales.length > 0 && (
              <span className="ml-2 text-[var(--soft)]">
                · {puntuadas} de {principales.length} marcas puntuadas
              </span>
            )}
          </span>
        </span>
        <span className="font-mono text-sm text-[var(--muted)]">{abierta ? '−' : '+'}</span>
      </button>

      {abierta && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          {/* ── Definir los ejes ── */}
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            Las tensiones de la categoría
          </p>
          {ejes.length > 0 && (
            <ul className="mb-3 mt-2 space-y-1.5">
              {ejes.map((e) => (
                <li key={e.axis_id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[10px] text-[var(--soft)]">{e.axis_id}</span>
                  <span className="text-[var(--muted)]">{e.label_left}</span>
                  <span className="font-mono text-xs text-[var(--soft)]">←→</span>
                  <span className="text-[var(--muted)]">{e.label_right}</span>
                  {porBorrar === e.axis_id ? (
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-[var(--danger)]">
                        Se borran también sus puntuaciones
                      </span>
                      <button
                        onClick={() => { eliminarEje(e.axis_id); setPorBorrar(null); }}
                        className="rounded border border-[var(--danger)] px-2 py-0.5 font-mono text-[10px] text-[var(--danger)]"
                      >
                        borrar
                      </button>
                      <button
                        onClick={() => setPorBorrar(null)}
                        className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]"
                      >
                        no
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setPorBorrar(e.axis_id)}
                      className="ml-auto font-mono text-[10px] text-[var(--soft)] transition-colors hover:text-[var(--danger)]"
                    >
                      quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <FormularioEje ejes={ejes} onCrear={(e) => definirEjes([...ejes, e], posiciones)} />
          </div>

          {ejes.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
              Un eje es una tensión con dos extremos: funcional frente a significado, local frente a
              global, precio frente a pertenencia. El mapa sale de cruzar dos.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <div style={{ minWidth: anchoMinimo }}>
                <div className="flex items-center gap-3 border-b border-[var(--border)] pb-2">
                  <span className="w-[240px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                    Marca
                  </span>
                  {ejes.map((e) => (
                    <span key={e.axis_id} className="w-[76px] shrink-0">
                      <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-[var(--soft)]">
                        {e.label_left}
                      </span>
                      <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">
                        {e.label_right}
                      </span>
                    </span>
                  ))}
                </div>

                {/* ── El cliente: hoy y a dónde va ── */}
                <ul className="divide-y divide-dashed divide-[var(--border)] border-b border-[var(--border)]">
                  {(['current', 'target'] as const).map((lado) => (
                    <li key={lado} className="flex items-center gap-3 py-2">
                      <span className="w-[240px] shrink-0 text-sm font-medium text-[var(--cta)]">
                        {lado === 'current' ? 'Cliente hoy' : 'Cliente objetivo'}
                      </span>
                      {ejes.map((e) => (
                        <CeldaEje
                          key={e.axis_id}
                          valor={posiciones[lado]?.[e.axis_id]}
                          etiqueta={`${lado === 'current' ? 'Cliente hoy' : 'Cliente objetivo'} en ${e.label_left}-${e.label_right}`}
                          onChange={(v) => ponerPosicion(lado, e.axis_id, v)}
                        />
                      ))}
                    </li>
                  ))}
                </ul>

                {/* ── Las marcas que sostienen el argumento ── */}
                <ul className="divide-y divide-[var(--border)]">
                  {principales.map((f) => (
                    <li key={f.dominio} className="flex items-center gap-3 py-2">
                      <span className="flex w-[240px] shrink-0 items-center gap-2.5">
                        <CompanyLogo domain={f.dominio} name={f.datos.name} size={22} src={f.datos.logoUrl} />
                        <span className="min-w-0 flex-1 truncate text-sm">{f.datos.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--soft)]">
                          {PRIORIDAD_LABEL[marcas[f.dominio]!.priority!]}
                        </span>
                      </span>
                      {ejes.map((e) => (
                        <CeldaEje
                          key={e.axis_id}
                          valor={marcas[f.dominio]?.axis_scores?.[e.axis_id]}
                          etiqueta={`${f.datos.name} en ${e.label_left}-${e.label_right}`}
                          onChange={(v) => puntuar(f.dominio, e.axis_id, v)}
                        />
                      ))}
                    </li>
                  ))}
                </ul>

                {principales.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">
                    Ninguna marca con prioridad Núcleo o Sólida todavía. Clasifica primero: posicionar
                    cuarenta marcas sin haber decidido cuáles importan es trabajo tirado.
                  </p>
                )}

                {/* ── El resto, por si hay que puntuar alguna suelta ── */}
                {resto.length > 0 && (
                  <>
                    <button
                      onClick={() => setVerResto((v) => !v)}
                      aria-expanded={verResto}
                      className="mt-1 flex w-full items-center justify-between py-2 font-mono text-[11px] uppercase tracking-wider text-[var(--soft)] hover:text-[var(--muted)]"
                    >
                      <span>{resto.length} marcas sin prioridad alta</span>
                      <span>{verResto ? '−' : '+'}</span>
                    </button>
                    {verResto && (
                      <ul className="divide-y divide-[var(--border)] border-t border-dashed border-[var(--border)]">
                        {resto.map((f) => (
                          <li key={f.dominio} className="flex items-center gap-3 py-2 opacity-70">
                            <span className="flex w-[240px] shrink-0 items-center gap-2.5">
                              <CompanyLogo domain={f.dominio} name={f.datos.name} size={22} src={f.datos.logoUrl} />
                              <span className="min-w-0 truncate text-sm">{f.datos.name}</span>
                            </span>
                            {ejes.map((e) => (
                              <CeldaEje
                                key={e.axis_id}
                                valor={marcas[f.dominio]?.axis_scores?.[e.axis_id]}
                                etiqueta={`${f.datos.name} en ${e.label_left}-${e.label_right}`}
                                onChange={(v) => puntuar(f.dominio, e.axis_id, v)}
                              />
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--soft)]">
            0 es el extremo izquierdo, 10 el derecho. Dejar la casilla vacía no es un 0: es que
            todavía nadie lo ha juzgado, y el mapa no pinta lo que no se ha juzgado.
          </p>
        </div>
      )}
    </section>
  );
}
