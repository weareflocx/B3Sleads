'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// El estudio vive en la URL, y eso lo hace compartible pero fragil: basta
// navegar a otra pagina y volver para perderlo. Paso por ahi en la primera
// sesion real de uso.
//
// Asi que la URL sigue siendo la fuente de verdad, y ademas se recuerda por
// cliente en el navegador: si llegas sin ?g= y hay algo guardado, se
// restaura. Es memoria de trabajo, no persistencia: no viaja a otro equipo
// ni a un companero, y para eso esta el enlace. Cuando haya acceso al
// Supabase de produccion, esto se convierte en una tabla y el formato ya
// estara probado.
export function MemoriaEstudio({ cliente, query }: { cliente: string; query: string | null }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const clave = `b3s-estudio-${cliente}`;
    try {
      if (query) {
        localStorage.setItem(clave, query);
        return;
      }
      const guardado = localStorage.getItem(clave);
      if (guardado) router.replace(`${pathname}?g=${guardado}`);
    } catch {
      // Navegador sin almacenamiento: el estudio sigue funcionando por URL.
    }
  }, [cliente, query, pathname, router]);

  return null;
}
