'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serializeGrupos, type Grupo } from '@/lib/benchmark';

// El estudio se edita cambiando la URL. Suena raro y tiene una ventaja fuerte:
// cualquier estado del estudio es un enlace que se pega en un mensaje, y no
// hace falta tabla ni migración para empezar a usarlo.
export function EditorEstudio({
  grupos,
  candidatas,
}: {
  grupos: Grupo[];
  candidatas: { domain: string; name: string; score: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const aplicar = (gs: Grupo[]) => {
    const q = serializeGrupos(gs);
    router.replace(q ? `${pathname}?g=${q}` : pathname);
  };

  const añadirGrupo = () => {
    const n = nuevoGrupo.trim();
    if (!n || grupos.some((g) => g.nombre === n)) return;
    setNuevoGrupo('');
    aplicar([...grupos, { nombre: n, dominios: [] }]);
    setAbierto(n);
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nuevoGrupo}
          onChange={(e) => setNuevoGrupo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && añadirGrupo()}
          placeholder="Nombre del grupo (Energéticas, Telco, Multinivel…)"
          className="min-w-[16rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]"
        />
        <button
          onClick={añadirGrupo}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]"
        >
          Añadir grupo
        </button>
      </div>

      {grupos.length > 0 && (
        <div className="mt-4 space-y-3">
          {grupos.map((g) => (
            <div key={g.nombre} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {g.nombre}
                  <span className="ml-2 font-mono text-xs text-[var(--soft)]">
                    {g.dominios.length}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => setAbierto(abierto === g.nombre ? null : g.nombre)}
                    className="text-xs text-[var(--cta)] hover:underline"
                  >
                    {abierto === g.nombre ? 'cerrar' : 'añadir marcas'}
                  </button>
                  <button
                    onClick={() => aplicar(grupos.filter((x) => x.nombre !== g.nombre))}
                    className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    quitar grupo
                  </button>
                </span>
              </div>

              {g.dominios.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.dominios.map((d) => (
                    <button
                      key={d}
                      onClick={() =>
                        aplicar(
                          grupos.map((x) =>
                            x.nombre === g.nombre
                              ? { ...x, dominios: x.dominios.filter((y) => y !== d) }
                              : x,
                          ),
                        )
                      }
                      className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                      title="Quitar del grupo"
                    >
                      {d} ×
                    </button>
                  ))}
                </div>
              )}

              {abierto === g.nombre && (
                <div className="mt-3 max-h-52 overflow-y-auto rounded border border-[var(--border)]">
                  {candidatas.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--muted)]">
                      No quedan marcas escaneadas por añadir.
                    </p>
                  ) : (
                    candidatas.map((c) => (
                      <button
                        key={c.domain}
                        onClick={() =>
                          aplicar(
                            grupos.map((x) =>
                              x.nombre === g.nombre
                                ? { ...x, dominios: [...x.dominios, c.domain] }
                                : x,
                            ),
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span className="min-w-0 truncate">{c.name}</span>
                        <span className="shrink-0 font-mono text-xs text-[var(--soft)]">
                          {c.score}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
