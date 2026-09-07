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
import type { MarcaEstudio } from '@/lib/battle-cards';

// El estado del estudio, en un solo sitio. Tiene dos mitades que se guardan
// de forma distinta porque no se parecen en nada:
//
//  - COMPOSICIÓN (`grupos`): qué marcas, en qué grupo, en qué orden, cuáles
//    apartadas. Es un documento pequeño que se manda entero, viaja en la URL
//    para poder compartirlo y se agrupa antes de escribir.
//
//  - CRITERIO (`marcas`): rol, capa, prioridad, porqué, puntuación por eje.
//    Se escribe marca a marca contra una función de base que mezcla por
//    dominio, así que no hay nada que agrupar ni orden que respetar.
//
// Lo que comparten es la lección que costó un fallo en producción: los
// manejadores no pueden leer el estado que vino del servidor. Ese valor no se
// refresca hasta que la navegación blanda termina —entre 200 y 500 ms en esta
// página— y dos acciones dentro de esa ventana partían de la misma base, así
// que la segunda pisaba a la primera. Reproducido ocultando dos marcas
// seguidas: solo se guardaba la segunda. Por eso la verdad para escribir es
// una referencia que se actualiza de forma síncrona.

// Cuánto se espera antes de sincronizar la composición. Suficiente para que
// una ráfaga de clics viaje junta, corto para que quien copia el enlace no se
// lleve una URL vieja.
const RETARDO_SYNC = 450;

interface Estudio {
  grupos: Grupo[];
  marcas: Record<string, MarcaEstudio>;
  // Cambia la composición. La función recibe SIEMPRE el estado más reciente.
  editar: (fn: (gs: Grupo[]) => Grupo[]) => void;
  // Cambia el criterio de una marca. Un campo a null lo borra de la ficha.
  clasificar: (dominio: string, parche: Partial<MarcaEstudio>) => void;
  // Para enlazar a la ficha de una marca sin perder el estudio.
  query: string;
  guardando: boolean;
  error: string | null;
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
  marcasIniciales,
  queryInicial,
  children,
}: {
  dominio: string; // dominio del cliente del estudio
  inicial: Grupo[];
  marcasIniciales: Record<string, MarcaEstudio>;
  // La query con la que se entró, o null si se entró sin ?g=. Llegar con
  // grupos explícitos guarda: abrir un enlace compartido deja el estudio como
  // lo mandó quien lo compartió.
  queryInicial: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [grupos, setGrupos] = useState<Grupo[]>(inicial);
  const [marcas, setMarcas] = useState<Record<string, MarcaEstudio>>(marcasIniciales);
  const [enCurso, setEnCurso] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const actual = useRef<Grupo[]>(inicial);
  const fichas = useRef<Record<string, MarcaEstudio>>(marcasIniciales);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Una escritura de composición en vuelo y, como mucho, una esperando. Da
  // igual cuántos cambios se acumulen: se manda siempre el estado entero.
  const enVuelo = useRef(false);
  const pendiente = useRef(false);

  // ---------- composición ----------

  const persistir = useCallback(async () => {
    if (enVuelo.current) {
      pendiente.current = true;
      return;
    }
    enVuelo.current = true;
    setEnCurso((n) => n + 1);
    try {
      await fetch('/api/estudio/grupos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: dominio, grupos: actual.current }),
      });
    } catch {
      // Sin conexión el estudio sigue en pantalla y en la URL; el siguiente
      // cambio lo reintenta con el estado completo.
    } finally {
      enVuelo.current = false;
      setEnCurso((n) => n - 1);
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

  // ---------- criterio ----------

  const clasificar = useCallback(
    (marca: string, parche: Partial<MarcaEstudio>) => {
      const d = marca.toLowerCase();
      const ficha: MarcaEstudio = { ...(fichas.current[d] ?? {}) };
      for (const [clave, valor] of Object.entries(parche)) {
        if (valor === null || valor === undefined || valor === '') {
          delete (ficha as Record<string, unknown>)[clave];
        } else {
          (ficha as Record<string, unknown>)[clave] = valor;
        }
      }
      const mapa = { ...fichas.current, [d]: ficha };
      fichas.current = mapa;
      setMarcas(mapa);
      setError(null);

      // Sin agrupar: cada petición toca un dominio y la mezcla la hace la
      // base, así que dos cambios seguidos no compiten.
      setEnCurso((n) => n + 1);
      void (async () => {
        try {
          const res = await fetch('/api/estudio/clasificacion', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: dominio, marca: d, parche }),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            setError(j.error ?? 'No se pudo guardar la clasificación');
          }
        } catch {
          setError('Sin conexión: la clasificación no se ha guardado');
        } finally {
          setEnCurso((n) => n - 1);
        }
      })();
    },
    [dominio],
  );

  // ---------- entrada y reconciliación ----------

  // Al llegar con ?g= explícito se guarda una vez, para que abrir un enlace
  // compartido deje el estudio como venía en él.
  const yaGuardadoAlEntrar = useRef(false);
  useEffect(() => {
    if (queryInicial === null || yaGuardadoAlEntrar.current) return;
    yaGuardadoAlEntrar.current = true;
    void persistir();
  }, [queryInicial, persistir]);

  // El servidor manda cuando aquí no hay nada a medias: así se ve lo que
  // cambió otra persona del equipo, o el resultado de dar de alta una marca.
  // Con cambios sin sincronizar, mandan los de aquí.
  useEffect(() => {
    if (temporizador.current || enVuelo.current || pendiente.current) return;
    if (JSON.stringify(inicial) === JSON.stringify(actual.current)) return;
    actual.current = inicial;
    setGrupos(inicial);
  }, [inicial]);

  useEffect(() => {
    if (enCurso > 0) return;
    if (JSON.stringify(marcasIniciales) === JSON.stringify(fichas.current)) return;
    fichas.current = marcasIniciales;
    setMarcas(marcasIniciales);
  }, [marcasIniciales, enCurso]);

  // Un cambio de composición recién hecho no puede quedarse sin guardar
  // porque alguien navegue dentro de la ventana de agrupación. El criterio no
  // lo necesita: se manda en el acto.
  useEffect(() => {
    const alSalir = () => {
      if (!temporizador.current) return;
      clearTimeout(temporizador.current);
      temporizador.current = null;
      navigator.sendBeacon?.(
        '/api/estudio/grupos',
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
    <Ctx.Provider
      value={{
        grupos,
        marcas,
        editar,
        clasificar,
        query: serializeGrupos(grupos),
        guardando: enCurso > 0,
        error,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
