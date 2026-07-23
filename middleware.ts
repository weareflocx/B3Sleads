import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Protege el dashboard: sin sesión → /login. Público: la landing (/), el
// login y el callback de auth. Si Supabase no está configurado (modo demo),
// no hay auth que aplicar y se deja pasar todo.
const PUBLIC_PATHS = ['/', '/login', '/api/health'];

export async function middleware(request: NextRequest) {
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
