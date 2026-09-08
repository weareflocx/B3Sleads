'use client';

import { useEffect, useState } from 'react';
import { UMBRAL_ALERTA, type VocabularioGrupo } from '@/lib/vocabulario';

// El test del logo tapado, cruzado.
//
// Si cinco competidores usan la misma expresión, esa expresión no distingue a
// ninguno. Aquí se ven cuáles son, quién las dice y con qué frase, y se puede
// tirar a la basura lo que resulte ser idioma en vez de categoría.
//
// La columna "fuera" es la que hace legible la lista: dice en qué porcentaje
// de las marcas del corpus que NO están en el estudio aparece ese mismo
// término. Cerca de 0 es código de esta categoría; alto es una muletilla del
// idioma. Sin esa columna, "direct selling" y "more than" parecen lo mismo.

interface Respuesta {
  grupos: VocabularioGrupo[];
  corpusFuera: number;
  error?: string;
}

export function Vocabulario({
  cliente,
  clienteNombre,
  query,
}: {
  cliente: string;
  clienteNombre: string;
  query: string | null;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const url = `/api/estudio/vocabulario?domain=${encodeURIComponent(cliente)}${query ? `&g=${encodeURIComponent(query)}` : ''}`;
    fetch(url)
      .then((r) => r.json())
      .then((j: Respuesta) => {
        if (!vivo) return;
        if (j.error) setError(j.error);
        else setDatos(j);
      })
      .catch(() => vivo && setError('No se pudo calcular el cruce'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [cliente, query]);

  async function excluir(termino: string) {
    // Se quita de la vista al instante: la lista es larga y esperar al
    // servidor para ver desaparecer una línea hace el trabajo insoportable.
    setOcultos((s) => new Set(s).add(termino));
    try {
      const r = await fetch('/api/estudio/vocabulario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cliente, termino, excluir: true }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'No se pudo excluir');
        setOcultos((s) => {
          const n = new Set(s);
          n.delete(termino);
          return n;
        });
      }
    } catch {
      setError('Sin conexión: el término no se ha excluido');
      setOcultos((s) => {
        const n = new Set(s);
        n.delete(termino);
        return n;
      });
    }
  }

  if (cargando) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
        Cruzando el vocabulario del estudio contra el resto del corpus. Tarda unos segundos.
      </p>
    );
  }

  if (error && !datos) {
    return (
      <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--danger)]">
        {error}
      </p>
    );
  }

  const grupos = (datos?.grupos ?? []).filter((g) => g.terminos.length > 0);

  const urlCsv = `/api/estudio/vocabulario?formato=csv&domain=${encodeURIComponent(cliente)}${query ? `&g=${encodeURIComponent(query)}` : ''}`;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
        {grupos.length > 0 && (
          <a
            href={urlCsv}
            className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)]"
            title="Una fila por término y marca, con su cita"
          >
            csv ↓
          </a>
        )}
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Ningún grupo tiene todavía dos marcas con texto capturado. El cruce necesita al menos dos
          para que compartir signifique algo.
        </p>
      ) : (
        grupos.map((g) => {
          const visibles = g.terminos.filter((t) => !ocultos.has(t.termino));
          // La alerta solo mira términos PROPIOS de la categoría. Compartir
          // una muletilla del idioma con tres competidores no dice nada, y
          // una alerta que salta con eso deja de leerse a la segunda vez.
          const alertas = visibles.filter(
            (t) => t.clienteTambien && t.propio && t.marcas.length >= UMBRAL_ALERTA,
          );
          return (
            <section key={g.nombre} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
                <h3 className="text-sm font-semibold">
                  {g.nombre}
                  <span className="ml-2 font-mono text-xs font-normal text-[var(--soft)]">
                    {visibles.length} compartidos · {g.marcasConTexto} marcas con texto
                  </span>
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                  contraste: {datos?.corpusFuera ?? 0} marcas de fuera
                </span>
              </header>

              {alertas.length > 0 && (
                <div className="border-b border-[var(--border)] bg-[var(--accent)]/8 px-4 py-2.5">
                  <p className="text-sm text-[var(--accent)]">
                    {clienteNombre} comparte {alertas.length}{' '}
                    {alertas.length === 1 ? 'expresión' : 'expresiones'} con {UMBRAL_ALERTA} o más
                    marcas de este grupo. Deja de ser suya.
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--text)]">
                    {alertas.map((a) => a.termino).join(' · ')}
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <div style={{ minWidth: 580 }}>
                  <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                    <span className="w-[64px] shrink-0 text-right">grupo</span>
                    <span className="w-[52px] shrink-0 text-right">fuera</span>
                    <span className="w-[46px] shrink-0 text-right">conc.</span>
                    <span className="min-w-0 flex-1">término</span>
                    <span className="w-[62px] shrink-0" />
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {visibles.slice(0, 40).map((t) => {
                      const alerta = t.clienteTambien && t.propio && t.marcas.length >= UMBRAL_ALERTA;
                      const abierta = abierto === `${g.nombre}:${t.termino}`;
                      return (
                        <li key={t.termino} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="w-[64px] shrink-0 text-right font-mono text-xs">
                              {t.marcas.length}/{g.marcasConTexto}
                            </span>
                            {/* Un término que aparece en medio corpus es
                                idioma, no categoría. Se atenúa en vez de
                                esconderse: verlo bajo es lo que enseña a
                                distinguirlos. */}
                            <span
                              className={`w-[52px] shrink-0 text-right font-mono text-xs ${
                                t.fuera === 0
                                  ? 'text-[var(--cta)]'
                                  : t.fuera < 5
                                    ? 'text-[var(--muted)]'
                                    : 'text-[var(--soft)]'
                              }`}
                            >
                              {t.fuera}%
                            </span>
                            <span
                              title="Cuántas veces más probable es dentro del grupo que fuera"
                              className="w-[46px] shrink-0 text-right font-mono text-xs text-[var(--muted)]"
                            >
                              ×{t.concentracion}
                            </span>
                            <button
                              onClick={() => setAbierto(abierta ? null : `${g.nombre}:${t.termino}`)}
                              className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                            >
                              {t.termino}
                              {alerta && (
                                <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                                  también el cliente
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => excluir(t.termino)}
                              title="No es de la categoría, es idioma. No vuelve a salir en este estudio."
                              className="w-[62px] shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                            >
                              excluir
                            </button>
                          </div>

                          {abierta && (
                            <ul className="mt-2 space-y-1.5 border-l-2 border-[var(--border)] pl-3">
                              {t.marcas.map((m) => (
                                <li key={m.dominio} className="text-xs leading-relaxed">
                                  <span className="font-medium">{m.nombre}</span>
                                  <span className="ml-2 italic text-[var(--muted)]">{m.cita}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {visibles.length > 40 && (
                    <p className="px-4 py-2 font-mono text-[10px] text-[var(--soft)]">
                      y {visibles.length - 40} más, por debajo en el contraste
                    </p>
                  )}
                </div>
              </div>
            </section>
          );
        })
      )}

      <p className="text-xs leading-relaxed text-[var(--soft)]">
        Solo se cruza texto literal capturado de cada web. La lectura que el Scanner escribe SOBRE
        una marca queda fuera a propósito: cruzarla mediría cómo escribe el Scanner, no qué dice el
        mercado.
      </p>
    </div>
  );
}
