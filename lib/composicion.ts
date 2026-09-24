// La composición de un estudio cuando la tocan dos personas a la vez.
//
// QUÉ PASABA
//
// Cada pestaña guardaba su copia ENTERA de los grupos. El 24/09 Sergio añadió
// Branng, Firma y Saffron entre las 9:29 y las 9:55; Victor, con una pestaña
// abierta desde antes, añadió otras ocho entre las 10:00 y las 10:39. Cada
// alta de Victor mandaba SU copia, que no tenía las de Sergio, y las borraba.
// Gana el último que escribe, y el último que escribe no sabe lo que no ve.
//
// QUÉ SE HACE AHORA
//
// Cada pestaña recuerda la versión de la que partió (`base`) y manda la suya
// (`nuestra`). El servidor compara las dos para saber qué cambió ESA persona
// y aplica solo eso sobre lo que hay guardado (`suya`). Es la fusión de tres
// vías de cualquier control de versiones, marca a marca:
//
//   · si esta pestaña no tocó una marca, manda lo guardado;
//   · si la tocó (la añadió, la quitó, la movió o la ocultó), manda lo suyo.
//
// Así las altas de los dos sobreviven, y un conflicto de verdad (los dos
// movieron la misma marca) lo gana el último, que es lo único razonable.
//
// Las notas NO son composición: viven en la ficha de cada marca y se guardan
// una a una. Aquí no se tocan.
import type { Grupo } from './benchmark';

interface Sitio {
  grupo: string;
  oculta: boolean;
}

function sitios(gs: Grupo[]): Map<string, Sitio> {
  const m = new Map<string, Sitio>();
  for (const g of gs) {
    const ocultas = new Set(g.ocultas ?? []);
    for (const d of g.dominios) {
      // Una marca vive en un solo grupo. Si por un fallo antiguo aparece en
      // dos, cuenta el primero, que es el que se pinta.
      if (!m.has(d)) m.set(d, { grupo: g.nombre, oculta: ocultas.has(d) });
    }
  }
  return m;
}

function mismoSitio(a: Sitio | undefined, b: Sitio | undefined): boolean {
  if (!a || !b) return a === b;
  return a.grupo === b.grupo && a.oculta === b.oculta;
}

// ¿Cambió esta persona el ORDEN relativo de lo que ya había? Solo se mira lo
// que está en las dos listas: añadir o quitar no es reordenar.
function reordenado(antes: string[], despues: string[]): boolean {
  const comunes = new Set(antes.filter((x) => despues.includes(x)));
  const a = antes.filter((x) => comunes.has(x));
  const b = despues.filter((x) => comunes.has(x));
  return a.some((x, i) => x !== b[i]);
}

// Ordena `elementos` siguiendo `primaria` y, lo que no esté ahí, `secundaria`,
// y al final lo que no esté en ninguna. Sin perder ni repetir nada.
function ordenPor<T>(elementos: T[], primaria: T[], secundaria: T[]): T[] {
  const quedan = new Set(elementos);
  const salida: T[] = [];
  for (const lista of [primaria, secundaria, elementos]) {
    for (const x of lista) {
      if (quedan.has(x)) {
        salida.push(x);
        quedan.delete(x);
      }
    }
  }
  return salida;
}

export function fusionaComposicion(base: Grupo[], nuestra: Grupo[], suya: Grupo[]): Grupo[] {
  const sb = sitios(base);
  const sn = sitios(nuestra);
  const ss = sitios(suya);

  // 1. Dónde acaba cada marca.
  const destino = new Map<string, Sitio>();
  for (const d of new Set([...sb.keys(), ...sn.keys(), ...ss.keys()])) {
    const b = sb.get(d);
    const n = sn.get(d);
    const s = ss.get(d);
    const elegido = mismoSitio(b, n) ? s : n;
    if (elegido) destino.set(d, elegido);
  }

  // 2. Qué grupos existen. Un grupo desaparece si alguien lo quitó y ya no
  // le queda ninguna marca; si una persona lo quitó mientras la otra le
  // metía una marca, se queda con esa marca: perder un alta cuesta un scan,
  // y un grupo de más se quita con un clic.
  const nombresBase = base.map((g) => g.nombre);
  const nombresNuestros = nuestra.map((g) => g.nombre);
  const nombresSuyos = suya.map((g) => g.nombre);
  const quitadoPorNosotros = new Set(nombresBase.filter((n) => !nombresNuestros.includes(n)));
  const quitadoPorEllos = new Set(nombresBase.filter((n) => !nombresSuyos.includes(n)));
  const conMarcas = new Set([...destino.values()].map((s) => s.grupo));
  const existentes = new Set(
    [...nombresSuyos, ...nombresNuestros].filter((n) => {
      if (conMarcas.has(n)) return true;
      return !quitadoPorNosotros.has(n) && !quitadoPorEllos.has(n);
    }),
  );

  // 3. En qué orden van los grupos: el de quien los reordenó; si nadie, el
  // guardado, con los nuevos de esta pestaña donde los puso.
  const ordenGrupos = reordenado(nombresBase, nombresNuestros)
    ? ordenPor([...existentes], nombresNuestros, nombresSuyos)
    : ordenPor([...existentes], nombresSuyos, nombresNuestros);

  const listaDe = (gs: Grupo[], nombre: string) => gs.find((g) => g.nombre === nombre)?.dominios ?? [];

  return ordenGrupos.map((nombre) => {
    const dentro = [...destino.entries()].filter(([, s]) => s.grupo === nombre).map(([d]) => d);
    const enBase = listaDe(base, nombre);
    const enNuestra = listaDe(nuestra, nombre);
    const enSuya = listaDe(suya, nombre);
    // Dentro del grupo, lo mismo: manda el orden de quien reordenó. Las
    // marcas nuevas van al final, que es donde las pone el campo de alta.
    const dominios = reordenado(enBase, enNuestra)
      ? ordenPor(dentro, enNuestra, enSuya)
      : ordenPor(dentro, enSuya, enNuestra);
    const ocultas = dominios.filter((d) => destino.get(d)?.oculta);
    return {
      nombre,
      dominios,
      ...(ocultas.length ? { ocultas } : {}),
    };
  });
}

// La base para quien NO dice de dónde partió: una pestaña abierta antes de
// este arreglo, o un enlace viejo con ?g=. Se toma como base lo guardado,
// pero solo en las marcas que esa pestaña también tiene. Así lo que traiga
// de nuevo se añade, lo que mueva u oculte se respeta, y lo que le falte NO
// se interpreta como "lo he quitado": que no lo vea no significa que no
// exista. Una copia vieja puede añadir; nunca borrar.
export function baseSegura(nuestra: Grupo[], suya: Grupo[]): Grupo[] {
  const nuestras = new Set(nuestra.flatMap((g) => g.dominios));
  return suya.map((g) => ({
    ...g,
    dominios: g.dominios.filter((d) => nuestras.has(d)),
    ocultas: (g.ocultas ?? []).filter((d) => nuestras.has(d)),
  }));
}

// Las marcas de un enlace ?g= que no están en el estudio guardado. Un enlace
// ya no escribe nada al abrirse: se enseñan y se añaden si alguien quiere.
export function faltanEnElEstudio(enlace: Grupo[], guardado: Grupo[]): { grupo: string; dominio: string }[] {
  const dentro = new Set(guardado.flatMap((g) => g.dominios));
  return enlace.flatMap((g) =>
    g.dominios.filter((d) => !dentro.has(d)).map((dominio) => ({ grupo: g.nombre, dominio })),
  );
}

// La composición sin las notas antiguas: desde que las notas viven en la
// ficha de cada marca, la composición no las lleva ni las guarda.
export function sinNotas(gs: Grupo[]): Grupo[] {
  return gs.map(({ notas: _notas, ...g }) => g);
}
