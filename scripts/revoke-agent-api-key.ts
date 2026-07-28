import dotenv from 'dotenv';
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
  console.error('Uso: npm run agent:key:revoke -- --id <uuid>');
  process.exit(1);
}

async function main() {
  const id = argument('--id')?.trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    fail('--id debe ser el UUID que devolvió agent:key:create.');
  }

  const db = getServiceSupabase();
  if (!db) {
    fail('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  const { data, error } = await db
    .from('agent_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id, name')
    .maybeSingle();

  if (error) {
    fail(`no se pudo revocar la clave (${error.code ?? 'sin código'}).`);
  }
  if (!data) {
    fail('la clave no existe o ya estaba revocada.');
  }
  console.log(`Clave revocada: ${data.name} (${data.id})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
