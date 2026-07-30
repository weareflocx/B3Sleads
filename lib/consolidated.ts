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
// La agregación del Scanner SÍ es reproducible: el score global es la suma de
// los puntos de los diez componentes, con Magnetismo y Coherencia pesando x2
// (los dos que valen 20 y no 10). Comprobado exacto contra los escaneos con
// contrato v1: suma == score, sin residuo.
//
// Por eso el consolidado se calcula por delta de puntos, que con esa fórmula
// es exacto y no una aproximación:
//
//   consolidado = score_automatico + Σ (puntos_seleccionados − puntos_automáticos)
//
// Sin selecciones manuales el delta es 0 y el consolidado ES el automático
// (criterio #9). Los puntos ya llegan ponderados desde el informe, así que
// aquí no se vuelve a pesar nada.

// Puntos que aporta una dimensión al score global. No detectada aporta 0,
// igual que hace el Scanner.
function points(d: ScanDimension | undefined): number {
  if (!d || d.missing || d.score == null) return 0;
  return Number(d.score);
}

export function consolidatedScore(
  autoScore: number,
  autoDimensions: ScanDimension[],
  consolidated: ScanDimension[],
): number {
  const autoByKey = new Map(autoDimensions.map((d) => [canonDimension(d.name), d]));
  let delta = 0;
  for (const d of consolidated) {
    delta += points(d) - points(autoByKey.get(canonDimension(d.name)));
  }
  return Math.max(0, Math.min(100, Math.round(autoScore + delta)));
}
