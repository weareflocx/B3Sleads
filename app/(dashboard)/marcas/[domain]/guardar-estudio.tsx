'use client';

import { useEffect, useRef } from 'react';
import type { Grupo } from '@/lib/benchmark';

// Guarda el estudio en el servidor cuando cambia. Antes esto vivía solo en la
// URL y en localStorage: se perdía al navegar y no lo veía nadie más del
// equipo, que es justo lo que hace falta para trabajar un cliente entre
// varios.
//
// Solo escribe si la URL trae grupos: al llegar sin ?g= la página ya está
// pintando lo guardado, y volver a mandarlo sería escribir por escribir.
export function GuardarEstudio({
  domain,
  grupos,
  query,
}: {
  domain: string;
  grupos: Grupo[];
  query: string | null;
}) {
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    if (query === null) return;
    const firma = JSON.stringify(grupos);
    if (ultimo.current === firma) return;
    ultimo.current = firma;
    fetch('/api/estudio/grupos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, grupos }),
    }).catch(() => {
      // Sin conexión el estudio sigue en pantalla y en la URL; se guardará
      // en el siguiente cambio.
    });
  }, [domain, grupos, query]);
  return null;
}
