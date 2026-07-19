import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface SessionUser {
  email: string | null;
  name: string | null; // user_metadata.name (editable desde el perfil)
}

// Usuario logueado (sesión de Supabase en cookies). Todo null si no hay
// sesión o no hay Supabase configurado.
export async function currentUser(): Promise<SessionUser> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { email: null, name: null };
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = (user?.user_metadata ?? {}) as { name?: string };
    return { email: user?.email ?? null, name: meta.name ?? null };
  } catch {
    return { email: null, name: null };
  }
}

// Email del usuario logueado, para atribuir acciones (alta de leads).
export async function currentUserEmail(): Promise<string | null> {
  return (await currentUser()).email;
}
