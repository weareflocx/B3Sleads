'use client';

import { useEffect, useState } from 'react';
import { NivelCerrado } from './nivel-cerrado';

// Puente entre el cierre (client) y la ficha (server). La ficha no puede leer
// sessionStorage, así que este envoltorio lo consulta al montar y decide si
// toca celebrar. Consumir la marca al leerla evita que la fiesta se repita.
export function NivelCerradoSlot({
  leadId,
  domain,
  company,
}: {
  leadId: string;
  domain: string;
  company: string;
}) {
  const [reciente, setReciente] = useState(false);
  useEffect(() => {
    try {
      const k = `b3s-cerrado-${leadId}`;
      if (sessionStorage.getItem(k)) {
        sessionStorage.removeItem(k);
        setReciente(true);
      }
    } catch {}
  }, [leadId]);
  return <NivelCerrado domain={domain} company={company} reciente={reciente} />;
}
