// Versiones de cada componente a lo largo de todos los escaneos de una marca.
//
// No hay tabla nueva: las versiones se DERIVAN del payload que ya guardamos en
// cada scan. Eso cumple por construcción el anti-requisito de no modificar
// nunca lo que la máquina vio (no se puede editar lo que se deriva).
//
// Sirve para dos cosas: elegir con criterio humano qué versión refleja la
// realidad, y medir qué dimensiones de la rúbrica son inestables, que es lo
// que dice qué arreglar del Scanner y en qué orden.
import { storedScanReport, type ScanDimension } from './scan-report';
import type { Scan } from './types';

// Nombre canónico de la dimensión: el Scanner la etiqueta en español o en
// inglés según el run, y sin esto la misma dimensión se contaría dos veces.
const CANON: Record<string, string> = {
  'misión': 'mission', mission: 'mission',
  'visión': 'vision', vision: 'vision',
  valores: 'values', values: 'values',
  atributos: 'attributes', attributes: 'attributes',
  'propuesta de valor': 'value-prop', 'value proposition': 'value-prop',
  'personalidad / arquetipo': 'personality', 'personality / archetype': 'personality',
  'idea de marca': 'brand-idea', 'brand idea': 'brand-idea',
  'propósito': 'purpose', 'proposito': 'purpose', purpose: 'purpose',
  magnetismo: 'magnetism', magnetism: 'magnetism',
  coherencia: 'coherence', coherence: 'coherence',
};
export function canonDimension(name: string): string {
  return CANON[name.trim().toLowerCase()] ?? name.trim().toLowerCase();
}

export const DIMENSION_LABELS: Record<string, string> = {
  purpose: 'Propósito',
  magnetism: 'Magnetismo',
  'value-prop': 'Propuesta de valor',
  personality: 'Personalidad / Arquetipo',
  'brand-idea': 'Idea de marca',
  attributes: 'Atributos',
  values: 'Valores',
  mission: 'Misión',
  vision: 'Visión',
  coherence: 'Coherencia',
};

export interface ComponentVersion {
  scanId: string;
  runAt: string; // cuándo se ejecutó ese escaneo
  uiUrl: string | null; // enlace al run en el Scanner
  rubricVersion: string | null; // dos rúbricas distintas no son comparables
  detected: boolean; // false NO es lo mismo que sacar un cero
  score: number | null; // null si no se detectó
  max: number | null;
  reading: string | null;
  analysis: string | null;
  verdict: string | null;
  quote: string | null;
  quoteUrl: string | null;
}

export interface DimensionStats {
  min: number | null;
  max: number | null;
  stdev: number | null; // desviación típica de las versiones detectadas
  detectedIn: number;
  totalRuns: number;
}

export interface DimensionVersions {
  key: string;
  label: string;
  versions: ComponentVersion[]; // cronológico descendente
  stats: DimensionStats;
}

// La versión por defecto es la del último run válido, NUNCA la más alta:
// preseleccionar el máximo sesga el score al alza por construcción.
export function defaultVersion(d: DimensionVersions): ComponentVersion | null {
  return d.versions[0] ?? null;
}

function rubricOf(scan: Scan): string | null {
  const raw = scan.result_raw as { metadata?: { rubric_version?: unknown } } | null;
  const v = raw?.metadata?.rubric_version;
  return typeof v === 'string' ? v : null;
}

// Un run que falló no es un run con puntuación cero: no puede aparecer como
// versión seleccionable ni entrar en ninguna media.
export function isUsableRun(scan: Scan): boolean {
  if (scan.status !== 'ready') return false;
  return scan.score != null && Number(scan.score) > 0;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

// Todas las versiones de todos los componentes de una marca, agrupadas por
// dimensión. Las pasadas donde el componente NO se detectó también entran:
// ver que la visión apareció el 12 y desapareció el 19 es justo el dato que
// explica por qué cayó el score.
export function componentVersions(scans: Scan[]): DimensionVersions[] {
  const usable = scans
    .filter(isUsableRun)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const byDimension = new Map<string, ComponentVersion[]>();

  for (const scan of usable) {
    const report = storedScanReport(scan.result_raw);
    if (!report) continue;
    const seen = new Set<string>();

    for (const dim of report.dimensions) {
      const key = canonDimension(dim.name);
      seen.add(key);
      const list = byDimension.get(key) ?? [];
      list.push(toVersion(scan, dim));
      byDimension.set(key, list);
    }

    // Dimensiones que ese run no trajo: se registran como no detectadas para
    // que la ausencia sea visible, no un hueco silencioso en la lista.
    for (const key of Object.keys(DIMENSION_LABELS)) {
      if (seen.has(key)) continue;
      const list = byDimension.get(key) ?? [];
      list.push({
        scanId: scan.id,
        runAt: scan.created_at,
        uiUrl: scan.ui_url,
        rubricVersion: rubricOf(scan),
        detected: false,
        score: null,
        max: null,
        reading: null,
        analysis: null,
        verdict: null,
        quote: null,
        quoteUrl: null,
      });
      byDimension.set(key, list);
    }
  }

  const out: DimensionVersions[] = [];
  for (const [key, versions] of byDimension) {
    const scored = versions.filter((v) => v.detected && v.score != null).map((v) => v.score!);
    out.push({
      key,
      label: DIMENSION_LABELS[key] ?? key,
      versions,
      stats: {
        min: scored.length ? Math.min(...scored) : null,
        max: scored.length ? Math.max(...scored) : null,
        stdev: stdev(scored),
        detectedIn: scored.length,
        totalRuns: versions.length,
      },
    });
  }
  // Mismo orden que la parrilla de la ficha.
  const order = Object.keys(DIMENSION_LABELS);
  out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return out;
}

function toVersion(scan: Scan, dim: ScanDimension): ComponentVersion {
  return {
    scanId: scan.id,
    runAt: scan.created_at,
    uiUrl: scan.ui_url,
    rubricVersion: rubricOf(scan),
    detected: !dim.missing && dim.score != null,
    score: dim.missing ? null : dim.score,
    max: dim.max,
    reading: dim.reading ?? null,
    analysis: dim.analysis ?? null,
    verdict: dim.verdict ?? null,
    quote: dim.quote ?? null,
    quoteUrl: dim.quoteUrl ?? null,
  };
}

// Frecuencia de detección de una dimensión, para no llamar hueco a algo que
// un escaneo anterior sí encontró. Decirle a un founder que no tiene misión
// cuando tu propio escaneo de la semana pasada se la encontró es el error más
// caro del sistema: lo desmonta la única persona que sabe que te equivocas.
export function detectionNote(d: DimensionVersions): string {
  const { detectedIn, totalRuns } = d.stats;
  if (totalRuns <= 1) return 'no detectada en el único escaneo';
  if (detectedIn === 0) return `no detectada en ninguno de los ${totalRuns} escaneos`;
  return `detectada en ${detectedIn} de ${totalRuns} → revisar`;
}

// ---------- Calibración (§8) ----------
// El subproducto que más importa: con N versiones por componente se puede
// medir qué dimensiones de la rúbrica son inestables. Una dimensión con
// desviación 0.8 es sólida; una con 2.4 tiene un problema de rúbrica o de
// prompt, no de marca. Eso dice qué arreglar del Scanner y en qué orden.
export interface DimensionCalibration {
  key: string;
  label: string;
  avgStdev: number | null;
  avgRange: number | null;
  detectionRate: number; // 0-1
  companies: number;
}

export function calibrationByDimension(
  perCompany: DimensionVersions[][],
): DimensionCalibration[] {
  const acc = new Map<string, { stdevs: number[]; ranges: number[]; det: number; tot: number; cos: number }>();

  for (const dims of perCompany) {
    for (const d of dims) {
      // Solo empresas con 2 o más pasadas: con una no hay dispersión que medir.
      if (d.stats.totalRuns < 2) continue;
      const a = acc.get(d.key) ?? { stdevs: [], ranges: [], det: 0, tot: 0, cos: 0 };
      // La dispersión se compara entre dimensiones, y no todas puntúan sobre
      // lo mismo (Atributos vale 5, Coherencia 20). Se lleva todo a base 10 o
      // Magnetismo y Coherencia parecerían el doble de inestables por escala.
      const scale = 10 / (d.versions.find((v) => v.max)?.max ?? 10);
      if (d.stats.stdev != null) a.stdevs.push(d.stats.stdev * scale);
      if (d.stats.min != null && d.stats.max != null) {
        a.ranges.push((d.stats.max - d.stats.min) * scale);
      }
      a.det += d.stats.detectedIn;
      a.tot += d.stats.totalRuns;
      a.cos += 1;
      acc.set(d.key, a);
    }
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null;

  const out: DimensionCalibration[] = [];
  for (const [key, a] of acc) {
    out.push({
      key,
      label: DIMENSION_LABELS[key] ?? key,
      avgStdev: mean(a.stdevs),
      avgRange: mean(a.ranges),
      detectionRate: a.tot ? a.det / a.tot : 0,
      companies: a.cos,
    });
  }
  // Lo más inestable primero: es la cola de trabajo del Scanner.
  return out.sort((a, b) => (b.avgStdev ?? -1) - (a.avgStdev ?? -1));
}

// §8.2 — desviación del score total entre runs de la misma empresa separados
// por menos de 7 días. Mientras esté por encima de 5, el score se comunica al
// founder como banda, no como número exacto.
export function globalScoreDeviation(
  scansByCompany: { scores: { score: number; at: string }[] }[],
): { deviation: number | null; pairs: number } {
  const diffs: number[] = [];
  for (const c of scansByCompany) {
    const s = [...c.scores].sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 1; i < s.length; i++) {
      const days = (new Date(s[i].at).getTime() - new Date(s[i - 1].at).getTime()) / 86_400_000;
      if (days <= 7) diffs.push(Math.abs(s[i].score - s[i - 1].score));
    }
  }
  if (!diffs.length) return { deviation: null, pairs: 0 };
  return {
    deviation: Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10,
    pairs: diffs.length,
  };
}
