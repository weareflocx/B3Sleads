import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { AGENT_SCOPES, hashAgentApiKey, type AgentScope } from '../lib/agent-api/auth';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: '.env.local' });
dotenv.config();

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  console.error(
    'Uso: npm run agent:key:create -- --name "mi-agente" [--scopes leads:read,notes:write] [--expires-days 90] [--created-by email]',
  );
  process.exit(1);
}

function parseScopes(raw: string | undefined): AgentScope[] {
  const scopes = (raw ?? 'leads:read')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const invalid = scopes.filter((scope) => !AGENT_SCOPES.includes(scope as AgentScope));
  if (invalid.length > 0) {
    fail(`scopes desconocidos: ${invalid.join(', ')}. Permitidos: ${AGENT_SCOPES.join(', ')}`);
  }
  return [...new Set(scopes)] as AgentScope[];
}

async function main() {
  const name = argument('--name')?.trim();
  if (!name || name.length > 100) {
    fail('--name es obligatorio y no puede superar 100 caracteres.');
  }

  const scopes = parseScopes(argument('--scopes'));
  const expiresDaysRaw = argument('--expires-days');
  const expiresDays = expiresDaysRaw === undefined ? 90 : Number(expiresDaysRaw);
  if (
    (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 3650)
  ) {
    fail('--expires-days debe ser un entero entre 1 y 3650.');
  }

  const db = getServiceSupabase();
  if (!db) {
    fail('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  const token = `b3s_live_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await db
    .from('agent_api_keys')
    .insert({
      name,
      token_prefix: token.slice(0, 17),
      token_hash: hashAgentApiKey(token),
      scopes,
      created_by_email: argument('--created-by')?.trim().toLowerCase() || null,
      expires_at: expiresAt,
    })
    .select('id, token_prefix')
    .single();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      fail('la tabla agent_api_keys no existe; aplica primero la migración de Agent API.');
    }
    fail(`no se pudo crear la clave (${error.code ?? 'sin código'}).`);
  }

  console.log('Clave creada. Cópiala ahora: no volverá a mostrarse.');
  console.log(token);
  console.log(`ID: ${data.id}`);
  console.log(`Prefijo: ${data.token_prefix}`);
  console.log(`Scopes: ${scopes.join(', ')}`);
  console.log(`Caduca: ${expiresAt}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
