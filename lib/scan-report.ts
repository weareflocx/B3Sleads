// Adaptador del resultado estructurado de B3S Scanner API v1. Conserva soporte
// para los informes Markdown históricos ya guardados en Supabase.
import type { B3SScanResult } from './brand3';

export interface ScanTodo {
  label: string; // "Propia", "Clara"…
  desc: string; // "La frase no vale para su competencia."
}

// Una baldosa del componente con su estado medido:
//  on = encendida · off = no detectada · blind = no se pudo medir.
export interface ScanTile {
  label: string;
  state: 'on' | 'off' | 'blind';
  reason: string | null;
}

export interface ScanDimension {
  name: string; // "Propuesta de valor"
  score: number | null;
  max: number | null;
  ratio: number | null; // score/max, o 0 si "no detectado"
  verdict: string | null; // el blockquote ">" de la sección
  analysis: string | null; // primera frase de análisis en prosa
  todos: ScanTodo[]; // baldosas apagadas (acciones concretas)
  missing: boolean; // "_No detectado._"
  // Solo en scans v1: la evidencia literal capturada (puede venir en el
  // idioma de la web) y su URL de origen.
  quote?: string | null;
  quoteUrl?: string | null;
  // Términos cortos extraídos por el escáner (Atributos/Valores): p. ej.
  // "Segura · Técnica · Exclusiva". Si vienen, se muestran en vez de la cita.
  terms?: string[] | null;
  // Solo en scans v1: todas las baldosas con su estado.
  tilesDetail?: ScanTile[];
}

export interface ScanReport {
  summary: string | null; // el blockquote de cabecera
  dimensions: ScanDimension[];
  strengths: ScanDimension[]; // lo que ya funciona (ratio alto)
  weaknesses: ScanDimension[]; // la oportunidad (bajo o no detectado)
}

function categorize(summary: string | null, dimensions: ScanDimension[]): ScanReport {
  const strengths = dimensions
    .filter((d) => !d.missing && (d.ratio ?? 0) >= 0.8)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const weaknesses = dimensions
    .filter((d) => d.missing || (d.ratio != null && d.ratio <= 0.6))
    .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
  return { summary, dimensions, strengths, weaknesses };
}

function firstSentence(text: string, max = 240): string {
  const clean = text.trim();
  const dot = clean.indexOf('. ');
  const cut = dot > 40 ? clean.slice(0, dot + 1) : clean;
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + '…' : cut;
}

export function parseScanReport(markdown: string): ScanReport {
  const parts = markdown.split(/\n## /);
  const head = parts[0] ?? '';
  const summaryMatch = head.match(/^>\s*(.+)$/m);
  const summary = summaryMatch ? summaryMatch[1].trim() : null;

  const dimensions: ScanDimension[] = [];
  for (const block of parts.slice(1)) {
    const name = block.split('\n')[0].replace(/[#*]/g, '').trim();
    if (!name) continue;

    const missing = /_No detectado\._/.test(block);
    // La nota que cuenta es la ponderada "(N/M pts)": Magnetismo y Coherencia
    // pesan ×2 y valen 20 (así el total cuadra a /100). El "**X/Y**" en
    // negrita es la nota sin ponderar (8/10), que engañaba a la parrilla.
    const ptsM = block.match(/\(\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*pts\)/);
    const boldM = block.match(/Nota:\s*\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
    const sc = ptsM ?? boldM;
    const score = sc ? parseFloat(sc[1]) : null;
    const max = sc ? parseFloat(sc[2]) : null;
    const ratio = score != null && max ? score / max : missing ? 0 : null;

    const verdictM = block.match(/^>\s*(.+)$/m);
    const verdict = verdictM ? verdictM[1].trim() : null;

    let analysis: string | null = null;
    // Línea de términos cortos si el informe la trae ("Segura · Técnica · …").
    let terms: string[] | null = null;
    for (const line of block.split('\n').slice(1)) {
      const l = line.trim();
      if (!l || /^[>\-#_]/.test(l) || /Nota:/.test(l)) continue;
      if (!terms && l.includes('·') && l.length <= 90 && !/[.!?]/.test(l.replace(/\.\s*$/, ''))) {
        const parts = l.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 4)) {
          terms = parts.slice(0, 6);
          continue;
        }
      }
      if (!analysis) analysis = l;
    }

    const todos: ScanTodo[] = [];
    const bald = block.split(/### Baldosas apagadas[^\n]*\n/)[1];
    if (bald) {
      const scope = bald.split(/\n### /)[0];
      for (const m of scope.matchAll(/- \*\*[^·*]*·\s*([^*]+?)\*\*\s*—\s*([^\n]+)/g)) {
        todos.push({ label: m[1].trim(), desc: m[2].trim() });
      }
    }

    dimensions.push({ name, score, max, ratio, verdict, analysis, todos, missing, terms });
  }

  return categorize(summary, dimensions);
}

// Extrae el markdown del scan (si se importó por URL de informe).
export function reportMarkdown(resultRaw: Record<string, unknown> | null | undefined): string | null {
  const md = (resultRaw as { markdown?: unknown } | null)?.markdown;
  return typeof md === 'string' && md.length > 100 ? md : null;
}

// Las capturas vienen en markdown: imágenes fuera, enlaces reducidos a su
// texto, y sin URLs sueltas. Sin esto las citas arrastraban cosas como
// "![](https://…/badge objetivo 03 eng.png)".
function cleanQuote(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Términos cortos que el escáner extrae para Atributos y Valores
// ("Segura · Técnica · Exclusiva · Eficiente"). No viajan en todas las
// versiones del contrato: se buscan bajo los nombres de campo habituales y,
// en su defecto, en un detected_content que ya venga en formato lista corta.
// Devuelve null salvo que haya al menos dos términos de pocas palabras.
function shortTerms(component: Record<string, unknown>): string[] | null {
  const clean = (list: unknown[]): string[] =>
    list
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 32 && !/[.!?]$/.test(s) && s.split(/\s+/).length <= 4);

  for (const key of ['attributes', 'values', 'descriptors', 'traits', 'terms', 'tags', 'keywords']) {
    const value = component[key];
    if (Array.isArray(value)) {
      const terms = clean(value);
      if (terms.length >= 2) return terms.slice(0, 6);
    }
  }

  // detected_content ya en lista: "Segura · Técnica · Exclusiva" o con comas,
  // corto y sin puntuación de frase.
  const dc = typeof component.detected_content === 'string' ? component.detected_content.trim() : '';
  if (dc && dc.length <= 90 && /·|,/.test(dc) && !/[.!?]/.test(dc.replace(/\.\s*$/, ''))) {
    const parts = clean(dc.split(/\s*·\s*|\s*,\s*/));
    if (parts.length >= 2) return parts.slice(0, 6);
  }
  return null;
}

function tileText(tile: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tile[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function structuredScanReport(result: B3SScanResult): ScanReport {
  // El primer evidence_ref suele ser el mismo para casi todos los componentes
  // (el H1 de la home), así que asignarlo a ciegas repetía la misma frase en
  // media parrilla. Se recogen candidatos por componente y se reparten sin
  // repetir; si a uno no le queda ninguno propio, habla su detected_content,
  // que el Scanner sí escribe específico para él.
  const raw = result.components.map((component) => {
    const status = `${component.status} ${component.coverage_status}`.toLowerCase();
    const missing = /not.?detected|absent|missing/.test(status);
    const ratio =
      component.score != null && component.max_score
        ? component.score / component.max_score
        : missing
          ? 0
          : null;

    const todos: ScanTodo[] = component.tiles.flatMap((tile) => {
      const state = tileText(tile, ['estado', 'state', 'status'])?.toLowerCase() ?? '';
      if (!['no', 'off', 'failed', 'missing', 'absent'].includes(state)) return [];
      const label = tileText(tile, ['id', 'label', 'name', 'nombre', 'key']) || 'Mejora';
      const desc = tileText(tile, ['motivo', 'description', 'desc', 'message', 'reason', 'summary']);
      return desc ? [{ label, desc }] : [];
    });

    const tilesDetail: ScanTile[] = component.tiles.map((tile) => {
      const label = tileText(tile, ['id', 'label', 'name', 'nombre', 'key']) || '·';
      const rawState = (tileText(tile, ['estado', 'state', 'status']) ?? '').toLowerCase();
      const state: ScanTile['state'] = /^(ok|s[ií]|yes|pass(ed)?|on)$/.test(rawState)
        ? 'on'
        : ['no', 'off', 'failed', 'missing', 'absent'].includes(rawState)
          ? 'off'
          : 'blind';
      const reason =
        tileText(tile, ['motivo', 'description', 'desc', 'message', 'reason']) ||
        tileText(tile, ['evidencia', 'evidence']);
      return { label, state, reason: reason ?? null };
    });

    // Candidatos de cita, de más específico a más genérico: primero lo que
    // capturó cada baldosa, luego las referencias del componente.
    const candidates: { text: string; url: string | null }[] = [];
    for (const tile of component.tiles) {
      const ev = tileText(tile, ['evidencia', 'evidence']);
      const clean = ev ? cleanQuote(ev) : '';
      if (clean.length >= 25) candidates.push({ text: clean, url: null });
    }
    for (const ref of component.evidence_refs ?? []) {
      const clean = cleanQuote(ref.snippet ?? '');
      if (clean.length >= 25) candidates.push({ text: clean, url: ref.url || null });
    }

    return {
      dimension: {
        name: component.label || component.key,
        score: component.score,
        max: component.max_score,
        ratio,
        verdict: component.verdict || null,
        analysis: component.summary || component.message || null,
        todos,
        missing,
        quote: null as string | null,
        quoteUrl: null as string | null,
        terms: shortTerms(component as unknown as Record<string, unknown>),
        tilesDetail,
      } satisfies ScanDimension,
      candidates,
      detected: component.detected_content?.trim() || null,
      fallbackUrl: component.evidence_refs?.[0]?.url || null,
    };
  });

  // Reparto: cada componente se queda con la primera cita que nadie haya
  // usado. Los que tienen menos candidatos eligen antes, para que no se
  // queden sin nada por culpa de los que tienen de sobra.
  const used = new Set<string>();
  const order = [...raw].sort((a, b) => a.candidates.length - b.candidates.length);
  for (const item of order) {
    const pick = item.candidates.find((c) => !used.has(c.text));
    if (pick) {
      used.add(pick.text);
      item.dimension.quote = pick.text;
      item.dimension.quoteUrl = pick.url;
    } else if (item.detected) {
      // Sin cita propia: lo que el Scanner detectó para ESTE componente.
      item.dimension.quote = item.detected;
      item.dimension.quoteUrl = item.fallbackUrl;
    }
  }

  const dimensions = raw.map((r) => r.dimension);
  return categorize(result.summary || null, dimensions);
}

// Punto de entrada para consumidores actuales: primero usa el contrato v1 y
// sólo cae al parser Markdown para filas históricas.
export function storedScanReport(
  resultRaw: Record<string, unknown> | null | undefined,
): ScanReport | null {
  if (
    resultRaw?.object === 'scan_result' &&
    resultRaw.metadata &&
    Array.isArray(resultRaw.components)
  ) {
    return structuredScanReport(resultRaw as unknown as B3SScanResult);
  }
  const markdown = reportMarkdown(resultRaw);
  return markdown ? parseScanReport(markdown) : null;
}

// Digest compacto para el redactor con IA: lo esencial y por-marca, sin los
// 8000 chars crudos. Alimenta el prompt de generateDraft.
export function reportDigest(report: ScanReport): string {
  const lines: string[] = [];
  if (report.summary) lines.push(`Lectura global: ${report.summary}`);
  if (report.strengths.length) {
    lines.push('\nLo que ya funciona:');
    for (const d of report.strengths.slice(0, 2)) {
      lines.push(`- ${d.name} (${d.score}/${d.max}): ${firstSentence(d.verdict || d.analysis || '')}`);
    }
  }
  if (report.weaknesses.length) {
    lines.push('\nHuecos concretos (oportunidad de marca):');
    for (const d of report.weaknesses.slice(0, 3)) {
      const base = d.missing
        ? 'no detectado en superficies públicas'
        : firstSentence(d.verdict || d.analysis || '');
      lines.push(`- ${d.name}${d.score != null ? ` (${d.score}/${d.max})` : ''}: ${base}`);
      for (const t of d.todos.slice(0, 2)) lines.push(`    · ${t.label}: ${t.desc}`);
    }
  }
  return lines.join('\n');
}
