import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Protege el dashboard: sin sesión → /login, y las rutas /api → 401. Público:
// la landing (/), el login y el callback de auth. Sin URL de Supabase la app
// está en modo demo, sin datos reales, y se deja pasar todo.
const PUBLIC_PATHS = ['/', '/login', '/api/health'];

// La Agent API (/api/v1) no usa la sesión del navegador: cada ruta valida su
// propia clave Bearer con scopes (lib/agent-api/auth).
const API_V1_PREFIX = '/api/v1';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Evita convertir un error de autenticación de la API en un redirect HTML.
  if (pathname.startsWith(API_V1_PREFIX)) {
    return NextResponse.next();
  }

  // Acceso directo para desarrollo local. NODE_ENV impide que una variable
  // olvidada pueda desactivar la autenticación en un build de producción.
  const localAuthBypass =
    process.env.NODE_ENV !== 'production' && process.env.LOCAL_AUTH_BYPASS === 'true';
  if (localAuthBypass) return NextResponse.next();

  // El Eclipse Scan NO es público aquí: vive en su propio sitio (ECLIPSE_ONLY).
  // En B3S Leads queda detrás del login como cualquier otra ruta, para que la
  // campaña tenga una sola URL y una sola tarjeta Open Graph.
  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) return NextResponse.next();
  // Con URL pero sin clave anónima no se puede comprobar la sesión, y la
  // service role key puede seguir dando acceso a datos reales: se cierra.
  if (!key) {
    if (isPublic) return NextResponse.next();
    const mensaje =
      'Autenticación no configurada: falta NEXT_PUBLIC_SUPABASE_ANON_KEY en este despliegue.';
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: mensaje }, { status: 503 })
      : new NextResponse(mensaje, { status: 503 });
  }

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
  const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/auth');

  if (!user && !isPublic) {
    // Una llamada a la API sin sesión recibe un 401 en JSON, no el HTML del login.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Sesión requerida: inicia sesión en /login.' },
        { status: 401 },
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }
  // Con sesión, /login redirige al dashboard
  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/home';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Todo menos estáticos e imágenes, y la carpeta /scanner, que guarda la
  // animática del Scanner que se ve en la landing pública: sin esto un
  // visitante anónimo recibía el login dentro del hueco de la película. Es
  // una carpeta de archivos estáticos, sin rutas de la app detrás. Igual
  // /media, con el vídeo de fondo de la landing (un .mp4 no es imagen y
  // también acababa en el login).
  matcher: ['/((?!_next/static|_next/image|scanner/|media/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
