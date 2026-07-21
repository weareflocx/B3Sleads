import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env.local');

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function upsert(lines, key, value) {
  const serialized = `${key}=${JSON.stringify(value)}`;
  const index = lines.findIndex((line) => new RegExp(`^${key}\\s*=`).test(line));
  if (index >= 0) lines[index] = serialized;
  else lines.push(serialized);
}

const statusOutput = execFileSync(
  'npx',
  ['--no-install', 'supabase', 'status', '-o', 'env'],
  { cwd: projectRoot, encoding: 'utf8' },
);
const local = parseEnv(statusOutput);
if (!local.API_URL || !(local.PUBLISHABLE_KEY || local.ANON_KEY)) {
  throw new Error('Supabase local no está activo. Ejecuta npm run supabase:start primero.');
}

const existingText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const existing = parseEnv(existingText);
const siblingB3SEnvPath = path.resolve(projectRoot, '../B3S/.env');
const siblingB3S = existsSync(siblingB3SEnvPath)
  ? parseEnv(readFileSync(siblingB3SEnvPath, 'utf8'))
  : {};

const values = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SECRET_KEY || local.SERVICE_ROLE_KEY,
  LOCAL_AUTH_BYPASS: 'true',
  B3S_SCANNER_API_URL:
    existing.B3S_SCANNER_API_URL || 'http://127.0.0.1:8000/api/v1',
};
const scannerToken =
  existing.B3S_SCANNER_API_TOKEN ||
  process.env.B3S_SCANNER_API_TOKEN ||
  siblingB3S.BRAND3_SCANNER_API_TOKEN;
if (scannerToken) values.B3S_SCANNER_API_TOKEN = scannerToken;

const lines = existingText
  ? existingText.trimEnd().split(/\r?\n/)
  : ['# Generado por npm run supabase:env. No commitear.'];
for (const [key, value] of Object.entries(values)) {
  if (!value) throw new Error(`Supabase status no devolvió ${key}`);
  upsert(lines, key, value);
}
writeFileSync(envPath, `${lines.join('\n')}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);

console.log(`Configurado ${envPath}`);
console.log(`Variables: ${Object.keys(values).join(', ')}`);
