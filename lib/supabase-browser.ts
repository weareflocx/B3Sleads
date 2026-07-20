'use client';

import { createBrowserClient } from '@supabase/ssr';

// ¿Están configuradas las claves públicas de Supabase? Son NEXT_PUBLIC_*,
// así que se incrustan en el build: si faltaban al compilar (p.ej. en el
// deploy), aquí serán undefined y el login no puede funcionar.
export function authConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Cliente de navegador para Supabase Auth (login con email y Google).
// Solo usa la anon key pública; la sesión viaja en cookies y la valida
// el middleware en servidor. Lanza un error legible si falta la config,
// para que el login avise en vez de colgarse.
export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase no configurado en el build: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createBrowserClient(url, key);
}
