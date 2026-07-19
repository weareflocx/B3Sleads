'use client';

import { createBrowserClient } from '@supabase/ssr';

// Cliente de navegador para Supabase Auth (login con email y Google).
// Solo usa la anon key pública; la sesión viaja en cookies y la valida
// el middleware en servidor.
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
