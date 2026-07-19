import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Email del usuario logueado (sesión de Supabase en cookies), para atribuir
// acciones como el alta de leads. null si no hay sesión o no hay Supabase.
export async function currentUserEmail(): Promise<string | null> {
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
    return user?.email ?? null;
  } catch {
    return null;
  }
}
