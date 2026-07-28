import { getServiceSupabase } from '@/lib/supabase';
import type { AgentPrincipal, AgentScope } from './auth';
import { AgentApiError } from './errors';

type RateLimitRule = {
  limit: number;
  windowSeconds: number;
};

export const AGENT_RATE_LIMITS: Record<AgentScope, RateLimitRule> = {
  'leads:read': { limit: 120, windowSeconds: 60 },
  'leads:write': { limit: 30, windowSeconds: 60 },
  'notes:write': { limit: 60, windowSeconds: 60 },
  'signals:write': { limit: 30, windowSeconds: 60 },
  'scans:write': { limit: 10, windowSeconds: 3600 },
};

type LocalCounter = {
  count: number;
  expiresAt: number;
};

const localCounters = new Map<string, LocalCounter>();

function rateLimitError(rule: RateLimitRule, retryAfterSeconds: number): AgentApiError {
  return new AgentApiError(
    429,
    'rate_limit_exceeded',
    'La credencial ha superado la cuota de esta operación.',
    {
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
      retry_after_seconds: retryAfterSeconds,
    },
    retryAfterSeconds,
  );
}

function consumeLocal(
  fingerprint: string,
  scope: AgentScope,
  rule: RateLimitRule,
): void {
  const now = Date.now();
  const windowStart = Math.floor(now / (rule.windowSeconds * 1000));
  const key = `${fingerprint}:${scope}:${windowStart}`;
  const current = localCounters.get(key);
  const count = (current?.count ?? 0) + 1;
  const expiresAt = (windowStart + 1) * rule.windowSeconds * 1000;
  localCounters.set(key, { count, expiresAt });

  if (localCounters.size > 1000) {
    for (const [storedKey, value] of localCounters) {
      if (value.expiresAt <= now) localCounters.delete(storedKey);
    }
  }

  if (count > rule.limit) {
    throw rateLimitError(rule, Math.max(1, Math.ceil((expiresAt - now) / 1000)));
  }
}

export async function enforceAgentRateLimit(
  principal: AgentPrincipal,
  scopes: AgentScope[],
): Promise<void> {
  const scope = scopes[0];
  if (!scope) return;
  const rule = AGENT_RATE_LIMITS[scope];
  const db = getServiceSupabase();

  // Permite probar la API contra los datos demo sin levantar Postgres. En una
  // instalación live siempre se usa el contador atómico y compartido.
  if (!db) {
    consumeLocal(principal.keyFingerprint, scope, rule);
    return;
  }

  const { data, error } = await db
    .rpc('consume_agent_api_quota', {
      p_key_fingerprint: principal.keyFingerprint,
      p_bucket: scope,
      p_window_seconds: rule.windowSeconds,
      p_limit: rule.limit,
    })
    .single();

  if (error) {
    const migrationMissing =
      error.code === '42883' || error.code === 'PGRST202' || error.code === 'PGRST205';
    throw new AgentApiError(
      503,
      migrationMissing ? 'agent_api_migration_required' : 'rate_limit_unavailable',
      migrationMissing
        ? 'Aplica la migración de Agent API antes de usarla contra datos live.'
        : 'No se pudo comprobar la cuota de la credencial.',
    );
  }

  const result = data as {
    is_allowed: boolean;
    current_count: number;
    retry_after_seconds: number;
  };
  if (!result.is_allowed) {
    throw rateLimitError(rule, result.retry_after_seconds);
  }
}
