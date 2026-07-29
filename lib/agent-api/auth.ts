import { createHash, timingSafeEqual } from 'node:crypto';
import { getServiceSupabase } from '@/lib/supabase';
import { AgentApiError } from './errors';

export const AGENT_SCOPES = [
  'leads:read',
  'leads:write',
  'notes:write',
  'signals:write',
  'scans:write',
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface AgentPrincipal {
  id: string | null;
  name: string;
  scopes: string[];
  keyFingerprint: string;
  source: 'environment' | 'legacy_environment' | 'database';
}

type StoredAgentKey = {
  id: string;
  name: string;
  scopes: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export function hashAgentApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function agentKeyFingerprint(token: string): string {
  return hashAgentApiKey(token).slice(0, 16);
}

export function agentRequestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization')?.trim() ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || request.headers.get('x-api-key')?.trim() || '';
  if (!token) {
    throw new AgentApiError(
      401,
      'missing_api_key',
      'Incluye la credencial en Authorization: Bearer <token>.',
    );
  }
  // Compatibilidad temporal con las claves v1 existentes. Las nuevas claves
  // generadas por B3S tienen mucha más entropía y no dependen de este mínimo.
  if (token.length < 16) {
    throw new AgentApiError(401, 'invalid_api_key', 'La credencial no es válida.');
  }
  return token;
}

function legacyAgent(token: string): { name: string } | null {
  const raw = process.env.B3SLEADS_API_KEYS?.trim();
  if (!raw) return null;
  for (const entry of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    const name = separator > 0 ? entry.slice(0, separator).trim() : 'agente';
    const key = separator > 0 ? entry.slice(separator + 1).trim() : entry;
    if (key.length >= 16 && safeEqual(token, key)) return { name };
  }
  return null;
}

export function agentApiConfigured(): boolean {
  return Boolean(
    process.env.B3S_AGENT_API_KEY?.trim() ||
      process.env.B3SLEADS_API_KEYS?.trim() ||
      getServiceSupabase(),
  );
}

export function requireAgentScopes(principal: AgentPrincipal, required: AgentScope[]): void {
  const granted = new Set(principal.scopes);
  const missing = required.filter((scope) => !granted.has('*') && !granted.has(scope));
  if (missing.length > 0) {
    throw new AgentApiError(403, 'insufficient_scope', 'La credencial no permite esta operación.', {
      required: missing,
    });
  }
}

export async function authenticateAgentRequest(request: Request): Promise<AgentPrincipal> {
  const token = bearerToken(request);
  const fingerprint = agentKeyFingerprint(token);
  const envToken = process.env.B3S_AGENT_API_KEY?.trim();

  if (envToken && safeEqual(token, envToken)) {
    return {
      id: null,
      name: 'environment-agent',
      scopes: [...AGENT_SCOPES],
      keyFingerprint: fingerprint,
      source: 'environment',
    };
  }

  const legacy = legacyAgent(token);
  if (legacy) {
    return {
      id: null,
      name: legacy.name,
      scopes: [...AGENT_SCOPES],
      keyFingerprint: fingerprint,
      source: 'legacy_environment',
    };
  }

  const db = getServiceSupabase();
  if (!db) {
    throw new AgentApiError(
      503,
      'agent_api_not_configured',
      'Configura B3S_AGENT_API_KEY o Supabase con la migración de Agent API.',
    );
  }

  const tokenHash = hashAgentApiKey(token);
  const { data, error } = await db
    .from('agent_api_keys')
    .select('id, name, scopes, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    const missingMigration = error.code === '42P01' || error.code === 'PGRST205';
    throw new AgentApiError(
      503,
      missingMigration ? 'agent_api_migration_required' : 'agent_api_unavailable',
      missingMigration
        ? 'Aplica la migración de Agent API antes de usar credenciales persistidas.'
        : 'No se pudo validar la credencial.',
    );
  }

  const stored = data as StoredAgentKey | null;
  if (!stored || stored.revoked_at) {
    throw new AgentApiError(401, 'invalid_api_key', 'La credencial no es válida.');
  }
  if (stored.expires_at && new Date(stored.expires_at).getTime() <= Date.now()) {
    throw new AgentApiError(401, 'expired_api_key', 'La credencial ha caducado.');
  }

  // La telemetría de uso nunca debe tumbar una request válida.
  try {
    await db
      .from('agent_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', stored.id);
  } catch {
    // La autenticación ya terminó; last_used_at es telemetría auxiliar.
  }

  return {
    id: stored.id,
    name: stored.name,
    scopes: stored.scopes ?? [],
    keyFingerprint: fingerprint,
    source: 'database',
  };
}
