import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Protege el dashboard: sin sesión → /login. Público: la landing (/), el
// login y el callback de auth. Si Supabase no está configurado (modo demo),
// no hay auth que aplicar y se deja pasar todo.
const PUBLIC_PATHS = ['/', '/login', '/api/health'];

// La Agent API (/api/v1) no usa la sesión del navegador: cada ruta valida su
// propia clave Bearer con scopes (lib/agent-api/auth).
const API_V1_PREFIX = '/api/v1';

// Modo microsite de campaña: un deploy en el que SOLO existe /eclipse. Todo
// lo demás (dashboard, login, Agent API) cae ahí mismo, así que un lead que
// aterriza en la campaña no tiene por dónde irse a otro sitio. Se puede
// activar de dos maneras, y con eso valen las dos formas de desplegarlo:
//
//   ECLIPSE_ONLY=1        -> el deploy ENTERO es la campaña. Para un sitio
//                            de Netlify aparte, importado del mismo repo.
//   ECLIPSE_HOSTS=a,b     -> solo esos dominios son la campaña; el resto del
//                            sitio sigue siendo B3S Leads. Para servir la
//                            campaña desde un alias de dominio del sitio que
//                            YA está desplegado, sin crear proyecto nuevo.
//
// Sin ninguna de las dos, el middleware se comporta igual que siempre y el
// Eclipse Scan queda detrás del login como cualquier otra ruta.
const SOLO_ECLIPSE = process.env.ECLIPSE_ONLY === '1';

const HOSTS_ECLIPSE = (process.env.ECLIPSE_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

// El host real detrás de la CDN de Netlify: x-forwarded-host manda, porque
// request.nextUrl.host puede venir ya reescrito. Se le quita el puerto.
function esHostDeCampana(request: NextRequest): boolean {
  if (!HOSTS_ECLIPSE.length) return false;
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .toLowerCase()
    .split(':')[0];
  return HOSTS_ECLIPSE.includes(host);
}

function esDelEclipse(path: string): boolean {
  return path === '/eclipse' || path.startsWith('/eclipse/') || path.startsWith('/api/eclipse');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // La puerta va la PRIMERA, antes incluso del bypass de /api/v1: en el
  // dominio de campaña no se abre nada más que el eclipse.
  if (SOLO_ECLIPSE || esHostDeCampana(request)) {
    if (esDelEclipse(pathname) || pathname.startsWith('/_next')) {
      return NextResponse.next();
    }
    const destino = request.nextUrl.clone();
    destino.pathname = '/eclipse';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  // Evita convertir un error de autenticación de la API en un redirect HTML.
  if (pathname.startsWith(API_V1_PREFIX)) {
    return NextResponse.next();
  }

  // Acceso directo para desarrollo local. NODE_ENV impide que una variable
  // olvidada pueda desactivar la autenticación en un build de producción.
  const localAuthBypass =
    process.env.NODE_ENV !== 'production' && process.env.LOCAL_AUTH_BYPASS === 'true';
  if (localAuthBypass) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // El Eclipse Scan NO es público aquí: vive en su propio sitio (ECLIPSE_ONLY).
  // En B3S Leads queda detrás del login como cualquier otra ruta, para que la
  // campaña tenga una sola URL y una sola tarjeta Open Graph.
  const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/auth');

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }
  // Con sesión, /login redirige al dashboard
  if (user && path === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/home';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Todo menos estáticos e imágenes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
