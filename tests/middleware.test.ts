import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const envNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LOCAL_AUTH_BYPASS',
] as const;
const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of envNames) {
    originalEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

const pedir = (path: string) => middleware(new NextRequest(`https://leads.test${path}`));
const dejaPasar = (res: Response) => res.headers.get('x-middleware-next') === '1';

test('sin URL de Supabase (modo demo, sin datos reales) deja pasar todo', async () => {
  for (const path of ['/home', '/api/leads']) {
    assert.ok(dejaPasar(await pedir(path)), path);
  }
});

test('con URL pero sin clave anónima se cierra aunque haya service role key', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba';

  const pagina = await pedir('/home');
  assert.equal(pagina.status, 503);

  const api = await pedir('/api/leads');
  assert.equal(api.status, 503);
  assert.match((await api.json()).error, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

  for (const path of ['/', '/login', '/api/health', '/auth/callback']) {
    assert.ok(dejaPasar(await pedir(path)), path);
  }
});

test('sin sesión, la API responde 401 en JSON y las páginas van al login', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';

  const api = await pedir('/api/leads');
  assert.equal(api.status, 401);
  assert.match((await api.json()).error, /Sesión requerida/);

  const pagina = await pedir('/home');
  assert.equal(pagina.status, 307);
  assert.equal(new URL(pagina.headers.get('location') ?? '').pathname, '/login');

  // La Agent API valida su propia clave: el middleware no la toca.
  assert.ok(dejaPasar(await pedir('/api/v1/leads')));
});
