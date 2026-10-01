import type { SupabaseClient } from '@supabase/supabase-js';
import {
  absoluteB3SUrl,
  apiConfigured,
  B3SApiError,
  getEvidence,
  getReportByUrl,
  getResult,
  getScanStatus,
  storedScanStatus,
  storedTldr,
  type B3SScanEvidence,
  type B3SScanResult,
  type ScanJob,
  type ImportedScan,
} from './brand3';
import type { Scan } from './types';

const EN_MARCHA = ['queued', 'running', 'blocked'];

export function completedScanData(result: B3SScanResult, evidence: B3SScanEvidence) {
  return {
    status: 'ready' as const,
    score: result.score.value,
    tldr: storedTldr(result),
    evidence,
    result_raw: result,
    ui_url: absoluteB3SUrl(result.links.report),
    completed_at: new Date().toISOString(),
  };
}

// Actualiza una fila local desde el estado autoritativo del API. Se usa tanto
// desde el polling del navegador como desde procesos server-side.
//
// Devuelve también el job remoto: trae `progress` y `phase`, y así la barra de
// progreso del navegador no necesita una llamada extra a la API.
// `tiempos`: topes por llamada para caber en los 10 s de una función de
// Netlify. Sin ellos, estado (8 s) + resultado y evidencia (8 s) podían
// sumar 16 s: Netlify cortaba, el navegador recibía su página de error, y el
// scan acababa cerrándose por la vía pública, sin evidencia estructurada
// (iPronics, 01/10).
export async function syncStoredScan(
  db: SupabaseClient,
  scan: Scan,
  tiempos: { estado?: number; informe?: number } = {},
): Promise<{ scan: Scan; job: ScanJob }> {
  const job = await getScanStatus(scan.scanner_job_id, tiempos.estado);
  let update: Record<string, unknown>;

  if (job.status === 'completed') {
    const [result, evidence] = await Promise.all([
      getResult(job.id, tiempos.informe),
      getEvidence(job.id, tiempos.informe),
    ]);
    // Si ya estaba cerrado (se está completando un informe público), se
    // conserva cuándo terminó de verdad.
    update = { ...completedScanData(result, evidence), ...(scan.completed_at ? { completed_at: scan.completed_at } : {}) };
  } else {
    update = {
      status: storedScanStatus(job.status),
      ui_url: absoluteB3SUrl(job.links.report),
      ...(job.status === 'failed' || job.status === 'cancelled'
        ? {
            completed_at: job.completed_at || new Date().toISOString(),
            result_raw: { scan: job },
          }
        : {}),
    };
  }

  // Un "sigue en marcha" que llega tarde no puede deshacer un cierre: con
  // varias pestañas sondeando, un sondeo lento que vio "running" aterrizaba
  // después de otro que ya había escrito "ready".
  const terminal = update.status === 'ready' || update.status === 'failed' || update.status === 'cancelled';
  let q = db.from('scans').update(update).eq('id', scan.id);
  if (!terminal) q = q.in('status', EN_MARCHA);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw error;
  if (data) return { scan: data as Scan, job };
  const { data: actual, error: e2 } = await db.from('scans').select('*').eq('id', scan.id).single();
  if (e2) throw e2;
  return { scan: actual as Scan, job };
}

// Materializa un resultado histórico sin duplicarlo si varias entradas del
// producto descubren el mismo scan remoto.
export async function persistImportedScan(
  db: SupabaseClient,
  companyId: string,
  profile: ImportedScan,
): Promise<Scan> {
  if (!profile.found || !profile.scanId) {
    throw new Error('El resultado importado no contiene un scan_id válido');
  }

  const scanData = {
    company_id: companyId,
    scanner_job_id: profile.scanId,
    status: 'ready' as const,
    score: profile.score,
    tldr: profile.tldr,
    evidence: profile.evidence,
    result_raw: profile.raw,
    ui_url: profile.uiUrl,
    // Con la fecha REAL del scan: el orden de las pasadas decide cuál es la
    // última publicable y cuál la retenida, y un informe viejo importado hoy
    // no puede pasar por el más reciente.
    ...(profile.scannedAt ? { created_at: profile.scannedAt } : {}),
    completed_at: profile.scannedAt ?? new Date().toISOString(),
  };
  const { data: existing } = await db
    .from('scans')
    .select('id')
    .eq('company_id', companyId)
    .eq('scanner_job_id', profile.scanId)
    .limit(1)
    .maybeSingle();

  const mutation = existing
    ? db.from('scans').update(scanData).eq('id', existing.id)
    : db.from('scans').insert(scanData);
  const { data, error } = await mutation.select().single();
  if (error) throw error;
  return data as Scan;
}

// ---------- Scans colgados ----------
// Un scan que lleva horas "en marcha" casi nunca lo está: el Scanner tarda
// minutos. Lo normal es que terminara allí y nadie lo sincronizara, porque
// solo se sincroniza mientras alguien tiene abierta la pantalla que lo sondea.
// Antes, cualquier botón de scan encontraba esa fila, la daba por activa y no
// lanzaba nada: la marca se quedaba "sin scan" para siempre (Utopicum,
// Locomotive y Studiofreight, 26/09 → 30/09).
export const SCAN_COLGADO_MS = 6 * 60 * 60 * 1000;

export function scanColgado(s: Pick<Scan, 'status' | 'created_at'>, ahora = Date.now()): boolean {
  return EN_MARCHA.includes(s.status) && ahora - new Date(s.created_at).getTime() > SCAN_COLGADO_MS;
}

// Cierra un scan colgado con lo que diga el Scanner: su resultado si terminó,
// su fallo si falló. Sin token (en local) lee el informe público, que no trae
// evidencia estructurada pero sí nota, resumen y análisis.
//
// "failed" solo se escribe si el Scanner lo dice (fallido, cancelado o que no
// existe). Un corte de red o un timeout NO es un fallo: la fila se queda como
// estaba y simplemente deja de bloquear un scan nuevo. Antes cualquier error
// pasajero la dejaba "failed" para siempre aunque el Scanner terminara.
export async function rescataScan(db: SupabaseClient, scan: Scan): Promise<Scan> {
  if (apiConfigured()) {
    try {
      return (await syncStoredScan(db, scan)).scan;
    } catch (e) {
      if (e instanceof B3SApiError && e.status === 404) return marcaFallido(db, scan);
      // Pasajero: se prueba la vía pública, y si tampoco, se deja como está.
    }
  }
  try {
    const informe = await getReportByUrl(`https://b3s.fly.dev/report/${scan.scanner_job_id}`);
    if (informe.found && informe.scanId === scan.scanner_job_id) {
      return await persistImportedScan(db, scan.company_id, informe);
    }
  } catch {
    // Sin informe público todavía: no es una respuesta del Scanner.
  }
  return scan;
}

async function marcaFallido(db: SupabaseClient, scan: Scan): Promise<Scan> {
  const { data, error } = await db
    .from('scans')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', scan.id)
    .in('status', EN_MARCHA)
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as Scan | null) ?? scan;
}

// El scan de verdad en marcha de una marca, si lo hay. Los colgados se
// rescatan por el camino y se devuelven aparte: si alguno trajo nota, quien
// iba a lanzar un scan nuevo puede ahorrárselo.
export async function scanEnMarcha(
  db: SupabaseClient,
  companyId: string,
): Promise<{ activo: Scan | null; rescatados: Scan[] }> {
  const { data, error } = await db
    .from('scans')
    .select('*')
    .eq('company_id', companyId)
    .in('status', EN_MARCHA)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rescatados: Scan[] = [];
  let activo: Scan | null = null;
  for (const s of (data ?? []) as Scan[]) {
    if (!scanColgado(s)) {
      activo ??= s;
      continue;
    }
    // Rescatado o no, un colgado no cuenta como "en marcha".
    rescatados.push(await rescataScan(db, s));
  }
  return { activo, rescatados };
}

// Un scan cerrado con el informe público (sin token, o porque la API no
// respondió a tiempo) tiene nota y análisis, pero no la evidencia
// estructurada. Con token se puede completar después por la API.
export function esInformePublico(scan: Pick<Scan, 'status' | 'result_raw'> | null | undefined): boolean {
  return scan?.status === 'ready' && (scan.result_raw as { source?: string } | null)?.source === 'public_report';
}
