import type { SupabaseClient } from '@supabase/supabase-js';
import {
  absoluteB3SUrl,
  apiConfigured,
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
export async function syncStoredScan(
  db: SupabaseClient,
  scan: Scan,
): Promise<{ scan: Scan; job: ScanJob }> {
  const job = await getScanStatus(scan.scanner_job_id);
  let update: Record<string, unknown>;

  if (job.status === 'completed') {
    const [result, evidence] = await Promise.all([
      getResult(job.id),
      getEvidence(job.id),
    ]);
    update = completedScanData(result, evidence);
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

  const { data, error } = await db.from('scans').update(update).eq('id', scan.id).select().single();
  if (error) throw error;
  return { scan: data as Scan, job };
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
const EN_MARCHA = ['queued', 'running', 'blocked'];

export function scanColgado(s: Pick<Scan, 'status' | 'created_at'>, ahora = Date.now()): boolean {
  return EN_MARCHA.includes(s.status) && ahora - new Date(s.created_at).getTime() > SCAN_COLGADO_MS;
}

// Cierra un scan colgado con lo que diga el Scanner: su resultado si terminó,
// y si no, "failed". Sin token (en local) lee el informe público, que no trae
// evidencia estructurada pero sí nota, resumen y análisis.
export async function rescataScan(db: SupabaseClient, scan: Scan): Promise<Scan> {
  if (apiConfigured()) {
    try {
      const { scan: sincronizado } = await syncStoredScan(db, scan);
      if (!EN_MARCHA.includes(sincronizado.status)) return sincronizado;
    } catch {
      // Se prueba la vía pública antes de darlo por perdido.
    }
  }
  try {
    const informe = await getReportByUrl(`https://b3s.fly.dev/report/${scan.scanner_job_id}`);
    if (informe.found && informe.scanId === scan.scanner_job_id) {
      return await persistImportedScan(db, scan.company_id, informe);
    }
  } catch {
    // Sin informe: se cierra abajo.
  }
  const { data, error } = await db
    .from('scans')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', scan.id)
    .select()
    .single();
  if (error) throw error;
  return data as Scan;
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
    rescatados.push(await rescataScan(db, s));
  }
  return { activo, rescatados };
}
