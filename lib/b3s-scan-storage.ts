import type { SupabaseClient } from '@supabase/supabase-js';
import {
  absoluteB3SUrl,
  getEvidence,
  getResult,
  getScanStatus,
  storedScanStatus,
  storedTldr,
  type B3SScanEvidence,
  type B3SScanResult,
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
export async function syncStoredScan(db: SupabaseClient, scan: Scan): Promise<Scan> {
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
  return data as Scan;
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
    completed_at: new Date().toISOString(),
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
