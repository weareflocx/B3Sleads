// Argumentario para hablar con el founder, generado del scan de B3S.
// Determinista (sin API): mapea score, gaps y momento de financiación a
// observaciones, ángulos de conversación y el programa FLOC* que encaja.
// Sigue la voz FLOC: declarativo, sin clichés, nunca pitch en el primer mensaje.
import offer from '@/config/floc-offer.json';
import type { Company, Scan, Signal } from './types';

export interface Pitch {
  lectura: string[]; // qué dice el scan de su marca
  angulos: string[]; // preguntas/ángulos para abrir conversación
  programa: { name: string; scope: string; price: string; why: string } | null;
}

interface GapNote {
  match: RegExp;
  obs: string;
  angulo: string;
}

const GAP_NOTES: GapNote[] = [
  {
    match: /misi[oó]n|mission/i,
    obs: 'No comunica misión en superficies públicas. Se percibe como utilidad, no como proyecto.',
    angulo: 'Preguntarle por qué existe el proyecto más allá del producto. Casi ningún founder tiene esa respuesta escrita, y lo sabe.',
  },
  {
    match: /visi[oó]n|vision/i,
    obs: 'Sin visión visible. La marca reacciona al mercado en vez de proyectar hacia dónde va.',
    angulo: 'Preguntar dónde ve su categoría en tres años y quién la va a contar si no lo hace él.',
  },
  {
    match: /prop[oó]sito|purpose/i,
    obs: 'El propósito no aparece. La conexión con su comunidad se queda en lo funcional.',
    angulo: 'La gente usa el producto pero no sabe por qué debería quedarse. Preguntar qué querría que dijeran de la marca sus usuarios.',
  },
  {
    match: /valores|values/i,
    obs: 'Valores no detectados. No hay criterio público de cómo decide el equipo.',
    angulo: 'Preguntar qué no haría nunca la empresa. La respuesta suele ser la marca que no han escrito.',
  },
  {
    match: /propuesta de valor|value prop|offer/i,
    obs: 'La propuesta de valor no está clara en su web. El visitante tiene que deducirla.',
    angulo: 'Preguntar cómo explica el producto en una frase cuando no está él delante para explicarlo.',
  },
  {
    match: /personalidad|arquetipo|personality|archetype/i,
    obs: 'Sin personalidad definida. La marca suena a la plantilla del sector.',
    angulo: 'Si mañana le quitan el logo a su web, nadie sabría que es suya. Ese es el ángulo.',
  },
  {
    match: /idea de marca|brand idea|identidad|identity/i,
    obs: 'No hay una idea de marca que ordene el resto. Cada pieza va por su lado.',
    angulo: 'Preguntar qué idea única debería sobrevivir a cualquier rediseño o pivot.',
  },
  {
    match: /coherencia|consistency/i,
    obs: 'Incoherencia entre superficies: la marca cambia según dónde la mires.',
    angulo: 'Cada canal cuenta una empresa distinta. Preguntar cuál de todas es la de verdad.',
  },
  {
    match: /outcome/i,
    obs: 'El resultado que promete al cliente queda difuso en su comunicación.',
    angulo: 'Preguntar qué cambia en la vida del cliente tras usar el producto, y dónde lo dice su web.',
  },
];

function scoreBand(score: number): { lectura: string; angulo: string } {
  if (score < 40) {
    return {
      lectura: 'Marca por construir. El producto avanza más rápido que su relato.',
      angulo: 'El momento es ahora: cada mes sin marca es contexto que regala a la competencia.',
    };
  }
  if (score < 60) {
    return {
      lectura: 'Marca funcional pero indistinguible. Cumple, no diferencia.',
      angulo: 'Su tecnología se puede clonar en semanas. Lo que no se clona es lo que aún no han construido.',
    };
  }
  if (score < 75) {
    return {
      lectura: 'Base sólida con huecos concretos. Los gaps son accionables, no estructurales.',
      angulo: 'No necesita rehacer la marca, necesita cerrar dos o tres huecos concretos. Conversación fácil de abrir.',
    };
  }
  return {
    lectura: 'Marca trabajada. El ángulo no es el gap, es la siguiente etapa.',
    angulo: 'Reconocer el trabajo hecho y preguntar cómo piensa sostenerlo cuando escale el equipo.',
  };
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function buildPitch(opts: {
  company: Company;
  scan: Scan | null;
  fundingSignal: Signal | null;
}): Pitch {
  const { company, scan, fundingSignal } = opts;
  const lectura: string[] = [];
  const angulos: string[] = [];

  // Lectura por score
  if (scan?.score != null) {
    const band = scoreBand(Number(scan.score));
    lectura.push(band.lectura);
    angulos.push(band.angulo);
  }

  // Lectura por gaps del scan
  const gaps = ((scan?.tldr as { gaps?: string[] } | null)?.gaps ?? []).slice(0, 4);
  for (const gap of gaps) {
    const note = GAP_NOTES.find((n) => n.match.test(gap));
    if (note) {
      lectura.push(note.obs);
      angulos.push(note.angulo);
    }
  }

  // Momento de financiación como ángulo
  if (fundingSignal?.detail) {
    const d = fundingSignal.detail;
    const days = daysSince(fundingSignal.detected_at);
    const roundTxt = [d.round, d.amount].filter(Boolean).join(' de ');
    if (days <= 90) {
      angulos.push(
        `Ronda reciente (${roundTxt || 'sin detalle'}, hace ${days} días): los inversores ya compraron el relato una vez. Ahora toca que lo compre el mercado.`,
      );
    } else {
      angulos.push(
        `Última ronda hace ${Math.round(days / 30)} meses (${roundTxt || 'sin detalle'}): si preparan la siguiente, la marca es parte del deck.`,
      );
    }
  }

  // Programa FLOC* recomendado por momento
  const stage = (company.funding_stage ?? fundingSignal?.detail?.round ?? '').toString().toLowerCase();
  const small = company.size === '1-10';
  let programa: Pitch['programa'] = null;
  const byName = (n: string) => offer.programs.find((p) => p.name === n)!;

  if (/launch|pre-seed/.test(stage) || (!stage && small)) {
    const p = byName('Go Sprint');
    programa = { ...p, why: 'Está lanzando con equipo pequeño: marca y landing listas en 4 semanas, sin frenar el producto.' };
  } else if (/seed|series/.test(stage) || fundingSignal) {
    const p = byName('Go To Market');
    programa = { ...p, why: 'Con ronda en juego, la marca es parte del caso de inversión: construcción completa en 6-8 semanas.' };
  } else if (scan?.score != null && Number(scan.score) >= 60) {
    const p = byName('Go Beyond');
    programa = { ...p, why: 'La base existe: encaja un partnership continuo para evolucionarla, no una reconstrucción.' };
  } else if (scan?.score != null) {
    const p = byName('Go Sprint');
    programa = { ...p, why: 'El gap es amplio y el equipo pequeño: mejor empezar por una base sólida y rápida.' };
  }

  return { lectura: lectura.slice(0, 4), angulos: angulos.slice(0, 4), programa };
}
