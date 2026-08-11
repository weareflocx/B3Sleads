// La tarjeta de marca: el Brand Seed de una startup en formato cuadrado, para
// compartírselo al founder y abrir conversación.
//
// Criterio de contenido, que es lo que la hace funcionar: la tarjeta habla de
// SU marca, no de nosotros. Cada celda enseña lo que el Scanner DETECTÓ en sus
// superficies —su propio discurso devuelto ordenado—, no nuestro juicio sobre
// él. El análisis crítico se queda en la ficha; aquí solo va el espejo.
//
// Los huecos tampoco se maquillan: una dimensión sin detectar sale marcada.
// El Scanner no mira solo la web, sino toda la huella digital de la marca,
// así que eso es lo que se nombra. Es honesto y, de paso, es justo el motivo
// de la conversación.
import { enumeratedTerms, sinGritos, type ScanDimension } from './scan-report';
import { canonDimension } from './scan-versions';

export interface CardCell {
  key: string;
  label: string;
  text: string | null; // null = no detectado
  terms: string[] | null; // atributos y valores van como píldoras
  // La nota del componente, para enseñarla pequeña en su esquina: el detalle
  // que convierte la tarjeta en un análisis y no en un moodboard.
  score: number | null;
  max: number | null;
  // Atributos y valores: o son etiquetas cortas, o no son. Nunca un párrafo.
  soloTerminos: boolean;
}

// El orden de la tarjeta, calcado del Brand Seed: propósito y magnetismo
// arriba (el porqué y el gancho), la tríada de posicionamiento en medio,
// los términos cortos y, abajo, misión y visión (el largo plazo).
export const CARD_LAYOUT = {
  top: ['purpose', 'magnetism'],
  middle: ['value-prop', 'personality', 'brand-idea'],
  terms: ['attributes', 'values'],
  bottom: ['mission', 'vision'],
} as const;

const CARD_LABELS: Record<string, string> = {
  purpose: 'Propósito',
  magnetism: 'Magnetismo',
  'value-prop': 'Propuesta de valor',
  personality: 'Personalidad',
  'brand-idea': 'Idea de marca',
  attributes: 'Atributos',
  values: 'Valores',
  mission: 'Misión',
  vision: 'Visión',
};

// Una celda entra con una frase, no con un párrafo. Se corta por la primera
// frase completa y, si aun así no cabe, con elipsis: mejor una idea entera
// que tres a medias.
export function cardSentence(raw: string | null | undefined, max = 165): string | null {
  // Sin gritos: los titulares de las webs vienen en caja alta y la tarjeta se
  // comparte. Mayúscula solo al principio de cada frase.
  const clean = sinGritos((raw ?? '').replace(/\s+/g, ' ').trim());
  if (clean.length < 12) return null;
  const stop = clean.search(/[.!?](\s|$)/);
  const first = stop > 30 ? clean.slice(0, stop + 1) : clean;
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 60 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

// La cita de un componente es texto capturado en crudo de sus superficies, y
// a veces lo capturado es el formulario de contacto: "HURUS.io - Recaba
// HURUS.io - Nombre y apellidos: … - E-mail: david.a@hurus.io". En la ficha
// eso es evidencia legítima; en algo que se le manda al founder es un
// bochorno, y además saca un correo personal a pasear.
const CAPTURA_SUCIA = [
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, // un correo nunca es discurso de marca
  /\b(?:\+?\d[\d ().-]{7,})\b/, // ni un teléfono
  /nombre y apellidos|e-?mail\s*:|tel[eé]fono\s*:|p[áa]gina web\s*:|direcci[óo]n\s*:/i,
  /pol[íi]tica de privacidad|aviso legal|todos los derechos reservados|acepta(?:r)? cookies/i,
];

// Un trozo repetido delata la captura de un menú o un formulario, no una
// frase: "HURUS.io - Recaba HURUS.io - Recaba HURUS.io".
function tieneRepeticion(text: string): boolean {
  const palabras = text.toLowerCase().split(/\s+/).filter(Boolean);
  const vistos = new Set<string>();
  for (let i = 0; i + 2 < palabras.length; i++) {
    const trio = palabras.slice(i, i + 3).join(' ');
    if (trio.length < 10) continue;
    if (vistos.has(trio)) return true;
    vistos.add(trio);
  }
  return false;
}

export function pareceCaptura(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (CAPTURA_SUCIA.some((re) => re.test(t))) return true;
  // Muchos guiones separadores es el patrón de una lista raspada.
  if ((t.match(/\s[-|·]\s/g) ?? []).length >= 3) return true;
  return tieneRepeticion(t);
}

// El texto de cada celda sale de lo que el Scanner detectó en sus superficies
// (que en el informe viaja como `quote`), pero solo si eso es una frase y no
// un raspado. Si no, se cae a la lectura que el propio Scanner escribió: es
// menos literal, pero sigue hablando de su marca y siempre está limpia.
function cellText(d: ScanDimension | undefined, max: number): string | null {
  if (!d || d.missing) return null;
  // Un componente puntuado a cero no se encontró: enseñar texto al lado de un
  // 0/10 se contradice con su propia nota.
  if (d.score === 0 && d.max) return null;
  const cita = pareceCaptura(d.quote) ? null : cardSentence(d.quote, max);
  return cita ?? cardSentence(d.analysis, max) ?? cardSentence(d.verdict, max);
}

// Cuánto texto cabe en cada zona de la tarjeta. La caja es fija (1080×1080),
// así que el recorte se decide aquí y no se deja al azar del contenido: una
// frase cortada a media palabra en algo que se le manda a un desconocido es
// peor que una frase más corta.
// Los topes salen de medir la celda, no a ojo: ancho útil / ancho de carácter
// x líneas visibles. Si el recorte por líneas llega antes que este, la frase
// muere a media palabra, que es justo lo que no puede pasar en algo que se
// manda a un desconocido.
//
// Con un solo tamaño de letra en todas las celdas (18px) cabe bastante más
// texto que cuando cada zona tenía el suyo, así que los topes suben.
const CELL_MAX: Record<string, number> = {
  purpose: 215, // 5 líneas x ~53 caracteres (columna ancha, 17px)
  magnetism: 215,
  // En columna estrecha el ajuste de palabra desperdicia ~20% de cada línea,
  // así que el tope real es menor que ancho/carácter x líneas.
  'value-prop': 104, // 4 líneas en columna de ~264px
  personality: 104,
  'brand-idea': 104,
  attributes: 92, // 2 líneas, columna ancha
  values: 92,
  mission: 168, // 4 líneas x ~53, menos lo que se come el ajuste de palabra
  vision: 168,
};

// Las dos dimensiones que se enseñan como etiquetas y no como prosa.
const TERM_KEYS = new Set(['attributes', 'values']);

export function buildCardCells(
  dimensions: ScanDimension[],
  termsByKey: Record<string, { terms: string[]; implicit: boolean }> = {},
): Record<string, CardCell> {
  const byKey = new Map(dimensions.map((d) => [canonDimension(d.name), d]));
  const cells: Record<string, CardCell> = {};
  for (const key of Object.keys(CARD_LABELS)) {
    const d = byKey.get(key);
    // Atributos y valores se enseñan como términos cortos, igual que en el
    // B3S Seed: son etiquetas, no prosa.
    // Cadena de fuentes, de mejor a peor: los términos del propio informe,
    // los destilados con IA y, sin clave de Claude, una extracción
    // determinista de la enumeración que a veces trae el texto detectado.
    // Si nada da píldoras, la celda cae a la frase y se lee igual.
    const terms =
      (d?.terms?.length ? d.terms : null) ??
      (termsByKey[key]?.terms?.length ? termsByKey[key].terms : null) ??
      (TERM_KEYS.has(key) ? enumeratedTerms(d?.quote ?? d?.analysis) : null);
    cells[key] = {
      key,
      label: CARD_LABELS[key],
      text: cellText(d, CELL_MAX[key] ?? 130),
      terms: terms?.length ? terms.slice(0, 4) : null,
      score: d && !d.missing && d.score != null ? Number(d.score) : null,
      max: d?.max ?? null,
      soloTerminos: TERM_KEYS.has(key),
    };
  }
  // Misión y visión repetidas: se conserva la misión, que es la que la marca
  // declara de verdad, y la visión pasa a hueco. Al revés sería premiar la
  // paráfrasis.
  if (seRepiten(cells.mission?.text ?? null, cells.vision?.text ?? null)) {
    cells.vision = { ...cells.vision, text: null, terms: null };
  }
  return cells;
}

// Dos celdas no pueden decir lo mismo. Pasa cuando la marca declara una
// misión pero no una visión: el Scanner parafrasea la primera y puntúa las
// dos, así que la tarjeta repetiría la frase. La lectura honesta es que no
// tienen visión propia, y eso es justo el hueco del que se habla.
const PALABRAS_VACIAS = new Set(
  'de la el los las lo un una unos unas que y a en con por para su sus del al es son se como más o u the of and to for in with that'.split(
    ' ',
  ),
);

function fondoLexico(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !PALABRAS_VACIAS.has(w)),
  );
}

export function seRepiten(a: string | null, b: string | null, umbral = 0.45): boolean {
  if (!a || !b) return false;
  const A = fondoLexico(a);
  const B = fondoLexico(b);
  if (A.size < 3 || B.size < 3) return false;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes += 1;
  return comunes / (A.size + B.size - comunes) >= umbral;
}

// La banda del score, en el lenguaje con el que se le puede enseñar a su
// dueño: describe el estado, no suspende a nadie.
export function cardBand(score: number): string {
  if (score < 40) return 'marca por construir';
  if (score < 60) return 'funciona, aún no distingue';
  if (score < 75) return 'sólida, con huecos';
  return 'marca trabajada';
}

// La frase destacada por defecto: la lectura global del Scanner, en una sola
// frase. Es editable en la tarjeta, porque el gancho lo escribe quien manda
// el mensaje.
export function defaultHighlight(summary: string | null | undefined): string {
  return cardSentence(summary, 190) ?? '';
}

// Cuántas dimensiones dejaron rastro. Es el dato honesto de la tarjeta y el
// que abre la conversación: "seis de nueve están; las otras tres, no".
export function cardCoverage(cells: Record<string, CardCell>): {
  detected: number;
  total: number;
} {
  const all = Object.values(cells);
  return {
    detected: all.filter((c) => c.terms || (!c.soloTerminos && c.text)).length,
    total: all.length,
  };
}
