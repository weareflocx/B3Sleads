import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { requireUser } from '../lib/auth';
import { PATCH as patchContact } from '../app/api/contacts/route';

const envNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LOCAL_AUTH_BYPASS',
  'NODE_ENV',
] as const;
const originalEnv = new Map<string, string | undefined>();
// NODE_ENV está tipado como solo lectura en los tipos de Next.
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  for (const name of envNames) {
    originalEnv.set(name, env[name]);
    delete env[name];
  }
});

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv.get(name);
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  originalEnv.clear();
});

function conSupabase() {
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
}

const sinSesion = async (): Promise<User | null> => null;

test('sin URL de Supabase (modo demo, sin datos reales) deja pasar', async () => {
  const auth = await requireUser(sinSesion);
  assert.deepEqual(auth, { email: null, name: null });
});

test('con URL pero sin clave anónima responde 503 en JSON', async () => {
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  const auth = await requireUser(sinSesion);
  assert.ok(auth instanceof Response);
  assert.equal(auth.status, 503);
  assert.match((await auth.json()).error, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test('sin sesión responde 401 en JSON y sin caché', async () => {
  conSupabase();
  const auth = await requireUser(sinSesion);
  assert.ok(auth instanceof Response);
  assert.equal(auth.status, 401);
  assert.equal(auth.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await auth.json(), { error: 'Sesión requerida: inicia sesión en /login.' });
});

test('fuera de una petición no hay cookies y responde 401', async () => {
  conSupabase();
  const auth = await requireUser();
  assert.ok(auth instanceof Response);
  assert.equal(auth.status, 401);
});

test('con sesión devuelve el email y el nombre del usuario', async () => {
  conSupabase();
  const usuario = { id: 'u1', email: 'ana@floc.test', user_metadata: { name: 'Ana' } } as unknown as User;
  const auth = await requireUser(async () => usuario);
  assert.deepEqual(auth, { email: 'ana@floc.test', name: 'Ana' });
});

test('LOCAL_AUTH_BYPASS deja pasar en desarrollo y nunca en producción', async () => {
  conSupabase();
  env.LOCAL_AUTH_BYPASS = 'true';
  env.NODE_ENV = 'development';
  const enDesarrollo = await requireUser(sinSesion);
  assert.ok(!(enDesarrollo instanceof Response));

  env.NODE_ENV = 'production';
  const enProduccion = await requireUser(sinSesion);
  assert.ok(enProduccion instanceof Response);
  assert.equal(enProduccion.status, 401);
});

test('una ruta del dashboard sin sesión responde 401 antes de leer el cuerpo', async () => {
  conSupabase();
  // Con el cuerpo inválido, si la comprobación no fuera la primera la ruta
  // respondería 500 al fallar req.json().
  const res = await patchContact(
    new NextRequest('https://leads.test/api/contacts', { method: 'PATCH', body: 'no es json' }),
  );
  assert.equal(res.status, 401);
});

const API_DIR = join(process.cwd(), 'app', 'api');

// Rutas sin esta barrera: la Agent API valida su propia clave, health es
// público y Eclipse es la campaña pública. founders queda fuera mientras
// /api/v1/leads la llame en proceso con la clave de la Agent API, sin sesión.
function excluida(ruta: string): boolean {
  return (
    ruta.startsWith('v1/') ||
    ruta.startsWith('health/') ||
    ruta.startsWith('eclipse/') ||
    ruta === 'founders/route.ts'
  );
}

function ficherosDeRuta(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return ficherosDeRuta(ruta);
    return /^route\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

test('cada handler de las rutas del dashboard llama a requireUser', () => {
  const sinBarrera: string[] = [];
  let revisados = 0;
  for (const fichero of ficherosDeRuta(API_DIR)) {
    const ruta = relative(API_DIR, fichero).split('\\').join('/');
    if (excluida(ruta)) continue;
    const codigo = readFileSync(fichero, 'utf8');
    assert.doesNotMatch(
      codigo,
      /export const (GET|POST|PUT|PATCH|DELETE)\b/,
      `${ruta}: este test solo reconoce handlers declarados como función`,
    );
    // OPTIONS (preflight de CORS) no lleva sesión y queda fuera.
    for (const trozo of codigo.split(/^export /m).slice(1)) {
      const metodo = /^(?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/.exec(trozo)?.[1];
      if (!metodo) continue;
      revisados += 1;
      if (!trozo.includes('requireUser(')) sinBarrera.push(`${ruta} ${metodo}`);
    }
  }
  assert.ok(revisados > 0, `no se encontró ninguna ruta en ${API_DIR}`);
  assert.deepEqual(sinBarrera, []);
});
