// La mirada hacia fuera de la home: el ecosistema y los números de la
// plataforma. El briefing es el trabajo DE HOY del usuario; esto es el
// contexto general de B3S, y por eso vive separado.
import { unstable_cache } from 'next/cache';
import type { BriefingLead } from './types';
import { companyLabel } from './types';
import { timingScore, occurredAt } from './radar';
import { searchWeb, searchConfigured } from './funding-discovery';

// ---------- Titulares del ecosistema ----------
// Búsqueda web cacheada POR DÍA: la clave lleva la fecha, así que la primera
// visita de cada mañana trae titulares frescos y el resto del día se sirve
// de caché sin gastar cuota.
export interface Titular {
  headline: string;
  detail: string | null;
  host: string;
  url: string;
  published: string | null;
}

function madridToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
}

async function fetchTitulares(): Promise<Titular[]> {
  if (!searchConfigured()) return [];
  // Modo noticias con ventana de 7 dias, no una consulta anclada al mes. La
  // version anterior preguntaba "…startups España agosto de 2026" y durante
  // 31 dias pedia literalmente lo mismo: la cache se renovaba cada mañana y
  // el buscador devolvia los mismos articulos, asi que la home parecia
  // congelada sin estarlo. El indice de noticias ademas trae la fecha, que es
  // lo que permite ordenar por frescura de verdad.
  const hits = await searchWeb('rondas de financiación e inversión en startups españolas', 8000, {
    dias: 7,
  });
  // Ranking pro-noticia: un titular con cifras o verbos de ronda vale más que
  // una guía atemporal o un directorio. No se descarta nada en seco (la lista
  // no puede quedarse vacía por un filtro), solo se reordena.
  const NEWS = /millones|M€|récord|levanta|cierra|ronda|alcanza|invierte|capta|\d{4}/i;
  const EVERGREEN = /revista|guía|qué es|tipos de|mejores|foros|directorio|cómo/i;
  const cuando = (h: (typeof hits)[number]) => (h.published ? Date.parse(h.published) || 0 : 0);
  const ranked = [...hits].sort((a, b) => {
    const score = (h: typeof a) =>
      (NEWS.test(h.snippet) ? 1 : 0) - (EVERGREEN.test(h.snippet) ? 1 : 0);
    // A igualdad de pinta de noticia, manda la más reciente.
    return score(b) - score(a) || cuando(b) - cuando(a);
  });
  const seen = new Set<string>();
  const out: Titular[] = [];
  for (const hit of ranked) {
    if (!hit.snippet || !hit.url || seen.has(hit.host)) continue;
    seen.add(hit.host);
    // El snippet llega como "título. descripción": se parte por la primera
    // frase para tener titular y detalle.
    const dot = hit.snippet.indexOf('. ');
    const headline = (dot > 10 ? hit.snippet.slice(0, dot) : hit.snippet).trim();
    const detail = dot > 10 ? hit.snippet.slice(dot + 2).trim() : null;
    if (headline.length < 15) continue;
    out.push({
      headline: headline.length > 120 ? headline.slice(0, 119).trimEnd() + '…' : headline,
      detail: detail ? (detail.length > 160 ? detail.slice(0, 159).trimEnd() + '…' : detail) : null,
      host: hit.host,
      url: hit.url,
      published: hit.published ?? null,
    });
    if (out.length >= 5) break;
  }
  return out;
}

export async function titularesDelDia(): Promise<Titular[]> {
  const today = madridToday();
  return unstable_cache(fetchTitulares, ['ecosystem-news', 'v4', today], {
    revalidate: false,
  })();
}

// ---------- Rondas registradas por el radar ----------
// Lo que el propio sistema ha visto en los últimos días, en todas las marcas.
// Es la parte de "noticias" que no depende de ningún proveedor: la produce el
// pipeline y los altas manuales.
export interface RondaReciente {
  company: string;
  domain: string;
  text: string;
  at: string; // cuándo ocurrió (o se detectó, como respaldo)
}

export function rondasRecientes(leads: BriefingLead[], days = 14): RondaReciente[] {
  const now = Date.now();
  const seen = new Set<string>();
  const out: RondaReciente[] = [];
  for (const bl of leads) {
    if (!bl.company || seen.has(bl.company.domain)) continue;
    for (const s of bl.signals) {
      // Las cerradas y las que están levantando AHORA. Estas últimas son las
      // más accionables del ecosistema, así que no pueden faltar.
      const raising = s.type === 'levantando_ronda';
      if (s.type !== 'funding_round' && !raising) continue;
      const when = occurredAt(s) ?? s.detected_at;
      if ((now - new Date(when).getTime()) / 86_400_000 > days) continue;
      const d = s.detail as Record<string, unknown> | null;
      const parts = raising
        ? ['En ronda', d?.round, d?.target_amount ? `buscan ${d.target_amount}` : null]
            .filter(Boolean)
            .join(' · ')
        : [d?.round, d?.amount, (d?.investors as string[] | undefined)?.join(', ')]
            .filter(Boolean)
            .join(' · ');
      seen.add(bl.company.domain);
      out.push({
        company: companyLabel(bl.company.name, bl.company.domain),
        domain: bl.company.domain,
        text: parts || 'Ronda de financiación',
        at: when,
      });
      break;
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------- B3S en números ----------
// Números de PLATAFORMA, no del usuario: cuánto radar hay, qué calidad de
// marca ve el Scanner y cuánta señal viva sostiene la cola.
export interface PlatformStats {
  marcas: number;
  escaneadas: number;
  scoreMedio: number | null;
  conSenalViva: number;
  rondas90d: number;
  // Distribución por bandas de score (las mismas de la ficha).
  bandas: { label: string; count: number }[];
}

const BANDAS: { label: string; test: (s: number) => boolean }[] = [
  { label: 'por construir', test: (s) => s < 40 },
  { label: 'funcional', test: (s) => s >= 40 && s < 60 },
  { label: 'sólida', test: (s) => s >= 60 && s < 75 },
  { label: 'trabajada', test: (s) => s >= 75 },
];

export function platformStats(startups: BriefingLead[]): PlatformStats {
  const scores = startups
    .filter((bl) => bl.scan?.status === 'ready' && bl.scan.score != null)
    .map((bl) => Number(bl.scan!.score));
  const now = Date.now();
  const rondas90d = startups.filter((bl) =>
    bl.signals.some(
      (s) =>
        s.type === 'funding_round' &&
        (now - new Date(occurredAt(s) ?? s.detected_at).getTime()) / 86_400_000 <= 90,
    ),
  ).length;
  return {
    marcas: startups.length,
    escaneadas: scores.length,
    scoreMedio: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    conSenalViva: startups.filter((bl) => timingScore(bl.signals).best != null).length,
    rondas90d,
    bandas: BANDAS.map((b) => ({ label: b.label, count: scores.filter(b.test).length })),
  };
}
