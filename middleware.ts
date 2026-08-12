import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Protege el dashboard: sin sesión → /login. Público: la landing (/), el
// login y el callback de auth. Si Supabase no está configurado (modo demo),
// no hay auth que aplicar y se deja pasar todo.
const PUBLIC_PATHS = ['/', '/login', '/api/health'];

// La Agent API (/api/v1) no usa la sesión del navegador: cada ruta valida su
// propia clave Bearer con scopes (lib/agent-api/auth).
const API_V1_PREFIX = '/api/v1';

// Modo microsite de campaña. El mismo repo alimenta DOS sitios de Netlify:
//   - B3S Leads (sin la variable): se comporta exactamente igual que siempre,
//     y el Eclipse Scan queda detrás del login como cualquier otra ruta.
//   - El sitio del eclipse (ECLIPSE_ONLY=1): solo existe /eclipse. Todo lo
//     demás (dashboard, login, Agent API) cae ahí mismo. Un lead que aterriza
//     en la campaña no tiene por dónde irse a otro sitio.
// La puerta va la PRIMERA, antes incluso del bypass de /api/v1: en el dominio
// de campaña no se abre nada más que el eclipse.
const SOLO_ECLIPSE = process.env.ECLIPSE_ONLY === '1';

function esDelEclipse(path: string): boolean {
  return path === '/eclipse' || path.startsWith('/eclipse/') || path.startsWith('/api/eclipse');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (SOLO_ECLIPSE) {
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
