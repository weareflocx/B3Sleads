// Argumentario para hablar con el founder, generado del scan de B3S.
// Determinista (sin API): abre el informe completo dimensión a dimensión y se
// apoya en las FRASES CONCRETAS de esa marca (veredicto, análisis, plan) para
// que cada founder tenga una lectura y un ángulo distintos, no una plantilla.
// Voz FLOC: declarativo, sin clichés, nunca pitch en el primer mensaje.
// Cuando hay ANTHROPIC_API_KEY, lib/claude.ts redacta el borrador final con
// este mismo material; esto es el suelo, no el techo.
import offer from '@/config/floc-offer.json';
import type { Company, Scan, Signal } from './types';
import { storedScanReport, type ScanDimension, type ScanReport } from './scan-report';

export interface Pitch {
  lectura: string[]; // qué dice el scan de su marca (frases de la propia marca)
  angulos: string[]; // preguntas/ángulos para abrir conversación
  opener: string | null; // la mejor frase de entrada, una sola línea
  programa: { name: string; scope: string; price: string; why: string } | null;
}

// Preguntas por dimensión (varias variantes; se elige por hash del lead para
// que dos marcas con el mismo hueco no reciban lo mismo). Observación +
// pregunta abierta, tono founder-to-founder.
const DIM_ANGLES: { match: RegExp; qs: string[]; short: string }[] = [
  {
    match: /misi[oó]n/i,
    short: '¿Es una decisión o algo que aún no han puesto por escrito?',
    qs: [
      'Su web explica bien qué hacen, pero no por qué existen. ¿Es una decisión consciente o algo que nunca han escrito?',
      'Nada en sus superficies dice para qué construyen esto más allá del producto. ¿Lo tienen claro y no lo cuentan, o está por definir?',
    ],
  },
  {
    match: /visi[oó]n/i,
    short: '¿Dónde ven la categoría en tres años?',
    qs: [
      'La marca reacciona al mercado pero no dice hacia dónde va la categoría. ¿Dónde la ven en tres años, y quién la cuenta si no lo hacen ustedes?',
      'No hay un horizonte visible en su comunicación. ¿Están liderando la categoría o siguiéndola?',
    ],
  },
  {
    match: /prop[oó]sito|purpose/i,
    short: '¿Qué querrían que dijeran de la marca sus usuarios?',
    qs: [
      'La gente usa el producto pero no sabe por qué debería quedarse. ¿Qué querrían que dijeran de la marca sus usuarios?',
      'El propósito no aparece en ninguna superficie. La conexión con la comunidad se queda en lo funcional. ¿Es lo que quieren?',
    ],
  },
  {
    match: /valores|values/i,
    short: '¿Qué no harían nunca? Ahí suele estar la marca.',
    qs: [
      'No hay criterio público de cómo decide el equipo. ¿Qué no harían nunca? Esa respuesta suele ser la marca que no han escrito.',
      'Los valores no se leen en ningún sitio. ¿Están operando con ellos aunque no los comuniquen?',
    ],
  },
  {
    match: /propuesta de valor|value/i,
    short: '¿Cómo lo explican cuando no están delante para explicarlo?',
    qs: [
      'Su propuesta se entiende si ya conoces la categoría, pero no al que llega frío. ¿Cómo la explican cuando no están delante para explicarla?',
      'La web lista funciones, no demuestra por qué son la única opción. ¿Han probado a decir la promesa en una frase que no le valga a su competencia?',
    ],
  },
  {
    match: /personalidad|arquetipo|personality/i,
    short: 'Si le quitan el logo, ¿alguien sabría que es suya?',
    qs: [
      'La voz suena a la plantilla del sector. Si le quitan el logo a su web, nadie sabría que es suya. ¿Es el objetivo o un accidente?',
      'La personalidad es funcional pero intercambiable. ¿Qué tono les haría reconocibles sin ver el nombre?',
    ],
  },
  {
    match: /atributos|attributes/i,
    short: '¿Eso es su ventaja o una feature más en la lista?',
    qs: [
      'Comunican sus atributos como funciones sueltas. ¿Cuál de ellos es de verdad su ventaja y no una casilla más de la lista?',
      'Sus fortalezas técnicas están, pero enterradas entre features. ¿Cuál merecería ser el titular de la marca?',
    ],
  },
  {
    match: /coherencia|consistency/i,
    short: '¿Cuál de todas esas versiones es la de verdad?',
    qs: [
      'Cada canal cuenta una empresa un poco distinta. ¿Cuál de todas esas versiones es la de verdad?',
      'La marca cambia según dónde la mires. ¿Es una fase o nadie ha puesto orden todavía?',
    ],
  },
  {
    match: /idea de marca|identidad|identity/i,
    short: '¿Qué idea debería sobrevivir a cualquier rediseño?',
    qs: [
      'No hay una idea que ordene el resto: cada pieza va por su lado. ¿Qué idea debería sobrevivir a cualquier rediseño o pivot?',
      'Falta un centro que dé sentido a todo lo demás. ¿Cuál sería si tuvieran que elegir uno?',
    ],
  },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// "Misión, visión y valores" a partir de los nombres de dimensión.
function joinNames(names: string[]): string {
  const low = names.map((n) => n.toLowerCase());
  if (low.length === 1) return names[0];
  const cap = names[0];
  const rest = low.slice(1);
  const tail = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} y ${rest[rest.length - 1]}`;
  return `${cap}, ${tail}`;
}

function angleFor(dim: ScanDimension, seed: number): { long: string; short: string } {
  const entry = DIM_ANGLES.find((a) => a.match.test(dim.name));
  if (!entry) {
    return {
      long: `El scan marca un hueco en ${dim.name.toLowerCase()}. ¿Es una decisión o algo pendiente de ordenar?`,
      short: `¿${dim.name} es una decisión o algo pendiente?`,
    };
  }
  return { long: entry.qs[seed % entry.qs.length], short: entry.short };
}

function trim(text: string, max = 220): string {
  const t = text.trim();
  const dot = t.indexOf('. ');
  const cut = dot > 40 ? t.slice(0, dot + 1) : t;
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + '…' : cut;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ---- Camino rico: el informe completo, por dimensión ----
function pitchFromReport(
  report: ScanReport,
  company: Company,
  scan: Scan,
  fundingSignal: Signal | null,
): Pitch {
  const seed = hashStr(company.id || company.domain);
  const lectura: string[] = [];
  const angulos: string[] = [];

  // Lo que ya funciona: da a Sergio con qué reconocer, no solo qué falta.
  const strength = report.strengths[0];
  if (strength && (strength.verdict || strength.analysis)) {
    lectura.push(`Ya funciona · ${strength.name}: ${trim(strength.verdict || strength.analysis!)}`);
  }

  const weak = report.weaknesses;
  const missing = weak.filter((d) => d.missing).map((d) => d.name);
  // Huecos con análisis propio (los más distintivos) frente a los "no detectado".
  const scoredWeak = weak.filter((d) => !d.missing && (d.verdict || d.analysis));

  // Dimensiones ausentes, agrupadas en una línea.
  if (missing.length) lectura.push(`${joinNames(missing)} sin rastro en superficies públicas.`);
  // Huecos concretos: la frase de la propia marca.
  for (const d of scoredWeak.slice(0, 2)) {
    lectura.push(`${d.name} (${d.score}/${d.max}): ${trim(d.verdict || d.analysis!)}`);
  }

  // Ángulos: pregunta por dimensión (variada por seed) para los 2 huecos top.
  weak.slice(0, 2).forEach((d, i) => angulos.push(angleFor(d, seed + i).long));
  // Palanca desde la fortaleza: convertir lo bueno en historia.
  if (strength) {
    angulos.push(
      `Lo más sólido del análisis es ${strength.name.toLowerCase()} (${strength.score}/${strength.max}). El ángulo no es arreglar, es convertir eso en la historia que aún no cuentan.`,
    );
  }

  // Momento de financiación como ángulo, si lo hay.
  if (fundingSignal?.detail) {
    const d = fundingSignal.detail;
    const days = daysSince(fundingSignal.detected_at);
    const roundTxt = [d.round, d.amount].filter(Boolean).join(' de ');
    if (days <= 90) {
      angulos.push(
        `Ronda reciente (${roundTxt || 'sin detalle'}, hace ${days} días): los inversores ya compraron el relato una vez. Ahora toca que lo compre el mercado.`,
      );
    }
  }

  // Opener: la frase de entrada. Se ancla, por este orden:
  //  1) un hueco con análisis propio de la marca (lo más irrepetible),
  //  2) si no hay, el contraste fortaleza real → dimensión ausente,
  //  3) si no, el resumen del informe.
  let opener: string | null = null;
  if (scoredWeak.length) {
    const lead = scoredWeak[seed % scoredWeak.length];
    opener = `${trim(lead.verdict || lead.analysis!, 200)} ${angleFor(lead, seed).short}`.trim();
  } else if (missing.length && strength && (strength.verdict || strength.analysis)) {
    const lead = weak.find((d) => d.missing)!;
    opener = `${company.name}: ${trim(strength.verdict || strength.analysis!, 130)} Y aún así, su ${lead.name.toLowerCase()} no está escrita en ninguna parte. ${angleFor(lead, seed).short}`;
  } else if (missing.length) {
    const lead = weak.find((d) => d.missing)!;
    opener = `${company.name} comunica bien el producto, pero su ${lead.name.toLowerCase()} no aparece en ninguna superficie pública. ${angleFor(lead, seed).short}`;
  } else if (report.summary) {
    opener = trim(report.summary, 260);
  }

  return {
    lectura: lectura.slice(0, 4),
    angulos: angulos.slice(0, 4),
    opener,
    programa: recommendProgram(company, scan, fundingSignal),
  };
}

// ---- Programa FLOC* recomendado por momento (común a ambos caminos) ----
function recommendProgram(
  company: Company,
  scan: Scan | null,
  fundingSignal: Signal | null,
): Pitch['programa'] {
  const stage = (company.funding_stage ?? fundingSignal?.detail?.round ?? '').toString().toLowerCase();
  const small = company.size === '1-10';
  const byName = (n: string) => offer.programs.find((p) => p.name === n)!;

  if (/launch|pre-seed/.test(stage) || (!stage && small)) {
    const p = byName('Go Sprint');
    return { ...p, why: 'Está lanzando con equipo pequeño: marca y landing listas en 4 semanas, sin frenar el producto.' };
  }
  if (/seed|series/.test(stage) || fundingSignal) {
    const p = byName('Go To Market');
    return { ...p, why: 'Con ronda en juego, la marca es parte del caso de inversión: construcción completa en 6-8 semanas.' };
  }
  if (scan?.score != null && Number(scan.score) >= 60) {
    const p = byName('Go Beyond');
    return { ...p, why: 'La base existe: encaja un partnership continuo para evolucionarla, no una reconstrucción.' };
  }
  if (scan?.score != null) {
    const p = byName('Go Sprint');
    return { ...p, why: 'El gap es amplio y el equipo pequeño: mejor empezar por una base sólida y rápida.' };
  }
  return null;
}

// ---- Fallback: sin markdown del informe, banda por score + gaps del tldr ----
const GAP_NOTES: { match: RegExp; obs: string; angulo: string }[] = [
  { match: /misi[oó]n|mission/i, obs: 'No comunica misión en superficies públicas. Se percibe como utilidad, no como proyecto.', angulo: 'Preguntarle por qué existe el proyecto más allá del producto. Casi ningún founder tiene esa respuesta escrita.' },
  { match: /visi[oó]n|vision/i, obs: 'Sin visión visible. La marca reacciona al mercado en vez de proyectar hacia dónde va.', angulo: 'Preguntar dónde ve su categoría en tres años y quién la va a contar si no lo hace él.' },
  { match: /prop[oó]sito|purpose/i, obs: 'El propósito no aparece. La conexión con su comunidad se queda en lo funcional.', angulo: 'Preguntar qué querría que dijeran de la marca sus usuarios.' },
  { match: /valores|values/i, obs: 'Valores no detectados. No hay criterio público de cómo decide el equipo.', angulo: 'Preguntar qué no haría nunca la empresa. La respuesta suele ser la marca que no han escrito.' },
  { match: /propuesta de valor|value prop|offer/i, obs: 'La propuesta de valor no está clara en su web. El visitante tiene que deducirla.', angulo: 'Preguntar cómo explica el producto en una frase cuando no está él delante.' },
  { match: /personalidad|arquetipo|personality/i, obs: 'Sin personalidad definida. La marca suena a la plantilla del sector.', angulo: 'Si mañana le quitan el logo a su web, nadie sabría que es suya. Ese es el ángulo.' },
];

function scoreBand(score: number): { lectura: string; angulo: string } {
  if (score < 40) return { lectura: 'Marca por construir. El producto avanza más rápido que su relato.', angulo: 'El momento es ahora: cada mes sin marca es contexto que regala a la competencia.' };
  if (score < 60) return { lectura: 'Marca funcional pero indistinguible. Cumple, no diferencia.', angulo: 'Su tecnología se puede clonar en semanas. Lo que no se clona es lo que aún no han construido.' };
  if (score < 75) return { lectura: 'Base sólida con huecos concretos. Los gaps son accionables, no estructurales.', angulo: 'No necesita rehacer la marca, necesita cerrar dos o tres huecos concretos.' };
  return { lectura: 'Marca trabajada. El ángulo no es el gap, es la siguiente etapa.', angulo: 'Reconocer el trabajo hecho y preguntar cómo piensa sostenerlo cuando escale el equipo.' };
}

function pitchFallback(company: Company, scan: Scan | null, fundingSignal: Signal | null): Pitch {
  const lectura: string[] = [];
  const angulos: string[] = [];
  if (scan?.score != null) {
    const band = scoreBand(Number(scan.score));
    lectura.push(band.lectura);
    angulos.push(band.angulo);
  }
  const gaps = ((scan?.tldr as { gaps?: string[] } | null)?.gaps ?? []).slice(0, 4);
  for (const gap of gaps) {
    const note = GAP_NOTES.find((n) => n.match.test(gap));
    if (note) {
      lectura.push(note.obs);
      angulos.push(note.angulo);
    }
  }
  return {
    lectura: lectura.slice(0, 4),
    angulos: angulos.slice(0, 4),
    opener: angulos[0] ?? null,
    programa: recommendProgram(company, scan, fundingSignal),
  };
}

export function buildPitch(opts: {
  company: Company;
  scan: Scan | null;
  fundingSignal: Signal | null;
}): Pitch {
  const { company, scan, fundingSignal } = opts;
  const report = storedScanReport(scan?.result_raw);
  if (scan && report) {
    if (report.dimensions.length) return pitchFromReport(report, company, scan, fundingSignal);
  }
  return pitchFallback(company, scan, fundingSignal);
}
