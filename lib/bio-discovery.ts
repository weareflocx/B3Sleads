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

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 320);
}

// Una bio útil describe la empresa; no vale un lema de tres palabras ni un
// menú de navegación.
function usable(text: string): boolean {
  const t = text.trim();
  if (t.length < 40 || t.length > 600) return false;
  if (t.split(/\s+/).length < 7) return false;
  return !/^(inicio|home|men[úu]|cookies|aceptar)\b/i.test(t);
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
  const meta = await fetchSiteDescription(input.domain).catch(() => null);
  if (meta && usable(meta)) {
    out.push({
      text: tidy(meta),
      sourceLabel: `${input.domain} · meta descripción`,
      sourceUrl: `https://${input.domain}`,
    });
  }

  // 2. Lo que detectó el Scanner: propuesta de valor y propósito describen
  //    qué hace la marca, en español y ya verificado contra sus superficies.
  const report = storedScanReport(input.scanResultRaw ?? null);
  for (const key of ['Propuesta de valor', 'Propósito', 'Misión']) {
    const dim = report?.dimensions.find((d) => d.name === key);
    const text = dim?.quote;
    if (text && usable(text)) {
      out.push({
        text: tidy(text),
        sourceLabel: `B3S Scanner · ${key.toLowerCase()}`,
        sourceUrl: dim?.quoteUrl ?? '',
      });
    }
  }

  // 3. Búsqueda web, si hay clave
  const hits = await searchWeb(`${input.name} ${input.domain} qué es la empresa`).catch(() => []);
  for (const hit of hits.slice(0, 4)) {
    const text = hit.snippet.replace(/^[^.]*\.\s*/, '');
    if (usable(text)) {
      out.push({ text: tidy(text), sourceLabel: hit.host, sourceUrl: hit.url });
    }
  }

  return dedupe(out);
}
