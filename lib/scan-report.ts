// Adaptador del resultado estructurado de B3S Scanner API v1. Conserva soporte
// para los informes Markdown históricos ya guardados en Supabase.
import type { B3SScanResult } from './brand3';

export interface ScanTodo {
  label: string; // "Propia", "Clara"…
  desc: string; // "La frase no vale para su competencia."
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
    const sc = block.match(/Nota:\s*\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
    const score = sc ? parseFloat(sc[1]) : null;
    const max = sc ? parseFloat(sc[2]) : null;
    const ratio = score != null && max ? score / max : missing ? 0 : null;

    const verdictM = block.match(/^>\s*(.+)$/m);
    const verdict = verdictM ? verdictM[1].trim() : null;

    let analysis: string | null = null;
    for (const line of block.split('\n').slice(1)) {
      const l = line.trim();
      if (!l || /^[>\-#_]/.test(l)) continue;
      analysis = l;
      break;
    }

    const todos: ScanTodo[] = [];
    const bald = block.split(/### Baldosas apagadas[^\n]*\n/)[1];
    if (bald) {
      const scope = bald.split(/\n### /)[0];
      for (const m of scope.matchAll(/- \*\*[^·*]*·\s*([^*]+?)\*\*\s*—\s*([^\n]+)/g)) {
        todos.push({ label: m[1].trim(), desc: m[2].trim() });
      }
    }

    dimensions.push({ name, score, max, ratio, verdict, analysis, todos, missing });
  }

  return categorize(summary, dimensions);
}

// Extrae el markdown del scan (si se importó por URL de informe).
export function reportMarkdown(resultRaw: Record<string, unknown> | null | undefined): string | null {
  const md = (resultRaw as { markdown?: unknown } | null)?.markdown;
  return typeof md === 'string' && md.length > 100 ? md : null;
}

function tileText(tile: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tile[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function structuredScanReport(result: B3SScanResult): ScanReport {
  const dimensions: ScanDimension[] = result.components.map((component) => {
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
      const label = tileText(tile, ['label', 'name', 'nombre', 'key']) || 'Mejora';
      const desc = tileText(tile, ['description', 'desc', 'message', 'reason', 'summary']);
      return desc ? [{ label, desc }] : [];
    });

    return {
      name: component.label || component.key,
      score: component.score,
      max: component.max_score,
      ratio,
      verdict: component.verdict || null,
      analysis: component.summary || component.message || component.detected_content || null,
      todos,
      missing,
    };
  });
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
