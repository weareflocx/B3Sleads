'use client';

import { GrupoEstudio, type DatosMarca } from './grupo-estudio';
import { NuevoGrupo } from './nuevo-grupo';
import { useEstudio } from './estudio-estado';
import { TablaClasificacion } from './tabla-clasificacion';
import { SeccionEjes } from './seccion-ejes';

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
  const { grupos, guardando, error } = useEstudio();

  return (
    <>
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

      <TablaClasificacion datos={datos} hrefBase={hrefBase} />
      <SeccionEjes datos={datos} />
    </>
  );
}
