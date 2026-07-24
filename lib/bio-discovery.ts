// Propuestas de bio para una marca, con el mismo patrón que las rondas: se
// buscan candidatas, se enseñan con su fuente, y aprueba una persona. Nada
// se guarda solo.
//
// Tres fuentes, de más fiable a menos:
//  1. La meta descripción de su web. Suele ser la misma frase que ponen en
//     LinkedIn, que no se puede leer programáticamente (spec §9).
//  2. Lo que el B3S Scanner detectó de su propuesta de valor o propósito:
//     está en español y describe qué hace, no cómo se vende.
//  3. Búsqueda web (si hay SEARCH_API_KEY): lo que dicen los directorios.
import { fetchSiteDescription } from './site-meta';
import { searchWeb } from './funding-discovery';
import { storedScanReport } from './scan-report';

export interface BioProposal {
  text: string;
  sourceLabel: string;
  sourceUrl: string;
}

// Una bio a medias no sirve de nada. Los buscadores devuelven recortes que
// empiezan y acaban en mitad de una frase ("… impulsadas por"), así que se
// arma con FRASES COMPLETAS: se tira el arranque cortado, se acumulan
// oraciones enteras hasta el tope y se descarta la última si quedó a medias.
// Si no hay ni una frase completa, la candidata no se ofrece.
// Conectores con los que una frase NO puede acabar: si termina así, es un
// recorte del buscador ("… impulsadas por"), no una frase entera.
const DANGLING =
  /\b(por|de|del|al|a|en|con|para|y|e|o|u|que|el|la|los|las|un|una|unos|unas|su|sus|mediante|sobre|entre|desde|hasta|como|más|the|of|to|and|or|for|with|by|in|on)$/i;

// Los buscadores y las webs vienen en markdown y con ruido de captura: se
// limpian imágenes, enlaces, cabeceras y emojis sueltos antes de nada.
function stripMd(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/([.!?])([A-ZÁÉÍÓÚÑ¿¡0-9])/g, '$1 $2')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u2190-\u21FF]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function completeSentences(raw: string, max = 420): string | null {
  let t = stripMd(raw);
  // Recortes del buscador al principio: puntos suspensivos o minúscula.
  t = t.replace(/^[…·|\-\s]+/, '').replace(/^\.{2,}\s*/, '');
  if (/^[a-záéíóúñ]/.test(t)) {
    const start = t.search(/[.!?]\s+[A-ZÁÉÍÓÚÑ¿¡]/);
    t = start >= 0 ? t.slice(start + 1).trim() : t;
  }

  const sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!sentences?.length) return null;

  let out = '';
  for (const sentence of sentences) {
    const next = (out + sentence).trim();
    if (out && next.length > max) break;
    out = next;
    if (out.length > max) break; // la primera puede pasarse; se acepta entera
  }
  out = out.trim();
  return out.length >= 40 ? out : null;
}

// Una bio útil describe la empresa; no vale un lema de tres palabras ni un
// menú de navegación.
function usable(text: string): boolean {
  const t = text.trim();
  if (t.length < 40 || t.length > 600) return false;
  if (t.split(/\s+/).length < 7) return false;
  return !/^(inicio|home|men[úu]|cookies|aceptar)\b/i.test(t);
}

// Normaliza una candidata a frases completas; null si no vale.
function bio(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = completeSentences(raw);
  if (clean && usable(clean)) return clean;
  // La meta descripción y el Scanner a veces no llevan punto final pero son
  // una frase entera: se aceptan SOLO si no acaban en un conector colgante
  // (eso delataría un recorte a medias).
  const flat = stripMd(raw).replace(/[…·]+$/, '').trim();
  const lastWord = flat.replace(/[.!?]+$/, '').trim();
  if (DANGLING.test(lastWord)) return null;
  return flat.length >= 40 && flat.length <= 420 && usable(flat) ? flat : null;
}

function dedupe(list: BioProposal[]): BioProposal[] {
  const seen = new Set<string>();
  const out: BioProposal[] = [];
  for (const p of list) {
    const key = p.text.toLowerCase().slice(0, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 5);
}

export async function discoverBio(input: {
  domain: string;
  name: string;
  scanResultRaw?: Record<string, unknown> | null;
}): Promise<BioProposal[]> {
  const out: BioProposal[] = [];

  // 1. Su propia web
  const meta = bio(await fetchSiteDescription(input.domain).catch(() => null));
  if (meta) {
    out.push({
      text: meta,
      sourceLabel: `${input.domain} · meta descripción`,
      sourceUrl: `https://${input.domain}`,
    });
  }

  // 2. Lo que detectó el Scanner: propuesta de valor y propósito describen
  //    qué hace la marca, en español y ya verificado contra sus superficies.
  const report = storedScanReport(input.scanResultRaw ?? null);
  for (const key of ['Propuesta de valor', 'Propósito', 'Misión']) {
    const dim = report?.dimensions.find((d) => d.name === key);
    const text = bio(dim?.quote);
    if (text) {
      out.push({
        text,
        sourceLabel: `B3S Scanner · ${key.toLowerCase()}`,
        sourceUrl: dim?.quoteUrl ?? '',
      });
    }
  }

  // 3. Búsqueda web, si hay clave
  const hits = await searchWeb(`${input.name} ${input.domain} qué es la empresa`).catch(() => []);
  for (const hit of hits.slice(0, 5)) {
    const text = bio(hit.snippet);
    if (text) out.push({ text, sourceLabel: hit.host, sourceUrl: hit.url });
  }

  return dedupe(out);
}
