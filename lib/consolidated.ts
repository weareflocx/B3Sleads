// Consolidación por componente: la capa de curación humana sobre los scans.
//
// Una selección APUNTA a la versión de un componente dentro de un scan ya
// guardado; nunca edita nada. El "Brand Seed consolidado" es el informe
// resultante de coger, para cada dimensión, la versión seleccionada (o la del
// último run válido si nadie ha elegido).
//
// Dos scores, separados y etiquetados siempre:
//  - score_automatico: el del último run, sin tocar. Ordena rankings y radar.
//  - score_consolidado: refleja la selección humana. Solo dossier interno.
// Un antes/después se compara automático contra automático o consolidado
// contra consolidado. Nunca cruzado.
import type { Scan } from './types';
import { storedScanReport, type ScanDimension } from './scan-report';
import { canonDimension, isUsableRun } from './scan-versions';

export interface ComponentSelection {
  dimension: string; // clave canónica (purpose, mission, …)
  scan_id: string;
  is_manual: boolean;
  selected_by_email: string | null;
  note: string | null;
  selected_at: string;
}

export interface ConsolidatedReport {
  dimensions: ScanDimension[];
  // De qué scan sale lo que se muestra en cada dimensión (procedencia real).
  sourceByKey: Record<string, string>;
  manualCount: number;
  totalCount: number;
}

// Sustituye en el informe automático las dimensiones con selección manual por
// la versión completa (baldosas y términos incluidos) del scan elegido.
export function consolidateReport(
  autoDimensions: ScanDimension[],
  selections: ComponentSelection[],
  scans: Scan[],
  latestScanId: string | null,
): ConsolidatedReport {
  const manual = selections.filter((s) => s.is_manual);
  const byDim = new Map(manual.map((s) => [s.dimension, s]));
  const reportCache = new Map<string, ScanDimension[]>();

  const dimensionsOf = (scanId: string): ScanDimension[] => {
    if (!reportCache.has(scanId)) {
      const scan = scans.find((s) => s.id === scanId);
      const report = scan && isUsableRun(scan) ? storedScanReport(scan.result_raw) : null;
      reportCache.set(scanId, report?.dimensions ?? []);
    }
    return reportCache.get(scanId)!;
  };

  const sourceByKey: Record<string, string> = {};
  let applied = 0;

  const dimensions = autoDimensions.map((d) => {
    const key = canonDimension(d.name);
    const sel = byDim.get(key);
    if (latestScanId) sourceByKey[key] = latestScanId;
    if (!sel) return d;
    const candidate = dimensionsOf(sel.scan_id).find((x) => canonDimension(x.name) === key);
    // Si el scan elegido ya no existe o no traía la dimensión, se cae al
    // automático en silencio: mejor el defecto que un hueco.
    if (!candidate) return d;
    sourceByKey[key] = sel.scan_id;
    applied += 1;
    return candidate;
  });

  return { dimensions, sourceByKey, manualCount: applied, totalCount: autoDimensions.length };
}

// --- score_consolidado ---
//
// La agregación exacta 0→100 del Scanner no viaja en el payload y §7 prohíbe
// inventar una nueva. Lo que sí es reproducible al 100% es base_average (media
// de las 8 dimensiones base, no detectada = 0) y el peso observado de
// Magnetismo/Coherencia (×2). Por eso el consolidado se calcula POR DELTA:
//
//   consolidado = score_automatico + Σ (peso_d × (sel_d − auto_d))
//
// Sin selecciones manuales el delta es 0 y el consolidado ES el automático,
// exacto (criterio #9). Con selecciones, el delta usa los pesos observados
// (base ×6/8, Magnetismo y Coherencia ×2), que cancelan el término que no
// sabemos reproducir. Cuando el Scanner exponga su agregación real, este es
// el único sitio que hay que cambiar.
const HEAVY = new Set(['magnetism', 'coherence']);

function norm(d: ScanDimension | undefined): number {
  // No detectada aporta 0, igual que hace el automático en base_average.
  // score×10/max normaliza a 0-10 tanto los /5 y /10 del contrato v1 como el
  // 16/20 ya ponderado de los informes markdown.
  if (!d || d.missing || d.score == null) return 0;
  return (Number(d.score) * 10) / (d.max && d.max > 0 ? d.max : 10);
}

export function consolidatedScore(
  autoScore: number,
  autoDimensions: ScanDimension[],
  consolidated: ScanDimension[],
): number {
  const autoByKey = new Map(autoDimensions.map((d) => [canonDimension(d.name), d]));
  let delta = 0;
  for (const d of consolidated) {
    const key = canonDimension(d.name);
    const auto = autoByKey.get(key);
    const diff = norm(d) - norm(auto);
    if (diff === 0) continue;
    delta += diff * (HEAVY.has(key) ? 2 : 6 / 8);
  }
  return Math.max(0, Math.min(100, Math.round(autoScore + delta)));
}
