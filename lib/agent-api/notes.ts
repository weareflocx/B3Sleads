import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Note, NoteKind } from '@/lib/types';
import { agentRequestHash } from './auth';
import { AgentApiError } from './errors';
import { findLead } from './leads';

const migrationMissing = (code: string | undefined) =>
  code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205';

async function touchLeadAndContact(
  leadId: string,
  contactId: string | null,
  text: string,
): Promise<void> {
  const db = getServiceSupabase()!;
  const now = new Date().toISOString();
  if (contactId) {
    const { error } = await db
      .from('contacts')
      .update({ notes: text, last_touch_at: now })
      .eq('id', contactId);
    if (error) {
      throw new AgentApiError(500, 'contact_touch_failed', 'No se pudo actualizar el contacto.');
    }
  }
  const { error } = await db.from('leads').update({ updated_at: now }).eq('id', leadId);
  if (error) {
    throw new AgentApiError(500, 'lead_touch_failed', 'No se pudo actualizar la actividad del lead.');
  }
}

export async function createAgentNote(options: {
  leadId: string;
  body: string;
  kind: NoteKind;
  agentApiKeyId: string | null;
  agentName: string;
  keyFingerprint: string;
  idempotencyKey: string;
}): Promise<{ note: Note; deduped: boolean }> {
  if (isDemoMode()) {
    throw new AgentApiError(
      409,
      'demo_mode_read_only',
      'El modo demo permite lectura, pero no guarda mutaciones.',
    );
  }

  const lead = await findLead(options.leadId);
  const db = getServiceSupabase()!;
  const requestHash = agentRequestHash({
    operation: 'create_note',
    lead_id: options.leadId,
    body: options.body,
    kind: options.kind,
  });

  const existingQuery = await db
    .from('notes')
    .select('*')
    .eq('agent_key_fingerprint', options.keyFingerprint)
    .eq('idempotency_key', options.idempotencyKey)
    .maybeSingle();
  if (existingQuery.error && migrationMissing(existingQuery.error.code)) {
    throw new AgentApiError(
      503,
      'agent_api_migration_required',
      'Aplica la migración de Agent API antes de crear notas.',
    );
  }
  if (existingQuery.error) {
    throw new AgentApiError(500, 'note_lookup_failed', 'No se pudo comprobar la idempotencia.');
  }
  if (existingQuery.data) {
    const stored = existingQuery.data as Note & { agent_request_hash?: string | null };
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    return { note: stored as Note, deduped: true };
  }

  const { data, error } = await db
    .from('notes')
    .insert({
      lead_id: options.leadId,
      company_id: lead.company?.id ?? null,
      body: options.body,
      kind: options.kind,
      agent_key_fingerprint: options.keyFingerprint,
      idempotency_key: options.idempotencyKey,
      agent_request_hash: requestHash,
      agent_api_key_id: options.agentApiKeyId,
      agent_name: options.agentName,
    })
    .select()
    .single();

  if (error?.code === '23505') {
    const { data: raced } = await db
      .from('notes')
      .select('*')
      .eq('agent_key_fingerprint', options.keyFingerprint)
      .eq('idempotency_key', options.idempotencyKey)
      .single();
    if (!raced) {
      throw new AgentApiError(409, 'idempotency_conflict', 'La request ya está en proceso.');
    }
    const stored = raced as Note & { agent_request_hash?: string | null };
    if (stored.agent_request_hash !== requestHash) {
      throw new AgentApiError(
        409,
        'idempotency_key_reused',
        'Idempotency-Key ya se usó con una petición distinta.',
      );
    }
    return { note: stored as Note, deduped: true };
  }
  if (error) {
    throw new AgentApiError(500, 'note_create_failed', 'No se pudo crear la nota.');
  }

  const note = data as Note;
  await touchLeadAndContact(options.leadId, lead.contact?.id ?? null, note.body);
  return { note, deduped: false };
}
