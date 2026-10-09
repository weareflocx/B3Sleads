import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export interface SessionUser {
  email: string | null;
  name: string | null; // user_metadata.name (editable desde el perfil)
}

// Los mismos textos que devuelve el middleware: los clientes muestran json.error.
const SESION_REQUERIDA = 'Sesión requerida: inicia sesión en /login.';
const AUTH_NO_CONFIGURADA =
  'Autenticación no configurada: falta NEXT_PUBLIC_SUPABASE_ANON_KEY en este despliegue.';
const NO_STORE = { 'cache-control': 'no-store' };

function aSessionUser(user: User | null): SessionUser {
  const meta = (user?.user_metadata ?? {}) as { name?: string };
  return { email: user?.email ?? null, name: meta.name ?? null };
}

// Usuario de la sesión de Supabase en cookies. null si no hay sesión, si no
// hay Supabase configurado o si falla la comprobación: nunca lanza.
async function sessionUser(): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// Usuario logueado (sesión de Supabase en cookies). Todo null si no hay
// sesión o no hay Supabase configurado.
export async function currentUser(): Promise<SessionUser> {
  return aSessionUser(await sessionUser());
}

// Email del usuario logueado, para atribuir acciones (alta de leads).
export async function currentUserEmail(): Promise<string | null> {
  return (await currentUser()).email;
}

// Segunda barrera de las rutas /api del dashboard, por si el middleware no
// llega a correr (su matcher deja fuera, por ejemplo, /api/logo/x.ico).
// Sigue el mismo orden que el middleware: acceso directo de desarrollo,
// modo demo sin Supabase, 503 sin clave anónima y 401 sin sesión.
// Uso: const auth = await requireUser(); if (auth instanceof Response) return auth;
// `cargar` solo existe para los tests.
export async function requireUser(
  cargar: () => Promise<User | null> = sessionUser,
): Promise<SessionUser | NextResponse> {
  // NODE_ENV se lee literal, como en el middleware, para que el build de
  // producción lo fije y una variable olvidada no pueda abrir la API.
  if (process.env.NODE_ENV !== 'production' && process.env.LOCAL_AUTH_BYPASS === 'true') {
    return currentUser();
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { email: null, name: null };
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: AUTH_NO_CONFIGURADA }, { status: 503, headers: NO_STORE });
  }
  const user = await cargar();
  if (!user) {
    return NextResponse.json({ error: SESION_REQUERIDA }, { status: 401, headers: NO_STORE });
  }
  return aSessionUser(user);
}
