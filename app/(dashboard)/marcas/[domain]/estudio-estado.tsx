'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serializeGrupos, type Grupo } from '@/lib/benchmark';

// El estado de composición del estudio: qué marcas hay, en qué grupo, en qué
// orden y cuáles están fuera de la comparación.
//
// Antes esto vivía SOLO en la URL, y cada control calculaba el estado nuevo a
// partir del que le había llegado del servidor. Ese valor no se refresca
// hasta que `router.replace` completa la navegación y la página se vuelve a
// pintar contra la base: entre 200 y 500 ms en esta página, que hace varias
// consultas. Dos clics dentro de esa ventana partían de la misma base y el
// segundo pisaba al primero. No era intermitente: era seguro. Reproducido
// ocultando dos marcas seguidas, solo se guardaba la segunda.
//
// Ahora la verdad para los manejadores es una referencia que se actualiza de
// forma síncrona, la pantalla se pinta al instante y la URL y el guardado van
// detrás, agrupados. La URL sigue sirviendo para compartir; deja de ser la
// memoria de trabajo.

// Cuánto se espera antes de sincronizar. Suficiente para que una ráfaga de
// clics viaje junta, corto para que quien comparte el enlace no copie una URL
// vieja.
const RETARDO_SYNC = 450;

interface Estudio {
  grupos: Grupo[];
  // Aplica un cambio. La función recibe SIEMPRE el estado más reciente,
  // incluido el de un clic que todavía no ha llegado al servidor.
  editar: (fn: (gs: Grupo[]) => Grupo[]) => void;
  // Para construir enlaces a la ficha de una marca sin perder el estudio.
  query: string;
  guardando: boolean;
}

const Ctx = createContext<Estudio | null>(null);

export function useEstudio(): Estudio {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEstudio fuera de EstudioProvider');
  return v;
}

export function EstudioProvider({
  dominio,
  inicial,
  queryInicial,
  children,
}: {
  dominio: string; // dominio del cliente del estudio
  inicial: Grupo[];
  // La query con la que se entró, o null si se entró sin ?g=. Llegar con
  // grupos explícitos guarda: abrir un enlace compartido deja el estudio como
  // lo mandó quien lo compartió.
  queryInicial: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [grupos, setGrupos] = useState<Grupo[]>(inicial);
  const [guardando, setGuardando] = useState(false);

  // La referencia es la verdad para los manejadores: setState no es síncrono,
  // así que dos clics seguidos leerían los dos el mismo valor viejo.
  const actual = useRef<Grupo[]>(inicial);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Una escritura en vuelo y, como mucho, una esperando. Da igual cuántos
  // cambios se acumulen: lo que se manda es siempre el estado entero actual.
  const enVuelo = useRef(false);
  const pendiente = useRef(false);

  const persistir = useCallback(async () => {
    if (enVuelo.current) {
      pendiente.current = true;
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    try {
      await fetch('/api/estudio/grupos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: dominio, grupos: actual.current }),
      });
    } catch {
      // Sin conexión el estudio sigue en pantalla y en la URL; el siguiente
      // cambio lo vuelve a intentar con el estado completo.
    } finally {
      enVuelo.current = false;
      setGuardando(false);
      if (pendiente.current) {
        pendiente.current = false;
        void persistir();
      }
    }
  }, [dominio]);

  const sincronizar = useCallback(() => {
    temporizador.current = null;
    const q = serializeGrupos(actual.current);
    router.replace(q ? `${pathname}?g=${q}` : pathname, { scroll: false });
    void persistir();
  }, [pathname, persistir, router]);

  const editar = useCallback(
    (fn: (gs: Grupo[]) => Grupo[]) => {
      const siguiente = fn(actual.current);
      actual.current = siguiente; // síncrono: el clic siguiente ya lo ve
      setGrupos(siguiente); // se pinta ya, sin esperar al servidor
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(sincronizar, RETARDO_SYNC);
    },
    [sincronizar],
  );

  // Al llegar con ?g= explícito se guarda una vez, para que abrir un enlace
  // compartido deje el estudio como venía en él.
  const yaGuardadoAlEntrar = useRef(false);
  useEffect(() => {
    if (queryInicial === null || yaGuardadoAlEntrar.current) return;
    yaGuardadoAlEntrar.current = true;
    void persistir();
  }, [queryInicial, persistir]);

  // El servidor manda cuando aquí no hay nada a medias: así se ve lo que
  // añadió otra persona del equipo, o el resultado de dar de alta una marca
  // nueva. Con cambios sin sincronizar, mandan los de aquí.
  useEffect(() => {
    if (temporizador.current || enVuelo.current || pendiente.current) return;
    if (JSON.stringify(inicial) === JSON.stringify(actual.current)) return;
    actual.current = inicial;
    setGrupos(inicial);
  }, [inicial]);

  // Un cambio recién hecho no puede quedarse sin guardar porque alguien
  // navegue o cierre la pestaña dentro de la ventana de agrupación.
  useEffect(() => {
    const alSalir = () => {
      if (!temporizador.current) return;
      clearTimeout(temporizador.current);
      temporizador.current = null;
      navigator.sendBeacon?.(
        '/api/estudio/grupos-beacon',
        new Blob([JSON.stringify({ domain: dominio, grupos: actual.current })], {
          type: 'application/json',
        }),
      );
    };
    window.addEventListener('pagehide', alSalir);
    return () => {
      window.removeEventListener('pagehide', alSalir);
      alSalir();
    };
  }, [dominio]);

  return (
    <Ctx.Provider value={{ grupos, editar, query: serializeGrupos(grupos), guardando }}>
      {children}
    </Ctx.Provider>
  );
}
