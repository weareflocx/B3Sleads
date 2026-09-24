'use client';

import { GrupoEstudio, type DatosMarca } from './grupo-estudio';
import { NuevoGrupo } from './nuevo-grupo';
import { useEstudio } from './estudio-estado';

// La rejilla de grupos. Existe como componente de cliente porque la LISTA de
// grupos también es estado editable: recorrerla desde el servidor hacía que
// un grupo recién creado no apareciera hasta que la URL se sincronizara.
export function GruposDelEstudio({
  datos,
  candidatas,
  hrefBase,
  cliente,
}: {
  datos: Record<string, DatosMarca>;
  candidatas: { domain: string; name: string }[];
  hrefBase: string;
  cliente: string;
}) {
  const { grupos, guardando, error, delEnlace, importarEnlace, descartarEnlace } = useEstudio();

  return (
    <>
      {/* Un enlace con ?g= que trae marcas que no están en el estudio. Antes
          abrirlo las metía y, de paso, quitaba las que el enlace no conocía.
          Ahora no toca nada solo: lo dice, y se añaden con un clic. */}
      {delEnlace.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--cta)]/40 bg-[var(--surface)] px-4 py-3">
          <p className="min-w-0 flex-1 text-sm">
            {delEnlace.length === 1
              ? 'Este enlace trae una marca que no está en el estudio: '
              : `Este enlace trae ${delEnlace.length} marcas que no están en el estudio: `}
            <span className="font-mono text-xs text-[var(--muted)]">
              {delEnlace.slice(0, 6).map((x) => x.dominio).join(', ')}
              {delEnlace.length > 6 && ` y ${delEnlace.length - 6} más`}
            </span>
          </p>
          <span className="flex shrink-0 items-center gap-3">
            <button
              onClick={descartarEnlace}
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)] hover:text-[var(--text)]"
            >
              ignorar
            </button>
            <button
              onClick={importarEnlace}
              className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-xs font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
            >
              Añadirlas
            </button>
          </span>
        </div>
      )}

      <div className="mt-6 flex h-4 items-center justify-end gap-3">
        {/* El único aviso que hacía falta: antes un cambio podía perderse en
            silencio y no había forma de saberlo. */}
        {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
        {guardando && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            guardando…
          </span>
        )}
      </div>

      <div className="mt-1 grid gap-4 lg:grid-cols-2">
        {grupos.map((g) => (
          <GrupoEstudio
            key={g.nombre}
            nombre={g.nombre}
            datos={datos}
            candidatas={candidatas}
            hrefBase={hrefBase}
            cliente={cliente}
          />
        ))}
        <NuevoGrupo />
      </div>

    </>
  );
}
