import { NextResponse } from 'next/server';
import { searchConfigured } from '@/lib/funding-discovery';

// Semáforo de configuración. Público a propósito (ver middleware): permite
// diagnosticar un despliegue sin entrar al panel del hosting. Solo dice si
// cada pieza está configurada, jamás expone un valor.
export async function GET() {
  return NextResponse.json({
    ok: true,
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    // La URL ya no se configura (se asume b3s.fly.dev/api/v1): lo único que
    // decide si se puede lanzar un scan es el token.
    scannerApi: Boolean(
      process.env.B3S_SCANNER_API_TOKEN?.trim() ||
        process.env.BRAND3_SCANNER_API_TOKEN?.trim() ||
        process.env.BRAND3_TOKEN?.trim(),
    ),
    webSearch: searchConfigured(),
  });
}
