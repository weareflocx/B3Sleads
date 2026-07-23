// Buscar la ronda de UNA empresa concreta. Es el camino inverso al pipeline
// nocturno: aquel descubre empresas desde noticias, este parte de una empresa
// que Sergio ya tiene en el radar y busca su financiación.
//
// Fuentes, por orden de utilidad real:
//  1. Un enlace o texto pegado por Sergio (extractFromInput). Si es un
//     enlace, se descarga el artículo y se lee su contenido; el enlace en sí
//     NUNCA se parsea como texto: un slug tipo "ronda-de-e28m" daría 28M
//     donde el artículo dice 2,8M.
//  2. Búsqueda web con clave (Brave, opcional vía SEARCH_API_KEY).
//  3. Los feeds de venture que ya usa el pipeline, para lo más reciente.
//  4. El informe del B3S Scanner, que ya está en la BD.
//
// Descartado con datos, no por intuición:
//  - La web de la propia marca: SPAs que devuelven la home con HTTP 200 para
//    /prensa y cualquier ruta; el texto extraíble es el menú.
//  - Raspar DuckDuckGo sin clave: a las pocas consultas responde 202 con
//    marca "anomaly". Desde la IP compartida de Netlify sería bloqueo fijo.
//
// La extracción es determinista (regex). No inventa: cada propuesta viene con
// la frase textual de la que sale y su enlace, para verificarla de un vistazo
// antes de aprobar. Nada se guarda solo.
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

// Importe: "€2,8M", "2.4M", "6 millones de euros", "$3 million", "750K".
const AMOUNT_RE =
  /(?:([€$])\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(millones?|million|mill\.|m\b|k\b|mil\b)\s*(?:de\s*)?(euros?|€|dollars?|\$|usd)?/i;

const SIGNAL_RE =
  /(ronda|levant[óoa]|capta|cierra|financiaci[óo]n|inversi[óo]n|funding|raise[sd]?|secure[sd]?\b|closes?|closed|investment round|led by|liderada|particip(?:aci[óo]n de|an)|entran|investors?\s+includ|inversores?\s+(?:incluyen|son))/i;

const LEAD_RE =
  /(?:liderad[ao]\s+por|led\s+by|lidera\s+la\s+ronda)\s+([A-ZÁÉÍÓÚÑ][^.;()]{2,80})/;
const PARTICIPANTS_RE =
  /(?:con\s+la\s+participaci[óo]n\s+de|participaci[óo]n\s+de|participan|entran|junto\s+a|with\s+participation\s+from|joined\s+by|backed\s+by|investors?\s+include[sd]?|inversores?\s+(?:incluyen|son)|inversores?\s*:|investors?\s*:|de\s+la\s+mano\s+de)\s+([A-ZÁÉÍÓÚÑ][^.;()]{2,120})/i;

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
    // "business angels como Pedro Duque" es una descripción, no un fondo; y
    // ningún fondo se llama con más de cuatro palabras: si hay más, es que
    // la captura arrastró prosa (típico en titulares EN MAYÚSCULAS sin punto).
    .filter((s) => !/\bbusiness\s+angels?\b|\bcomo\b|\bsuch\s+as\b/i.test(s))
    .filter((s) => s.split(/\s+/).length <= 4)
    .slice(0, 6);
}


// "Expansion Ventures" y "EXPANSION VENTURES" son el mismo fondo. Se queda
// la grafía de título, no la del titular a gritos.
function uniqueInvestors(list: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of list) {
    const key = name.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || (prev === prev.toUpperCase() && name !== name.toUpperCase())) {
      byKey.set(key, name);
    }
  }
  return [...byKey.values()];
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

function ensureStop(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
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
    const investors = uniqueInvestors([...splitInvestors(lead), ...splitInvestors(others)]);

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

// Dedup: la misma ronda contada por dos fuentes es una sola propuesta. Gana
// la de mayor confianza y se conserva el mejor dato de cada campo.
const RANK = { alta: 3, media: 2, baja: 1 } as const;

function dedupe(list: RoundProposal[]): RoundProposal[] {
  const byKey = new Map<string, RoundProposal>();
  for (const p of list) {
    const key = `${p.round ?? '?'}|${p.amountValue ?? '?'}${p.amountUnit}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, p);
      continue;
    }
    byKey.set(key, {
      ...(RANK[p.confidence] > RANK[prev.confidence] ? p : prev),
      investors: uniqueInvestors([...prev.investors, ...p.investors]),
      date: prev.date ?? p.date,
    });
  }
  // Una propuesta que solo repite parte de otra (mismo importe sin ronda,
  // misma ronda sin importe) no aporta: se queda la más completa. Dos rondas
  // con importes distintos sí conviven: son rondas diferentes.
  const items = [...byKey.values()];
  const completas = items.filter(
    (p) =>
      !items.some(
        (q) =>
          q !== p &&
          RANK[q.confidence] >= RANK[p.confidence] &&
          (p.amountValue == null || q.amountValue === p.amountValue) &&
          (p.round == null || q.round === p.round),
      ),
  );
  return completas.sort((a, b) => RANK[b.confidence] - RANK[a.confidence]).slice(0, 6);
}

// Cuando todas las frases hablan de la MISMA noticia, los inversores citados
// en una valen para la ronda citada en otra: es lo normal en una nota de
// prensa ("levantó 6M". "Investors include X, Y"). Solo para texto de un
// único artículo; entre fuentes distintas sería mezclar rondas ajenas.
function consolidate(found: RoundProposal[]): RoundProposal[] {
  if (!found.length) return [];
  const todos = uniqueInvestors(found.flatMap((p) => p.investors));
  const conDato = found.filter((p) => p.round || p.amountValue);
  const base = conDato.length ? conDato : found;
  return dedupe(
    base.map((p) => {
      const investors = uniqueInvestors([...p.investors, ...todos]);
      const score = (p.round ? 1 : 0) + (p.amountValue ? 1 : 0) + (investors.length ? 1 : 0);
      return {
        ...p,
        investors,
        confidence: (score >= 3
          ? 'alta'
          : score === 2
            ? 'media'
            : 'baja') as RoundProposal['confidence'],
      };
    }),
  );
}

function hostOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

// ---------- Leer un artículo por su URL ----------

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function decodeEntities(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return ' ';
      }
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Cierres de bloque → punto: un <h1> no acaba en punto y sin esto el
      // titular se pegaría a la frase siguiente.
      .replace(/<\/(?:p|div|h\d|li|td|figcaption)>|<br\s*\/?>/gi, '. ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}

async function fetchArticle(url: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'es,en;q=0.8' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!/html|xml|text/.test(type)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Cuando el medio bloquea la descarga directa (WAF que responde 403 a todo
// lo que no sea un navegador real: webcapitalriesgo, eu-startups…), se pasa
// por r.jina.ai, un lector público que devuelve el artículo como texto
// plano. Sin clave. Si algún día también falla, el mensaje de error ya
// ofrece la salida: pegar el texto de la noticia.
async function fetchViaReader(
  url: string,
  timeoutMs = 15_000,
): Promise<{ title: string; text: string; date: string | null } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Ojo: el lector rechaza el UA de navegador (403); un navegador real no
    // tiene por qué llamarle. Identidad honesta y en paz.
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'B3SLeads/1.0', Accept: 'text/plain' },
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (raw.length < 120) return null;

    const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const date = raw.match(/^Published Time:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;
    const content = raw.split(/^Markdown Content:\s*$/m)[1] ?? raw;
    // Markdown → texto: [Arkadia Space](https://…) queda como "Arkadia Space".
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_#`>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { title, text, date };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Descarga el artículo y lee su contenido. El titular y las metas suelen
// traer la ronda completa; el cuerpo solo se usa de respaldo y acotado, para
// no arrastrar el bloque de "noticias relacionadas" (rondas de OTRAS marcas).
export async function extractFromUrl(url: string): Promise<RoundProposal[]> {
  const host = hostOf(url, 'artículo');

  const html = await fetchArticle(url);
  if (html) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
    const pubDate =
      html.match(/article:published_time["'][^>]*content=["'](\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
    const metas = [...html.matchAll(/<meta\s[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) =>
        /(?:name|property)=["'](?:description|og:description|og:title|twitter:description)["']/i.test(
          tag,
        ),
      )
      .map((tag) => tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '')
      .filter(Boolean);

    const headText = htmlToText([title, h1, ...metas].filter(Boolean).join('. '));
    const head = consolidate(extractFromText(ensureStop(headText), url, host, pubDate, []));
    if (head.length) return head;

    const articleStart = html.search(/<(article|main)\b/i);
    const body = htmlToText(html.slice(articleStart >= 0 ? articleStart : 0)).slice(0, 9000);
    const fromBody = consolidate(extractFromText(ensureStop(body), url, host, pubDate, []));
    if (fromBody.length) return fromBody;
  }

  // Descarga directa bloqueada (o sin datos legibles): lector de respaldo.
  const reader = await fetchViaReader(url);
  if (!reader) return [];
  const combined = `${reader.title}. ${reader.text}`.slice(0, 12_000);
  return consolidate(extractFromText(ensureStop(combined), url, host, reader.date, []));
}

// ---------- Texto pegado ----------

export function extractFromPasted(text: string, brand?: string): RoundProposal[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 20) return [];
  let found = extractFromText(ensureStop(clean), '', 'texto pegado', null, []);
  if (!found.length) {
    // Un titular suelto puede no partirse en frases; se reintenta con sujeto.
    found = extractFromText(`${brand ?? 'La empresa'} ${ensureStop(clean)}`, '', 'texto pegado', null, []);
  }
  return consolidate(found);
}

// Punto de entrada del campo de pegar: acepta un enlace, un texto, o ambos
// (titular + enlace). El enlace se descarga; jamás se parsea como texto.
export async function extractFromInput(
  raw: string,
): Promise<{ proposals: RoundProposal[]; note: string | null }> {
  const trimmed = raw.trim();
  const url = trimmed.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? null;
  const rest = (url ? trimmed.replace(url, ' ') : trimmed).replace(/\s+/g, ' ').trim();

  const fromText = rest.length >= 20 ? extractFromPasted(rest) : [];
  if (!url) return { proposals: fromText, note: null };

  const fromArticle = await extractFromUrl(url);
  if (!fromArticle.length && !fromText.length) {
    return {
      proposals: [],
      note: 'No pude leer ese artículo (la web no responde o bloquea robots). Pega el titular o el párrafo de la noticia y lo extraigo igual.',
    };
  }
  return { proposals: dedupe([...fromArticle, ...fromText]), note: null };
}

// ---------- Búsqueda web (opcional, con clave) ----------

interface SearchHit {
  snippet: string;
  url: string;
  host: string;
}

// Búsqueda web con clave opcional en SEARCH_API_KEY. El proveedor se
// deduce de la propia clave, así que cambiar de uno a otro es solo cambiar
// la variable:
//  - "tvly-…" → Tavily (1.000 consultas/mes gratis, SIN tarjeta)
//  - cualquier otra → Brave Search (5$ de crédito/mes = 1.000 consultas,
//    pide tarjeta y cobra si se supera)
async function braveSearch(query: string, key: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
    { signal, headers: { Accept: 'application/json', 'X-Subscription-Token': key } },
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
}

async function tavilySearch(query: string, key: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 8 }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: { title?: string; content?: string; url?: string }[];
  };
  return (json.results ?? []).map((r) => ({
    snippet: `${r.title ?? ''}. ${r.content ?? ''}`.trim(),
    url: r.url ?? '',
    host: hostOf(r.url ?? '', 'búsqueda web'),
  }));
}

async function search(query: string, timeoutMs = 8000): Promise<SearchHit[]> {
  const key = process.env.SEARCH_API_KEY?.trim();
  if (!key) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return key.startsWith('tvly-')
      ? await tavilySearch(query, key, ctrl.signal)
      : await braveSearch(query, key, ctrl.signal);
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
  // En serie, no en paralelo: el plan gratuito de Brave admite 1 consulta
  // por segundo y dos a la vez harían rebotar la segunda con un 429.
  const out: RoundProposal[] = [];
  for (const [i, q] of queries.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1_100));
    for (const hit of await search(q)) {
      if (!hit.snippet) continue;
      // Las cabeceras markdown de los snippets ("### Related news") pasan a
      // fin de frase: así las noticias relacionadas no heredan la mención a
      // la marca y no cuelan rondas de otras empresas.
      const clean = hit.snippet.replace(/#+|\[\.\.\.\]|\.{3}|…/g, '. ');
      out.push(...extractFromText(ensureStop(clean), hit.url, hit.host, null, hints));
    }
  }
  return out;
}

// ---------- Evidencia del B3S Scanner ----------
// El crawler de B3S ya visitó las superficies de la marca con un navegador
// real: renderiza las SPAs y esquiva los 403 que bloquean nuestro fetch.
// Esa captura vive en scans.evidence (referencias con URL y snippet) y es
// infraestructura de Jesús que reutilizamos tal cual, sin llamadas nuevas.
// Dos usos: extraer rondas del texto capturado, y detectar la página del
// anuncio (slug tipo "secures-e14m") para leerla entera.

interface EvidenceLike {
  references?: { url?: string; snippet?: string }[];
}

const FUNDING_URL_RE =
  /(secures?|raises?|raised|funding|financiaci|ronda|levanta|inversi[oó]n|seed|series-[abc])/i;

// Los snippets vienen en markdown y con URLs dentro. Las URLs se quitan
// ANTES de extraer: un slug tipo "secures-e14m" parsearía 14M de donde no
// toca (la misma trampa que ya nos costó un 28M fantasma).
function snippetToPlain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceRefs(evidence: unknown): { url: string; snippet: string }[] {
  const refs = (evidence as EvidenceLike | null)?.references ?? [];
  if (!Array.isArray(refs)) return [];
  return refs
    .map((r) => ({ url: String(r?.url ?? ''), snippet: String(r?.snippet ?? '') }))
    .filter((r) => r.snippet.length >= 40);
}

export function evidenceSnippetProposals(evidence: unknown): RoundProposal[] {
  const out: RoundProposal[] = [];
  for (const r of evidenceRefs(evidence)) {
    const plain = snippetToPlain(r.snippet);
    if (plain.length < 40) continue;
    out.push(...extractFromText(ensureStop(plain), r.url, 'evidencia B3S', null, []));
  }
  return consolidate(out);
}

export function fundingUrlsFromEvidence(evidence: unknown, max = 2): string[] {
  const urls = new Set<string>();
  for (const r of evidenceRefs(evidence)) {
    if (!r.url) continue;
    try {
      if (FUNDING_URL_RE.test(new URL(r.url).pathname)) urls.add(r.url);
    } catch {
      /* no era una URL */
    }
  }
  return [...urls].slice(0, max);
}

// ---------- Fuentes propias ----------

async function fromFeeds(brandHints: string[]): Promise<RoundProposal[]> {
  const items = await fetchFundingItems().catch(() => []);
  const out: RoundProposal[] = [];
  for (const item of items) {
    if (!looksLikeFunding(item)) continue;
    const hay = `${item.title} ${item.content}`.toLowerCase();
    if (!brandHints.some((h) => hay.includes(h))) continue;
    out.push(
      ...extractFromText(
        `${item.title}. ${item.content}`,
        item.link,
        hostOf(item.link, 'prensa'),
        item.pubDate,
        brandHints,
      ),
    );
  }
  return out;
}

function fromScan(markdown: string | null, brandHints: string[]): RoundProposal[] {
  if (!markdown) return [];
  return extractFromText(markdown, '', 'informe B3S', null, brandHints);
}

export async function discoverRounds(input: {
  domain: string;
  name: string;
  scanMarkdown?: string | null;
  scanEvidence?: unknown;
}): Promise<RoundProposal[]> {
  const base = input.domain.split('.')[0].toLowerCase();
  const hints = [...new Set([input.domain.toLowerCase(), base, input.name.toLowerCase()])].filter(
    (h) => h.length >= 3,
  );

  // Los feeds llevan tope propio: su parser da 20s por feed y la función
  // serverless corta antes. Si la prensa va lenta, se pierde esa fuente,
  // no la respuesta entera.
  const feedsConTope = Promise.race([
    fromFeeds(hints),
    new Promise<RoundProposal[]>((r) => setTimeout(() => r([]), 5_000)),
  ]);

  // Si el crawler de B3S capturó la página del propio anuncio de ronda,
  // se lee entera: es la fuente más fiable que existe (la marca contándolo).
  const announcementUrls = fundingUrlsFromEvidence(input.scanEvidence);
  const announcements = Promise.all(
    announcementUrls.map((u) => extractFromUrl(u).catch(() => [] as RoundProposal[])),
  ).then((r) => r.flat());

  const [web, feeds, fromAnnouncements] = await Promise.all([
    fromWeb(input.name, input.domain, hints).catch(() => []),
    feedsConTope.catch(() => []),
    announcements.catch(() => []),
  ]);

  // La marca contándolo en su propia web vale más que cualquier agregador:
  // sube un nivel de confianza y queda arriba del listado.
  const anuncios = fromAnnouncements.map((p) => ({
    ...p,
    confidence: (p.confidence === 'baja' ? 'media' : 'alta') as RoundProposal['confidence'],
  }));

  return dedupe([
    ...anuncios,
    ...evidenceSnippetProposals(input.scanEvidence),
    ...web,
    ...feeds,
    ...fromScan(input.scanMarkdown ?? null, hints),
  ]);
}
