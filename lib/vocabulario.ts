// Cruce de vocabulario: qué dicen igual las marcas de un grupo.
//
// Es el test del logo tapado hecho a mano y a escala. Si cinco competidores
// usan la misma expresión, esa expresión no distingue a ninguno: es el
// idioma de la categoría, y ocupar territorio propio empieza por saber cuál
// es. Cuando el cliente coincide con tres o más, la alerta es sobre él.
//
// Dos decisiones vienen del sondeo previo (scripts/spike-vocabulario.mts) y
// las dos cambian el resultado por completo:
//
//  1. Solo texto LITERAL. `detected_content` es la prosa con la que el
//     Scanner describe a la marca, no lo que la marca dice. Incluyéndolo,
//     media categoría "compartía" expresiones como "idea central" o "se
//     define por una cultura", que son del Scanner. Eso mide al Scanner.
//
//  2. Contraste contra el resto del corpus en vez de lista de palabras
//     vacías. Las listas no acaban nunca: "more than" o "people who" no son
//     código de categoría, son inglés. Lo que los separa es dónde aparecen.
//     Medido: "direct selling" sale en 4 de 15 del grupo y en 0% de fuera;
//     "more than", en 6 de 15 y en el 9% de fuera.
import type { Scan } from './types';

// Conectores que arrancarían o cerrarían un n-grama sin aportar nada. La
// lista es corta a propósito: el trabajo de separar lo genérico lo hace el
// contraste, no el diccionario.
const VACIAS = new Set(
  `a al ante antes aqui asi aun cada como con contra cual cuando de del desde donde dos el ella
   ellos en entre era eres es esa ese eso esta estan este esto ha hace hacia han hasta hay la las
   le les lo los mas me mi mucho muy no nos os otra otro para pero poco por porque que se sea
   segun ser si sin sobre solo son su sus tambien tan te ti tiene todo todos tu un una uno unos ya
   il della delle dei degli alla alle nella nelle di da in con su per tra fra che non piu anche
   come dove quando questo questa sono ed nel
   the and for with from that this you your our are was were has have will can all any but not its
   their they them there here what who which when where how` .split(/\s+/).filter(Boolean),
);

// Restos de dirección y de marcado que sobreviven a la limpieza y aparecen
// en todas partes.
const BASURA = new Set(
  'https http www com net org html php index png jpg jpeg svg webp assets img cdn utm href src'.split(' '),
);

export function limpia(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Expresiones de 2 a 4 palabras. Sin lematizar: no hay librería en el
// proyecto y añadirla para esto no compensa, porque el contraste ya separa
// lo genérico mejor de lo que lo haría un lematizador.
export function ngramas(texto: string, min = 2, max = 4): Set<string> {
  const pal = limpia(texto).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= pal.length; i++) {
      const trozo = pal.slice(i, i + n);
      // Empezar o acabar en conector es un recorte, no una expresión.
      if (VACIAS.has(trozo[0]) || VACIAS.has(trozo[n - 1])) continue;
      if (trozo.every((p) => VACIAS.has(p))) continue;
      if (trozo.some((p) => p.length < 3 || BASURA.has(p))) continue;
      out.add(trozo.join(' '));
    }
  }
  return out;
}

// Lo que la marca DICE, no lo que se dice de ella.
export function textoLiteral(scan: Scan | null | undefined): string[] {
  const raw = scan?.result_raw as
    | { components?: Array<Record<string, any>> }
    | null
    | undefined;
  const out: string[] = [];
  for (const c of raw?.components ?? []) {
    for (const t of c.tiles ?? []) {
      if (typeof t?.evidencia === 'string' && t.evidencia.trim()) out.push(t.evidencia);
    }
    for (const r of c.evidence_refs ?? []) {
      if (typeof r?.snippet === 'string' && r.snippet.trim()) out.push(r.snippet);
    }
  }
  return out;
}

export interface TerminoCompartido {
  termino: string;
  // Qué marcas lo usan y con qué frase. La cita es lo que hace discutible el
  // hallazgo: sin ella es una palabra suelta en una lista.
  marcas: { dominio: string; nombre: string; cita: string }[];
  // En cuántas marcas del corpus de fuera aparece, en tanto por ciento. Es
  // la columna que dice si es código de categoría o muletilla del idioma.
  fuera: number;
  // Cuántas veces más probable es dentro del grupo que fuera. Es lo que
  // ordena la lista: sin esto mandaba la frecuencia, y "more than" (5 de 14,
  // pero también en el 5% del resto del corpus) salía por encima de
  // "helping people" (3 de 14 y en ninguna de fuera).
  concentracion: number;
  // El cliente también lo usa.
  clienteTambien: boolean;
  // Suficientemente propio de esta categoría como para que compartirlo
  // signifique algo. Lo que se dice en todas partes no es un hallazgo.
  propio: boolean;
}

export interface VocabularioGrupo {
  nombre: string;
  marcasConTexto: number;
  terminos: TerminoCompartido[];
}

const CITA_MAX = 12; // palabras

function recortaCita(f: string): string {
  const limpio = f.replace(/\s+/g, ' ').trim();
  const pal = limpio.split(' ');
  return pal.length <= CITA_MAX ? limpio : pal.slice(0, CITA_MAX).join(' ') + '…';
}

export function cruzaVocabulario({
  grupos,
  scanPorDominio,
  nombrePorDominio,
  scansDeFuera,
  clienteDominio,
  excluidos,
}: {
  grupos: { nombre: string; dominios: string[] }[];
  scanPorDominio: Map<string, Scan>;
  nombrePorDominio: Map<string, string>;
  // El resto del corpus, para el contraste. Una entrada por marca.
  scansDeFuera: Scan[];
  clienteDominio: string;
  excluidos: string[];
}): { grupos: VocabularioGrupo[]; corpusFuera: number } {
  const fuera = new Set(excluidos.map((t) => t.toLowerCase()));

  // Términos candidatos: los que comparten dos o más marcas de algún grupo.
  // Se recogen antes de mirar el corpus de contraste para no tener que
  // guardar los cincuenta mil n-gramas de las 86 marcas de fondo.
  const porGrupo = new Map<string, Map<string, Map<string, string>>>();
  const candidatos = new Set<string>();
  const conTexto = new Map<string, number>();

  for (const g of grupos) {
    const acumulado = new Map<string, Map<string, string>>();
    let marcas = 0;
    for (const d of g.dominios) {
      const fragmentos = textoLiteral(scanPorDominio.get(d));
      if (!fragmentos.length) continue;
      marcas++;
      const vistos = new Set<string>();
      for (const f of fragmentos) {
        for (const t of ngramas(f)) {
          if (vistos.has(t)) continue;
          vistos.add(t);
          if (!acumulado.has(t)) acumulado.set(t, new Map());
          acumulado.get(t)!.set(d, recortaCita(f));
        }
      }
    }
    conTexto.set(g.nombre, marcas);
    for (const [t, m] of acumulado) if (m.size >= 2) candidatos.add(t);
    porGrupo.set(g.nombre, acumulado);
  }

  // El cliente, aparte: la alerta es sobre él coincidiendo con los demás.
  const delCliente = new Set<string>();
  for (const f of textoLiteral(scanPorDominio.get(clienteDominio))) {
    for (const t of ngramas(f)) delCliente.add(t);
  }

  // Contraste. Solo se cuentan los candidatos, así que una pasada por el
  // corpus de fondo basta y no hay que guardar su vocabulario entero.
  const frecuenciaFuera = new Map<string, number>();
  for (const s of scansDeFuera) {
    const vistos = new Set<string>();
    for (const f of textoLiteral(s)) {
      for (const t of ngramas(f)) if (candidatos.has(t)) vistos.add(t);
    }
    for (const t of vistos) frecuenciaFuera.set(t, (frecuenciaFuera.get(t) ?? 0) + 1);
  }
  const totalFuera = scansDeFuera.length || 1;

  const salida: VocabularioGrupo[] = grupos.map((g) => {
    const acumulado = porGrupo.get(g.nombre) ?? new Map();
    const marcas = conTexto.get(g.nombre) ?? 0;
    const terminos: TerminoCompartido[] = [];

    for (const [t, usos] of acumulado) {
      if (usos.size < 2 || fuera.has(t)) continue;
      const nFuera = frecuenciaFuera.get(t) ?? 0;
      // Suavizado de Laplace: sin él, un término visto en cero marcas de
      // fuera daría concentración infinita y una sola aparición mandaría en
      // la lista.
      const dentroP = (usos.size + 1) / (marcas + 2);
      const fueraP = (nFuera + 1) / (totalFuera + 2);
      terminos.push({
        termino: t,
        marcas: [...usos].map(([dominio, cita]) => ({
          dominio,
          nombre: nombrePorDominio.get(dominio) ?? dominio,
          cita,
        })),
        fuera: Math.round((nFuera / totalFuera) * 100),
        concentracion: Math.round((dentroP / fueraP) * 10) / 10,
        clienteTambien: delCliente.has(t),
        propio: nFuera / totalFuera <= UMBRAL_PROPIO,
      });
    }

    // Arriba lo más concentrado en esta categoría, no lo más repetido.
    terminos.sort((a, b) => b.concentracion - a.concentracion || b.marcas.length - a.marcas.length);

    return { nombre: g.nombre, marcasConTexto: marcas, terminos: colapsa(terminos) };
  });

  return { grupos: salida, corpusFuera: scansDeFuera.length };
}

// Una frase de cuatro palabras genera también sus trozos de dos y de tres, y
// los tres aparecen en las mismas marcas: "live healthier", "healthier lives"
// y "live healthier lives" son UN hallazgo escrito tres veces. Se conserva el
// más largo y se tiran los trozos que no añaden ni una marca.
//
// Solo se colapsa cuando el conjunto de marcas es idéntico. Si un trozo lo
// dicen más marcas que la frase entera, ese trozo es un hallazgo propio: que
// tres marcas digan "energía verde" y solo una diga "energía verde
// certificada" son dos cosas distintas.
function colapsa(terminos: TerminoCompartido[]): TerminoCompartido[] {
  const porLongitud = [...terminos].sort(
    (a, b) => b.termino.split(' ').length - a.termino.split(' ').length,
  );
  const absorbidos = new Set<string>();

  for (const largo of porLongitud) {
    if (absorbidos.has(largo.termino)) continue;
    const marcasLargo = new Set(largo.marcas.map((m) => m.dominio));
    for (const corto of porLongitud) {
      if (corto === largo || absorbidos.has(corto.termino)) continue;
      if (corto.termino.split(' ').length >= largo.termino.split(' ').length) continue;
      // Contenido como secuencia de palabras, no como texto suelto: "art"
      // dentro de "smart" no es el mismo término.
      if (!` ${largo.termino} `.includes(` ${corto.termino} `)) continue;
      const marcasCorto = corto.marcas.map((m) => m.dominio);
      if (marcasCorto.length !== marcasLargo.size) continue;
      if (marcasCorto.every((d) => marcasLargo.has(d))) absorbidos.add(corto.termino);
    }
  }

  return terminos.filter((t) => !absorbidos.has(t.termino));
}

// Cuando el cliente comparte una expresión con tres o más competidores, deja
// de ser suya. Es la alerta de código de categoría.
export const UMBRAL_ALERTA = 3;

// Por encima de este porcentaje de presencia FUERA del estudio, un término no
// es de la categoría: es idioma. Compartir "more than" con tres competidores
// no dice nada de nadie, y una alerta que salta con eso deja de leerse.
export const UMBRAL_PROPIO = 0.03;
