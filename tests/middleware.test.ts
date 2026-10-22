import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, middleware } from '../middleware';

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

test('sin sesión, solo /auth/callback y la Agent API se libran: lo que se les parece, no', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';

  for (const path of ['/auth/callback', '/api/v1', '/api/v1/leads']) {
    assert.ok(dejaPasar(await pedir(path)), path);
  }
  for (const path of ['/auth', '/authors', '/auth/otra']) {
    const pagina = await pedir(path);
    assert.equal(pagina.status, 307, path);
    assert.equal(new URL(pagina.headers.get('location') ?? '').pathname, '/login', path);
  }
  for (const path of ['/api/v1x', '/api/v10/leads', '/api/v1-interna']) {
    const api = await pedir(path);
    assert.equal(api.status, 401, path);
    assert.match((await api.json()).error, /Sesión requerida/, path);
  }
});

test('sin clave anónima, lo que solo se parece a una ruta pública también se cierra', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';

  assert.equal((await pedir('/authors')).status, 503);
  const api = await pedir('/api/v1x');
  assert.equal(api.status, 503);
  assert.match((await api.json()).error, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

// Si Next ejecuta el middleware para esa URL, con el mismo matcher que la build.
const pasaPorElMiddleware = (path: string) =>
  unstable_doesMiddlewareMatch({ config, url: `https://leads.test${path}` });

test('una página protegida con extensión de imagen en la ruta pasa por el middleware y va al login', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';

  for (const path of ['/companies/x.png', '/investors/x.svg', '/marcas/x.jpg', '/marcas/cliente.test/x.webp']) {
    assert.ok(pasaPorElMiddleware(path), path);
    const pagina = await pedir(path);
    assert.equal(pagina.status, 307, path);
    assert.equal(new URL(pagina.headers.get('location') ?? '').pathname, '/login', path);
  }
  // La API con extensión tampoco se lo salta: antes solo la frenaba requireUser.
  assert.ok(pasaPorElMiddleware('/api/logo/x.ico'));
  assert.equal((await pedir('/api/logo/x.ico')).status, 401);
});

test('una petición RSC a una página protegida con extensión de imagen también va al login', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';

  // Como una navegación desde dentro del dashboard: ese layout ya está montado
  // y no se vuelve a ejecutar, así que la barrera tiene que ser el middleware.
  const rsc = {
    rsc: '1',
    'next-router-state-tree': encodeURIComponent(
      JSON.stringify(['', { children: ['(dashboard)', { children: ['home', {}] }] }, null, null, true]),
    ),
  };
  for (const path of ['/companies/x.png', '/investors/x.svg', '/marcas/x.jpg', '/marcas/cliente.test/x.webp']) {
    const url = `https://leads.test${path}?_rsc=abc12`;
    assert.ok(unstable_doesMiddlewareMatch({ config, url, headers: rsc }), path);
    const res = await middleware(new NextRequest(url, { headers: rsc }));
    assert.equal(res.status, 307, path);
    assert.equal(new URL(res.headers.get('location') ?? '').pathname, '/login', path);
  }
});

test('los estáticos de verdad siguen sin pasar por el middleware', () => {
  for (const path of [
    '/_next/static/chunks/main.js',
    '/_next/image?url=%2Fmedia%2Fhero-b3scan.jpg&w=640&q=75',
    '/scanner/flujo.html',
    '/media/hero-b3scan.jpg',
    '/media/hero-b3scan.mp4',
    '/favicon.ico',
  ]) {
    assert.equal(pasaPorElMiddleware(path), false, path);
  }
});

// Lo que hace Next con una petición: ejecuta el middleware solo si el matcher
// coincide; si no, la sirve sin pasar por él (null).
const atender = async (path: string) => (pasaPorElMiddleware(path) ? pedir(path) : null);

test('/icon.svg, el favicon de la landing y del login, no pasa por el middleware: sin sesión no redirige', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';

  assert.equal(pasaPorElMiddleware('/icon.svg'), false);
  assert.equal((await atender('/icon.svg'))?.headers.get('location') ?? null, null);
  // Por el mismo camino, una página protegida sí va al login.
  assert.equal((await atender('/companies/x.png'))?.status, 307);
  // Es la exclusión la que lo salva: el middleware, si corriera, lo mandaría al login.
  assert.equal((await pedir('/icon.svg')).status, 307);
  // Exacta, como favicon.ico: lo que solo se le parece sí pasa por el middleware.
  for (const path of ['/icon.svg.png', '/companies/icon.svg']) {
    assert.ok(pasaPorElMiddleware(path), path);
  }
});
