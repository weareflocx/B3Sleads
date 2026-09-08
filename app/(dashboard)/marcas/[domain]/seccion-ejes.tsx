'use client';

import { useMemo, useState } from 'react';
import { CompanyLogo } from '../../company-logo';
import { useEstudio } from './estudio-estado';
import type { DatosMarca } from './grupo-estudio';
import { EJE_MAX, MAX_EJES, PRIORIDAD_LABEL, nuevoEjeId, type Eje } from '@/lib/battle-cards';

// Dónde está cada marca en las tensiones que definen la categoría.
//
// Estas posiciones NO se calculan. El Scanner mide lo que una marca dice de
// sí misma; que eso la sitúe en "habla de red" frente a "habla de servicio"
// es un juicio. Lo único que aporta la herramienta es que el juicio quede
// escrito, compartido y comparable.
//
// La versión anterior pedía teclear un número en una casilla, con la cabecera
// de la columna recortada a "HABLA DE RED / HABLA DE SER…". Había que saberse
// de memoria que 0 era la izquierda y adivinar qué izquierda. Ahora cada eje
// es un deslizador con sus dos extremos escritos a los lados: la posición se
// ve, se arrastra, y no hay nada que recordar.

// Un deslizador con su valor. Mientras se arrastra solo se mueve; se guarda
// al soltar. Sin eso, arrastrar de 2 a 8 mandaba seis peticiones y el punto
// del mapa iba dando saltos.
function Deslizador({
  valor,
  onMover,
  onSoltar,
  onBorrar,
  etiqueta,
  destacado,
}: {
  valor: number | undefined;
  onMover: (v: number) => void;
  onSoltar: (v: number) => void;
  onBorrar: () => void;
  etiqueta: string;
  destacado?: boolean;
}) {
  const puesto = valor != null;
  const v = valor ?? 5;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        min={0}
        max={EJE_MAX}
        step={1}
        value={v}
        aria-label={etiqueta}
        onChange={(e) => onMover(Number(e.target.value))}
        onPointerUp={(e) => onSoltar(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onSoltar(Number((e.target as HTMLInputElement).value))}
        className={`h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] transition-opacity
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--surface)]
          ${destacado ? '[&::-webkit-slider-thumb]:bg-[var(--cta)]' : '[&::-webkit-slider-thumb]:bg-[var(--text)]'}
          ${puesto ? '' : 'opacity-35'}`}
      />
      <span
        className={`w-5 shrink-0 text-right font-mono text-xs ${puesto ? '' : 'text-[var(--soft)]'}`}
      >
        {puesto ? v : '—'}
      </span>
      <button
        onClick={onBorrar}
        disabled={!puesto}
        title="Quitar la puntuación. Vacío no es un 0: es que nadie lo ha juzgado."
        className="w-3 shrink-0 font-mono text-[10px] text-[var(--soft)] transition-colors hover:text-[var(--danger)] disabled:opacity-0"
      >
        ×
      </button>
    </span>
  );
}

function FormularioEje({ ejes, onCrear }: { ejes: Eje[]; onCrear: (e: Eje) => void }) {
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
        Cuatro ejes es el tope. Más de cuatro tensiones a la vez dejan de ser un mapa.
      </p>
    );
  }

  const campo =
    'min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={izq} onChange={(e) => setIzq(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="un extremo" className={campo} />
      <span className="font-mono text-xs text-[var(--soft)]">←→</span>
      <input value={der} onChange={(e) => setDer(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="el contrario" className={campo} />
      <button onClick={crear} disabled={!izq.trim() || !der.trim()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40">
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
  // Lo que se está arrastrando, para pintar sin guardar.
  const [enVuelo, setEnVuelo] = useState<Record<string, number>>({});

  // Núcleo y Sólida primero: son las que sostienen el argumento y las únicas
  // que merecen el trabajo de posicionar. Cuarenta y cuatro marcas por cuatro
  // ejes son ciento setenta y seis juicios a mano.
  const { principales, resto } = useMemo(() => {
    const a: { dominio: string; datos: DatosMarca }[] = [];
    const b: typeof a = [];
    for (const g of grupos) {
      for (const d of g.dominios) {
        const fila = {
          dominio: d,
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

  const clave = (d: string, e: string) => `${d}|${e}`;
  const valorDe = (d: string, e: string) =>
    enVuelo[clave(d, e)] ?? marcas[d]?.axis_scores?.[e];

  const ponerPosicion = (lado: 'current' | 'target', eje: string, v: number | null) => {
    const actual = { ...(posiciones[lado] ?? {}) };
    if (v == null) delete actual[eje];
    else actual[eje] = v;
    definirEjes(ejes, {
      ...posiciones,
      ...(Object.keys(actual).length ? { [lado]: actual } : { [lado]: undefined }),
    } as typeof posiciones);
  };

  const anchoMinimo = 250 + ejes.length * 230;

  // Una fila del cuadro, sea del cliente o de una marca.
  function Fila({
    etiqueta,
    dominio,
    logo,
    nota,
    destacado,
    leer,
    mover,
    soltar,
    borrar,
  }: {
    etiqueta: string;
    dominio?: string;
    logo?: string | null;
    nota?: string | null;
    destacado?: boolean;
    leer: (eje: string) => number | undefined;
    mover: (eje: string, v: number) => void;
    soltar: (eje: string, v: number) => void;
    borrar: (eje: string) => void;
  }) {
    return (
      <li className="flex items-center gap-4 py-2">
        <span className="flex w-[250px] shrink-0 items-center gap-2.5">
          {dominio ? (
            <CompanyLogo domain={dominio} name={etiqueta} size={22} src={logo} />
          ) : (
            <span className="h-[22px] w-[22px] shrink-0 rotate-45 rounded-sm border-[1.5px] border-[var(--cta)]" />
          )}
          <span className={`min-w-0 flex-1 truncate text-sm ${destacado ? 'font-medium text-[var(--cta)]' : ''}`}>
            {etiqueta}
          </span>
          {nota && <span className="shrink-0 font-mono text-[10px] text-[var(--soft)]">{nota}</span>}
        </span>
        {ejes.map((e) => (
          <span key={e.axis_id} className="flex w-[230px] shrink-0 items-center">
            <Deslizador
              valor={leer(e.axis_id)}
              destacado={destacado}
              etiqueta={`${etiqueta} entre ${e.label_left} y ${e.label_right}`}
              onMover={(v) => mover(e.axis_id, v)}
              onSoltar={(v) => soltar(e.axis_id, v)}
              onBorrar={() => borrar(e.axis_id)}
            />
          </span>
        ))}
      </li>
    );
  }

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
            {ejes.length === 0 ? 'sin definir' : `${ejes.length} ${ejes.length === 1 ? 'eje' : 'ejes'}`}
            {ejes.length > 0 && principales.length > 0 && (
              <span className="ml-2 text-[var(--soft)]">
                · {puntuadas} de {principales.length} marcas situadas
              </span>
            )}
          </span>
        </span>
        <span className="font-mono text-sm text-[var(--muted)]">{abierta ? '−' : '+'}</span>
      </button>

      {abierta && (
        <div className="mt-3 space-y-3">
          {/* ── Qué tensiones estamos midiendo ── */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
              Las tensiones de la categoría
            </p>
            {ejes.length > 0 && (
              <ul className="mb-3 mt-2 space-y-1.5">
                {ejes.map((e) => (
                  <li key={e.axis_id} className="flex items-center gap-3 text-sm">
                    <span className="text-[var(--text)]">{e.label_left}</span>
                    <span className="font-mono text-xs text-[var(--soft)]">←→</span>
                    <span className="text-[var(--text)]">{e.label_right}</span>
                    {porBorrar === e.axis_id ? (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-[var(--danger)]">
                          Se borran también sus puntuaciones
                        </span>
                        <button onClick={() => { eliminarEje(e.axis_id); setPorBorrar(null); }}
                          className="rounded border border-[var(--danger)] px-2 py-0.5 font-mono text-[10px] text-[var(--danger)]">
                          borrar
                        </button>
                        <button onClick={() => setPorBorrar(null)}
                          className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]">
                          no
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setPorBorrar(e.axis_id)}
                        className="ml-auto font-mono text-[10px] text-[var(--soft)] transition-colors hover:text-[var(--danger)]">
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
          </div>

          {ejes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
              Un eje es una tensión con dos extremos: funcional frente a significado, local frente a
              global, precio frente a pertenencia. El mapa sale de cruzar dos.
            </p>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="overflow-x-auto">
                <div style={{ minWidth: anchoMinimo }}>
                  {/* Cabecera: cada extremo en SU punta de la columna. Antes
                      iban en dos líneas recortadas ("HABLA DE SER…") y había
                      que saberse de memoria hacia qué lado crecía el número. */}
                  <div className="flex items-end gap-4 border-b border-[var(--border)] pb-2">
                    <span className="w-[250px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                      Marca
                    </span>
                    {ejes.map((e) => (
                      <span key={e.axis_id} className="flex w-[230px] shrink-0 items-baseline justify-between gap-2 pr-8 text-[10px] text-[var(--muted)]">
                        <span className="truncate">{e.label_left}</span>
                        <span className="truncate text-right">{e.label_right}</span>
                      </span>
                    ))}
                  </div>

                  {/* ── El cliente: dónde está y a dónde va ── */}
                  <ul className="divide-y divide-dashed divide-[var(--border)] border-b border-[var(--border)]">
                    {(['current', 'target'] as const).map((lado) => (
                      <Fila
                        key={lado}
                        etiqueta={lado === 'current' ? 'Cliente hoy' : 'Cliente objetivo'}
                        destacado
                        leer={(eje) => enVuelo[clave(lado, eje)] ?? posiciones[lado]?.[eje]}
                        mover={(eje, v) => setEnVuelo((m) => ({ ...m, [clave(lado, eje)]: v }))}
                        soltar={(eje, v) => {
                          setEnVuelo((m) => { const n = { ...m }; delete n[clave(lado, eje)]; return n; });
                          ponerPosicion(lado, eje, v);
                        }}
                        borrar={(eje) => ponerPosicion(lado, eje, null)}
                      />
                    ))}
                  </ul>

                  {/* ── Las marcas que sostienen el argumento ── */}
                  <ul className="divide-y divide-[var(--border)]">
                    {principales.map((f) => (
                      <Fila
                        key={f.dominio}
                        etiqueta={f.datos.name}
                        dominio={f.dominio}
                        logo={f.datos.logoUrl}
                        nota={PRIORIDAD_LABEL[marcas[f.dominio]!.priority!]}
                        leer={(eje) => valorDe(f.dominio, eje)}
                        mover={(eje, v) => {
                          setEnVuelo((m) => ({ ...m, [clave(f.dominio, eje)]: v }));
                          puntuar(f.dominio, eje, v, false);
                        }}
                        soltar={(eje, v) => {
                          setEnVuelo((m) => { const n = { ...m }; delete n[clave(f.dominio, eje)]; return n; });
                          puntuar(f.dominio, eje, v);
                        }}
                        borrar={(eje) => puntuar(f.dominio, eje, null)}
                      />
                    ))}
                  </ul>

                  {principales.length === 0 && (
                    <p className="py-6 text-center text-sm text-[var(--muted)]">
                      Ninguna marca con prioridad Núcleo o Sólida todavía. Clasifica primero:
                      situar cuarenta marcas sin haber decidido cuáles importan es trabajo tirado.
                    </p>
                  )}

                  {/* ── El resto, por si hay que situar alguna suelta ── */}
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
                        <ul className="divide-y divide-[var(--border)] border-t border-dashed border-[var(--border)] opacity-70">
                          {resto.map((f) => (
                            <Fila
                              key={f.dominio}
                              etiqueta={f.datos.name}
                              dominio={f.dominio}
                              logo={f.datos.logoUrl}
                              leer={(eje) => valorDe(f.dominio, eje)}
                              mover={(eje, v) => {
                                setEnVuelo((m) => ({ ...m, [clave(f.dominio, eje)]: v }));
                                puntuar(f.dominio, eje, v, false);
                              }}
                              soltar={(eje, v) => {
                                setEnVuelo((m) => { const n = { ...m }; delete n[clave(f.dominio, eje)]; return n; });
                                puntuar(f.dominio, eje, v);
                              }}
                              borrar={(eje) => puntuar(f.dominio, eje, null)}
                            />
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>

              <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--soft)]">
                Arrastra hacia el extremo que describa mejor a la marca. Se guarda al soltar. Dejar
                una casilla vacía no es un 0: el 0 es el extremo izquierdo, y vacío es que todavía
                nadie lo ha juzgado, así que el mapa no la pinta.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
