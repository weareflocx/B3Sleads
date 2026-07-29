import { absoluteB3SUrl, apiConfigured, createScan, storedScanStatus } from '@/lib/brand3';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Company, Scan } from '@/lib/types';
import { agentRequestHash } from './auth';
import { AgentApiError } from './errors';

const migrationMissing = (code: string | undefined) =>
  code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205';

async function validateLeadCompany(companyId: string, leadId: string | undefined) {
  if (!leadId) return;
  const db = getServiceSupabase()!;
  const { data, error } = await db
    .from('leads')
    .select('id, company_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) {
    throw new AgentApiError(500, 'lead_lookup_failed', 'No se pudo leer el lead.');
  }
  if (!data) {
    throw new AgentApiError(404, 'lead_not_found', 'Lead no encontrado.');
  }
  if (data.company_id !== companyId) {
    throw new AgentApiError(
      422,
      'lead_company_mismatch',
      'El lead no pertenece a la compañía indicada.',
    );
  }
}

async function linkLead(companyId: string, leadId: string | undefined, scanId: string) {
  if (!leadId) return;
  const db = getServiceSupabase()!;
  const { data: lead, error: lookupError } = await db
    .from('leads')
    .select('id, company_id, scan_id')
    .eq('id', leadId)
    .maybeSingle();
  if (lookupError) {
    throw new AgentApiError(500, 'lead_lookup_failed', 'No se pudo leer el lead.');
  }
  if (!lead) {
    throw new AgentApiError(404, 'lead_not_found', 'Lead no encontrado.');
  }
  if (lead.company_id !== companyId) {
    throw new AgentApiError(
      422,
      'lead_company_mismatch',
      'El lead no pertenece a la compañía indicada.',
    );
  }
  if (lead.scan_id === scanId) return;

  const { data, error } = await db
    .from('leads')
    .update({ scan_id: scanId, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new AgentApiError(500, 'lead_scan_link_failed', 'No se pudo vincular el scan al lead.');
  }
  if (!data) {
    throw new AgentApiError(
      422,
      'lead_company_mismatch',
      'El lead no pertenece a la compañía indicada.',
    );
  }
}

export async function launchAgentScan(options: {
  companyId: string;
  leadId?: string;
  keyFingerprint: string;
  idempotencyKey: string;
}): Promise<{ scan: Scan; deduped: boolean; reason?: string }> {
  if (isDemoMode()) {
    throw new AgentApiError(
      409,
      'demo_mode_read_only',
      'El modo demo permite lectura, pero no puede lanzar scans.',
    );
  }
  if (!apiConfigured()) {
    throw new AgentApiError(
      503,
      'scanner_not_configured',
      'Configura B3S_SCANNER_API_TOKEN antes de lanzar scans.',
    );
  }

  const db = getServiceSupabase()!;
  const requestHash = agentRequestHash({
    operation: 'launch_scan',
    company_id: options.companyId,
    lead_id: options.leadId ?? null,
  });
  await validateLeadCompany(options.companyId, options.leadId);

  const existingRequest = await db
    .from('scans')
    .select('*')
    .eq('agent_key_fingerprint', options.keyFingerprint)
    .eq('idempotency_key', options.idempotencyKey)
    .maybeSingle();
  if (existingRequest.error && migrationMissing(existingRequest.error.code)) {
    throw new AgentApiError(
      503,
      'agent_api_migration_required',
      'Aplica la migración de Agent API antes de lanzar scans.',
    );
  }
  if (existingRequest.error) {
    throw new AgentApiError(500, 'scan_lookup_failed', 'No se pudo comprobar la idempotencia.');
  }
  if (existingRequest.data) {
    const stored = existingRequest.data as Scan & { agent_request_hash?: string | null };
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    const scan = stored as Scan;
    await linkLead(options.companyId, options.leadId, scan.id);
    return { scan, deduped: true, reason: 'idempotency_key' };
  }

  const { data: company, error: companyError } = await db
    .from('companies')
    .select('*')
    .eq('id', options.companyId)
    .maybeSingle();
  if (companyError) {
    throw new AgentApiError(500, 'company_lookup_failed', 'No se pudo leer la compañía.');
  }
  if (!company) {
    throw new AgentApiError(404, 'company_not_found', 'Compañía no encontrada.');
  }

  const { data: activeScan, error: activeError } = await db
    .from('scans')
    .select('*')
    .eq('company_id', options.companyId)
    .in('status', ['queued', 'running', 'blocked'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    throw new AgentApiError(500, 'scan_lookup_failed', 'No se pudo comprobar el scan activo.');
  }
  if (activeScan) {
    const scan = activeScan as Scan;
    await linkLead(options.companyId, options.leadId, scan.id);
    return { scan, deduped: true, reason: 'active_scan' };
  }

  const typedCompany = company as Company;
  const job = await createScan(`https://${typedCompany.domain}`, {
    brandName: typedCompany.name,
    allowDegradedFallback: true,
    idempotencyKey: options.idempotencyKey,
  });

  const insert = await db
    .from('scans')
    .insert({
      company_id: options.companyId,
      scanner_job_id: job.id,
      status: storedScanStatus(job.status),
      ui_url: absoluteB3SUrl(job.links.report),
      agent_key_fingerprint: options.keyFingerprint,
      idempotency_key: options.idempotencyKey,
      agent_request_hash: requestHash,
    })
    .select()
    .single();

  if (insert.error?.code === '23505') {
    const { data: raced } = await db
      .from('scans')
      .select('*')
      .eq('agent_key_fingerprint', options.keyFingerprint)
      .eq('idempotency_key', options.idempotencyKey)
      .single();
    if (!raced) {
      throw new AgentApiError(409, 'idempotency_conflict', 'La request ya está en proceso.');
    }
    const stored = raced as Scan & { agent_request_hash?: string | null };
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    const scan = stored as Scan;
    await linkLead(options.companyId, options.leadId, scan.id);
    return { scan, deduped: true, reason: 'concurrent_request' };
  }
  if (insert.error) {
    throw new AgentApiError(500, 'scan_create_failed', 'No se pudo guardar el scan.');
  }

  const rawScan = insert.data as Scan;
  const scan =
    job.status === 'completed' ? (await syncStoredScan(db, rawScan)).scan : rawScan;
  await linkLead(options.companyId, options.leadId, scan.id);
  return { scan, deduped: false };
}
