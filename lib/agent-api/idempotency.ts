import { getServiceSupabase } from '@/lib/supabase';
import { agentRequestHash, type AgentPrincipal } from './auth';
import type { CompatibleAgentHandlerResult } from './handler';
import { AgentApiError } from './errors';

type StoredRequest = {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
  completed_at: string | null;
};

const migrationMissing = (code: string | undefined) =>
  code === '42P01' || code === 'PGRST204' || code === 'PGRST205';

export async function runIdempotentAgentOperation(options: {
  principal: AgentPrincipal;
  operation: string;
  idempotencyKey?: string;
  payload: unknown;
  execute: () => Promise<CompatibleAgentHandlerResult>;
}): Promise<CompatibleAgentHandlerResult> {
  if (!options.idempotencyKey) return options.execute();

  const db = getServiceSupabase();
  if (!db) return options.execute();
  const requestHash = agentRequestHash(options.payload);
  const identity = {
    agent_key_fingerprint: options.principal.keyFingerprint,
    operation: options.operation,
    idempotency_key: options.idempotencyKey,
  };

  const reservation = await db
    .from('agent_api_requests')
    .insert({ ...identity, request_hash: requestHash })
    .select('request_hash')
    .single();

  if (reservation.error?.code === '23505') {
    const { data, error } = await db
      .from('agent_api_requests')
      .select('request_hash, response_status, response_body, completed_at')
      .match(identity)
      .single();
    if (error || !data) {
      throw new AgentApiError(409, 'idempotency_conflict', 'La request ya está en proceso.');
    }
    const stored = data as StoredRequest;
    if (stored.request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    if (!stored.completed_at) {
      throw new AgentApiError(
        409,
        'idempotency_in_progress',
        'La request con esta Idempotency-Key todavía está en proceso.',
      );
    }
    return {
      body: stored.response_body,
      status: stored.response_status ?? 200,
      headers: { 'x-idempotent-replay': 'true' },
    };
  }
  if (reservation.error) {
    throw new AgentApiError(
      503,
      migrationMissing(reservation.error.code)
        ? 'agent_api_migration_required'
        : 'idempotency_unavailable',
      migrationMissing(reservation.error.code)
        ? 'Aplica la migración de Agent API antes de usar idempotencia.'
        : 'No se pudo reservar la operación idempotente.',
    );
  }

  let result: CompatibleAgentHandlerResult;
  try {
    result = await options.execute();
  } catch (error) {
    await db.from('agent_api_requests').delete().match(identity);
    throw error;
  }

  // Si el efecto ya ocurrió y falla el guardado, conservamos la reserva en
  // estado "processing". Así un retry no puede repetir la mutación.
  const { error } = await db
    .from('agent_api_requests')
    .update({
      response_status: result.status ?? 200,
      response_body: result.body,
      completed_at: new Date().toISOString(),
    })
    .match(identity);
  if (error) {
    throw new AgentApiError(
      500,
      'idempotency_store_failed',
      'La operación terminó, pero no se pudo guardar su respuesta idempotente.',
    );
  }
  return result;
}
