import { getServiceSupabase } from '@/lib/supabase';
import type { AgentRequestContext } from './handler';

export async function recordAgentAction(
  context: AgentRequestContext,
  action: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
  },
): Promise<void> {
  const db = getServiceSupabase();
  if (!db) return;
  try {
    const { error } = await db.from('agent_api_actions').insert({
      agent_api_key_id: context.principal.id,
      agent_key_fingerprint: context.principal.keyFingerprint,
      agent_name: context.principal.name,
      action: action.action,
      resource_type: action.resourceType,
      resource_id: action.resourceId ?? null,
      request_id: context.requestId,
    });
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
      console.error(`[agent-api:${context.requestId}] audit failed: ${error.code}`);
    }
  } catch {
    // La auditoría no convierte una mutación completada en un falso fallo.
  }
}
