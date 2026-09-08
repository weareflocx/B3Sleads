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
import type { Eje, MarcaEstudio, PosicionesCliente } from '@/lib/battle-cards';

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
  ejes: Eje[];
  posiciones: PosicionesCliente;
  // Define los ejes y dónde está el cliente en ellos. Se manda el conjunto.
  definirEjes: (ejes: Eje[], posiciones: PosicionesCliente) => void;
  // Puntúa una marca en un eje. null borra la puntuación; 0 es el extremo.
  // Con persistir a false solo mueve el estado: es lo que permite arrastrar
  // un deslizador sin mandar una petición por cada píxel.
  puntuar: (dominio: string, eje: string, valor: number | null, persistir?: boolean) => void;
  eliminarEje: (eje: string) => void;
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
  ejesIniciales,
  posicionesIniciales,
  queryInicial,
  children,
}: {
  dominio: string; // dominio del cliente del estudio
  inicial: Grupo[];
  marcasIniciales: Record<string, MarcaEstudio>;
  ejesIniciales: Eje[];
  posicionesIniciales: PosicionesCliente;
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
  const [ejes, setEjes] = useState<Eje[]>(ejesIniciales);
  const [posiciones, setPosiciones] = useState<PosicionesCliente>(posicionesIniciales);
  const [enCurso, setEnCurso] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const actual = useRef<Grupo[]>(inicial);
  const fichas = useRef<Record<string, MarcaEstudio>>(marcasIniciales);
  const ejesRef = useRef<Eje[]>(ejesIniciales);
  const posicionesRef = useRef<PosicionesCliente>(posicionesIniciales);
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

  // ---------- ejes ----------

  // Toda escritura que no sea de composición sigue el mismo patrón: se pinta
  // ya, se manda en el acto, y el error se enseña en vez de tragárselo.
  const mandar = useCallback(async (url: string, method: string, cuerpo: unknown) => {
    setEnCurso((n) => n + 1);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'No se pudo guardar');
      }
    } catch {
      setError('Sin conexión: el cambio no se ha guardado');
    } finally {
      setEnCurso((n) => n - 1);
    }
  }, []);

  const definirEjes = useCallback(
    (nuevos: Eje[], nuevasPosiciones: PosicionesCliente) => {
      ejesRef.current = nuevos;
      posicionesRef.current = nuevasPosiciones;
      setEjes(nuevos);
      setPosiciones(nuevasPosiciones);
      setError(null);
      void mandar('/api/estudio/ejes', 'PUT', {
        domain: dominio,
        axes: nuevos,
        clientPositions: nuevasPosiciones,
      });
    },
    [dominio, mandar],
  );

  const puntuar = useCallback(
    (marca: string, eje: string, valor: number | null, persistir = true) => {
      const d = marca.toLowerCase();
      const ficha: MarcaEstudio = { ...(fichas.current[d] ?? {}) };
      const scores = { ...(ficha.axis_scores ?? {}) };
      if (valor == null) delete scores[eje];
      else scores[eje] = valor;
      ficha.axis_scores = scores;
      const mapa = { ...fichas.current, [d]: ficha };
      fichas.current = mapa;
      setMarcas(mapa);
      setError(null);
      // Arrastrando se pinta y no se guarda; al soltar se guarda una vez.
      if (persistir) void mandar('/api/estudio/ejes', 'PATCH', { domain: dominio, marca: d, eje, valor });
    },
    [dominio, mandar],
  );

  const eliminarEje = useCallback(
    (eje: string) => {
      const nuevos = ejesRef.current.filter((e) => e.axis_id !== eje);
      ejesRef.current = nuevos;
      setEjes(nuevos);
      // Borrar un eje se lleva sus puntuaciones y las posiciones del cliente:
      // se refleja aquí igual que lo hace la base, para no enseñar durante un
      // segundo un estado que ya no existe.
      const limpiar = (p?: Record<string, number>) => {
        if (!p) return undefined;
        const { [eje]: _, ...resto } = p;
        return Object.keys(resto).length ? resto : undefined;
      };
      const pos: PosicionesCliente = {
        ...(limpiar(posicionesRef.current.current) ? { current: limpiar(posicionesRef.current.current)! } : {}),
        ...(limpiar(posicionesRef.current.target) ? { target: limpiar(posicionesRef.current.target)! } : {}),
      };
      posicionesRef.current = pos;
      setPosiciones(pos);
      const mapa: Record<string, MarcaEstudio> = {};
      for (const [d, f] of Object.entries(fichas.current)) {
        if (!f.axis_scores) { mapa[d] = f; continue; }
        const { [eje]: _, ...resto } = f.axis_scores;
        mapa[d] = { ...f, axis_scores: resto };
      }
      fichas.current = mapa;
      setMarcas(mapa);
      setError(null);
      void mandar('/api/estudio/ejes', 'DELETE', { domain: dominio, eje });
    },
    [dominio, mandar],
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

  // Reconciliación con el servidor.
  //
  // La regla NO puede ser "si lo de aquí difiere de lo del servidor, gana el
  // servidor". Eso es lo que hacía antes y deshacía cada cambio: al terminar
  // la petición, el efecto volvía a correr, comparaba el estado nuevo con
  // unas props que el servidor todavía no había vuelto a mandar, y las daba
  // por buenas. Puntuar una marca la movía y la devolvía a su sitio sola.
  //
  // La regla correcta es "gana el servidor cuando el servidor ha CAMBIADO":
  // se guarda lo último que llegó de él y solo se adopta cuando lo nuevo
  // difiere de eso. Así entra lo que tocó otra persona del equipo, o el alta
  // de una marca, y no se pisa lo que se acaba de escribir aquí.
  const visto = useRef({
    grupos: JSON.stringify(inicial),
    marcas: JSON.stringify(marcasIniciales),
    ejes: JSON.stringify(ejesIniciales),
    posiciones: JSON.stringify(posicionesIniciales),
  });

  useEffect(() => {
    if (temporizador.current || enVuelo.current || pendiente.current) return;
    const llega = JSON.stringify(inicial);
    if (llega === visto.current.grupos) return;
    visto.current.grupos = llega;
    actual.current = inicial;
    setGrupos(inicial);
  }, [inicial]);

  useEffect(() => {
    if (enCurso > 0) return;

    const m = JSON.stringify(marcasIniciales);
    if (m !== visto.current.marcas) {
      visto.current.marcas = m;
      fichas.current = marcasIniciales;
      setMarcas(marcasIniciales);
    }
    const e = JSON.stringify(ejesIniciales);
    if (e !== visto.current.ejes) {
      visto.current.ejes = e;
      ejesRef.current = ejesIniciales;
      setEjes(ejesIniciales);
    }
    const pos = JSON.stringify(posicionesIniciales);
    if (pos !== visto.current.posiciones) {
      visto.current.posiciones = pos;
      posicionesRef.current = posicionesIniciales;
      setPosiciones(posicionesIniciales);
    }
  }, [marcasIniciales, ejesIniciales, posicionesIniciales, enCurso]);

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
        ejes,
        posiciones,
        definirEjes,
        puntuar,
        eliminarEje,
        query: serializeGrupos(grupos),
        guardando: enCurso > 0,
        error,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
