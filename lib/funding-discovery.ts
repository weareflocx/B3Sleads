// Buscar la ronda de UNA empresa concreta. Es el camino inverso al pipeline
// nocturno: aquel descubre empresas desde noticias, este parte de una empresa
// que Sergio ya tiene en el radar y busca su financiación.
//
// Tres fuentes, todas sin coste:
//  1. Búsqueda web (DuckDuckGo). Es la que da cobertura real: la prensa
//     económica y los agregadores tienen los datos de ronda.
//  2. Los feeds de venture que ya usa el pipeline, para lo más reciente.
//  3. El informe del B3S Scanner, que ya está en la BD y a veces la menciona.
//
// Probé también la web de la propia marca y la descarté: hoy casi todas son
// SPAs cuyo HTML inicial es el menú de navegación, y devuelven 200 con la
// home para /prensa, /news y cualquier ruta inventada. Ocho peticiones para
// extraer texto de menú.
//
// La extracción es determinista (regex). No inventa: cada propuesta viene con
// la frase textual de la que sale y su enlace, para que se pueda verificar de
// un vistazo antes de aprobarla. Nada se guarda solo.
import { fetchFundingItems, looksLikeFunding } from './rss';
import type { AmountUnit } from './funding';

export interface RoundProposal {
  round: string | null;
  amountValue: string | null;
  amountUnit: AmountUnit;
  investors: string[];
  currency: 'EUR' | 'USD' | null;
  date: string | null;
  sourceUrl: string;
  sourceLabel: string;
  quote: string;
  confidence: 'alta' | 'media' | 'baja';
}

const ROUND_PATTERNS: [RegExp, string][] = [
  [/\bpre[-\s]?seed\b/i, 'pre-seed'],
  [/\bseed\b|\bsemilla\b/i, 'seed'],
  [/\bseries?\s*a\b|\bserie\s*a\b/i, 'series-a'],
  [/\bseries?\s*[bcd]\b|\bserie\s*[bcd]\b/i, 'series-b+'],
];

// Importe: acepta "€2.4M", "2,4 millones", "$3 million", "750K".
const AMOUNT_RE =
  /(?:([€$])\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(millones?|million|mill\.|m\b|k\b|mil\b)\s*(?:de\s*)?(euros?|€|dollars?|\$|usd)?/i;

const SIGNAL_RE =
  /(ronda|levant[óoa]|capta|financiaci[óo]n|inversi[óo]n|funding|raise[sd]?|secured|closes?|closed|investment round|led by|liderada|participaci[óo]n de|investors?\s+includ|inversores?\s+(?:incluyen|son))/i;

const LEAD_RE =
  /(?:liderad[ao]\s+por|led\s+by|lidera\s+la\s+ronda)\s+([A-ZÁÉÍÓÚÑ][^.;()]{2,80})/;
const PARTICIPANTS_RE =
  /(?:con\s+la\s+participaci[óo]n\s+de|participaci[óo]n\s+de|junto\s+a|with\s+participation\s+from|joined\s+by|backed\s+by|investors?\s+include[sd]?|inversores?\s+(?:incluyen|son)|inversores?\s*:|investors?\s*:|de\s+la\s+mano\s+de)\s+([A-ZÁÉÍÓÚÑ][^.;()]{2,120})/i;

// Palabras que delatan que lo capturado no es un fondo sino prosa.
const NOT_AN_INVESTOR =
  /^(la|el|los|las|un|una|su|sus|este|esta|que|para|con|and|the|its|their)\b|^\d+\s+(others?|m[áa]s)$|^otros?$/i;

function splitInvestors(raw: string): string[] {
  return raw
    .split(/,| y | e |&| and /i)
    .map((s) =>
      s
        .replace(/\s+/g, ' ')
        .replace(/^(?:los?|las?|el|la)\s+/i, '')
        .trim()
        .replace(/[.;:]+$/, ''),
    )
    .filter((s) => s.length >= 2 && s.length <= 60 && !NOT_AN_INVESTOR.test(s))
    // Un fondo empieza por mayúscula. Evita arrastrar el resto de la frase.
    .filter((s) => /^[A-ZÁÉÍÓÚÑ0-9]/.test(s))
    .slice(0, 6);
}

function normalizeAmount(
  m: RegExpMatchArray,
): { value: string; unit: AmountUnit; currency: 'EUR' | 'USD' | null } | null {
  const num = m[2].replace(',', '.');
  const scale = m[3].toLowerCase();
  const unit: AmountUnit = /^(k|mil)$/.test(scale) ? 'K' : 'M';
  if (!Number.isFinite(parseFloat(num))) return null;
  // El símbolo puede ir delante ("$20M") o el nombre detrás ("20 millones de
  // euros"). Distinguirlo importa: el formulario guarda euros y meter dólares
  // ahí sería un dato falso.
  const pre = (m[1] ?? '').trim();
  const post = (m[4] ?? '').toLowerCase();
  const currency: 'EUR' | 'USD' | null =
    pre === '€' || /^euro/.test(post) || post === '€'
      ? 'EUR'
      : pre === '$' || /^(dollar|usd)/.test(post) || post === '$'
        ? 'USD'
        : null;
  return { value: num, unit, currency };
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 30 && s.length < 600);
}

// Extrae propuestas de un texto plano. Una por frase que huela a ronda.
function extractFromText(
  text: string,
  sourceUrl: string,
  sourceLabel: string,
  date: string | null,
  brandHints: string[],
): RoundProposal[] {
  const out: RoundProposal[] = [];
  for (const s of sentences(text)) {
    if (!SIGNAL_RE.test(s)) continue;
    // La frase tiene que hablar de ESTA marca, no de otra del mismo artículo.
    if (brandHints.length && !brandHints.some((h) => s.toLowerCase().includes(h))) continue;

    const amountMatch = s.match(AMOUNT_RE);
    const amount = amountMatch ? normalizeAmount(amountMatch) : null;
    const round = ROUND_PATTERNS.find(([re]) => re.test(s))?.[1] ?? null;

    const lead = s.match(LEAD_RE)?.[1] ?? '';
    const others = s.match(PARTICIPANTS_RE)?.[1] ?? '';
    const investors = [...new Set([...splitInvestors(lead), ...splitInvestors(others)])];

    if (!round && !amount && !investors.length) continue;

    const score = (round ? 1 : 0) + (amount ? 1 : 0) + (investors.length ? 1 : 0);
    out.push({
      round,
      amountValue: amount?.value ?? null,
      amountUnit: amount?.unit ?? 'M',
      investors,
      currency: amount?.currency ?? null,
      date,
      sourceUrl,
      sourceLabel,
      quote: s.trim().slice(0, 320),
      confidence: score >= 3 ? 'alta' : score === 2 ? 'media' : 'baja',
    });
  }
  return out;
}

// Búsqueda web mediante un proveedor con clave (Brave Search: 2.000
// consultas/mes gratis). Es opcional: sin SEARCH_API_KEY simplemente no se
// usa esta fuente y las demás siguen funcionando.
//
// Probé antes a raspar el HTML de DuckDuckGo sin clave y lo descarté: tras
// unas pocas consultas devuelve 202 con marca de "anomaly". Desde una IP
// compartida como la de Netlify el bloqueo sería inmediato y permanente, así
// que sería una función que hoy funciona y mañana no.
interface SearchHit {
  snippet: string;
  url: string;
  host: string;
}

function hostOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

// Brave Search API. Clave opcional en SEARCH_API_KEY; su plan gratuito cubre
// de sobra el uso a mano (2.000 consultas/mes).
async function search(query: string, timeoutMs = 6000): Promise<SearchHit[]> {
  const key = process.env.SEARCH_API_KEY?.trim();
  if (!key) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
      { signal: ctrl.signal, headers: { Accept: 'application/json', 'X-Subscription-Token': key } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      web?: { results?: { title?: string; description?: string; url?: string }[] };
    };
    return (json.web?.results ?? []).map((r) => ({
      snippet: `${r.title ?? ''}. ${(r.description ?? '').replace(/<[^>]+>/g, '')}`.trim(),
      url: r.url ?? '',
      host: hostOf(r.url ?? '', 'búsqueda web'),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export function searchConfigured(): boolean {
  return Boolean(process.env.SEARCH_API_KEY?.trim());
}

async function fromWeb(name: string, domain: string, hints: string[]): Promise<RoundProposal[]> {
  if (!searchConfigured()) return [];
  const base = domain.split('.')[0];
  const queries = [
    `${name} ronda de financiación millones inversores`,
    `${base} funding round raised investors`,
  ];
  const rounds = await Promise.all(queries.map((q) => search(q)));
  const out: RoundProposal[] = [];
  for (const hits of rounds) {
    for (const hit of hits) {
      if (!hit.snippet) continue;
      const text = /[.!?]$/.test(hit.snippet) ? hit.snippet : `${hit.snippet}.`;
      out.push(...extractFromText(text, hit.url, hit.host, null, hints));
    }
  }
  return out;
}

// La vía que funciona hoy sin ninguna clave: Sergio busca donde quiera
// (Google, su Claude, una nota de prensa) y pega el texto. La app hace lo
// tedioso: leerlo y sacar ronda, importe e inversores en campos.
export function extractFromPasted(text: string, brand?: string): RoundProposal[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 20) return [];
  const withStop = /[.!?]$/.test(clean) ? clean : `${clean}.`;
  let found = extractFromText(withStop, '', 'texto pegado', null, []);
  if (!found.length) {
    // Un titular suelto puede no partirse en frases; se reintenta con sujeto.
    found = extractFromText(`${brand ?? 'La empresa'} ${withStop}`, '', 'texto pegado', null, []);
  }
  if (!found.length) return [];

  // Todo el texto habla de la misma noticia, así que los inversores citados
  // en una frase valen para la ronda citada en otra: es lo normal en una nota
  // de prensa ("levantó 6M". "Investors include X, Y").
  const todos = [...new Set(found.flatMap((p) => p.investors))];
  const conDato = found.filter((p) => p.round || p.amountValue);
  const base = conDato.length ? conDato : found;

  const rank = { alta: 3, media: 2, baja: 1 } as const;
  return dedupe(
    base.map((p) => {
      const investors = [...new Set([...p.investors, ...todos])];
      const score = (p.round ? 1 : 0) + (p.amountValue ? 1 : 0) + (investors.length ? 1 : 0);
      return {
        ...p,
        investors,
        confidence: (score >= 3 ? 'alta' : score === 2 ? 'media' : 'baja') as RoundProposal['confidence'],
      };
    }),
  ).sort((a, b) => rank[b.confidence] - rank[a.confidence]);
}

async function fromFeeds(brandHints: string[]): Promise<RoundProposal[]> {
  const items = await fetchFundingItems().catch(() => []);
  const out: RoundProposal[] = [];
  for (const item of items) {
    if (!looksLikeFunding(item)) continue;
    const hay = `${item.title} ${item.content}`.toLowerCase();
    if (!brandHints.some((h) => hay.includes(h))) continue;
    const host = (() => {
      try {
        return new URL(item.link).hostname.replace(/^www\./, '');
      } catch {
        return 'prensa';
      }
    })();
    out.push(
      ...extractFromText(`${item.title}. ${item.content}`, item.link, host, item.pubDate, brandHints),
    );
  }
  return out;
}

function fromScan(markdown: string | null, brandHints: string[]): RoundProposal[] {
  if (!markdown) return [];
  return extractFromText(markdown, '', 'informe B3S', null, brandHints);
}

// Dedup: la misma ronda contada por dos fuentes es una sola propuesta. Gana
// la de mayor confianza y se conserva el mejor dato de cada campo.
function dedupe(list: RoundProposal[]): RoundProposal[] {
  const rank = { alta: 3, media: 2, baja: 1 } as const;
  const byKey = new Map<string, RoundProposal>();
  for (const p of list) {
    const key = `${p.round ?? '?'}|${p.amountValue ?? '?'}${p.amountUnit}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, p);
      continue;
    }
    byKey.set(key, {
      ...(rank[p.confidence] > rank[prev.confidence] ? p : prev),
      investors: [...new Set([...prev.investors, ...p.investors])],
      date: prev.date ?? p.date,
    });
  }
  return [...byKey.values()].sort((a, b) => rank[b.confidence] - rank[a.confidence]).slice(0, 6);
}

export async function discoverRounds(input: {
  domain: string;
  name: string;
  scanMarkdown?: string | null;
}): Promise<RoundProposal[]> {
  const base = input.domain.split('.')[0].toLowerCase();
  const hints = [...new Set([input.domain.toLowerCase(), base, input.name.toLowerCase()])].filter(
    (h) => h.length >= 3,
  );

  const [web, feeds] = await Promise.all([
    fromWeb(input.name, input.domain, hints).catch(() => []),
    fromFeeds(hints).catch(() => []),
  ]);
  return dedupe([...web, ...feeds, ...fromScan(input.scanMarkdown ?? null, hints)]);
}
