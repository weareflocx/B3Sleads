import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { signalMeta } from '@/lib/radar';
import type { Signal } from '@/lib/types';
import { agentRequestHash } from './auth';
import { AgentApiError } from './errors';

const migrationMissing = (code: string | undefined) =>
  code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205';

export async function createAgentSignal(options: {
  companyId: string;
  type: string;
  occurredAt: string;
  evidence: string;
  sourceUrl?: string;
  agentApiKeyId: string | null;
  agentName: string;
  keyFingerprint: string;
  idempotencyKey: string;
}): Promise<{
  signal: Signal;
  deduped: boolean;
  level: string;
  weight: number;
}> {
  if (isDemoMode()) {
    throw new AgentApiError(
      409,
      'demo_mode_read_only',
      'El modo demo permite lectura, pero no guarda mutaciones.',
    );
  }
  const meta = signalMeta(options.type);
  if (!meta) {
    throw new AgentApiError(422, 'invalid_signal_type', `Tipo de señal desconocido: ${options.type}.`);
  }
  const db = getServiceSupabase()!;
  const requestHash = agentRequestHash({
    operation: 'create_signal',
    company_id: options.companyId,
    type: meta.type,
    occurred_at: options.occurredAt,
    evidence: options.evidence,
    source_url: options.sourceUrl ?? null,
  });
  const lookup = () =>
    db
      .from('signals')
      .select('*')
      .eq('agent_key_fingerprint', options.keyFingerprint)
      .eq('idempotency_key', options.idempotencyKey)
      .maybeSingle();
  const existing = await lookup();
  if (existing.error && migrationMissing(existing.error.code)) {
    throw new AgentApiError(
      503,
      'agent_api_migration_required',
      'Aplica la migración de Agent API antes de crear señales.',
    );
  }
  if (existing.error) {
    throw new AgentApiError(500, 'signal_lookup_failed', 'No se pudo comprobar la idempotencia.');
  }
  if (existing.data) {
    const stored = existing.data as Signal & { agent_request_hash?: string | null };
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    return { signal: stored, deduped: true, level: meta.level, weight: meta.weight };
  }

  const { data, error } = await db
    .from('signals')
    .insert({
      company_id: options.companyId,
      type: meta.type,
      detail: {
        occurred_at: options.occurredAt,
        evidence: options.evidence,
        source_url: options.sourceUrl ?? null,
        manual: true,
        source: `api:${options.agentName}`,
      },
      detected_at: new Date().toISOString(),
      agent_key_fingerprint: options.keyFingerprint,
      idempotency_key: options.idempotencyKey,
      agent_request_hash: requestHash,
      agent_api_key_id: options.agentApiKeyId,
      agent_name: options.agentName,
    })
    .select()
    .single();
  if (error?.code === '23505') {
    const raced = await lookup();
    const stored = raced.data as (Signal & { agent_request_hash?: string | null }) | null;
    if (!stored) {
      throw new AgentApiError(409, 'idempotency_conflict', 'La request ya está en proceso.');
    }
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    return { signal: stored, deduped: true, level: meta.level, weight: meta.weight };
  }
  if (error) {
    throw new AgentApiError(500, 'signal_create_failed', 'No se pudo crear la señal.');
  }
  return { signal: data as Signal, deduped: false, level: meta.level, weight: meta.weight };
}
