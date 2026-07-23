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
    scannerApi: Boolean(
      process.env.B3S_SCANNER_API_URL?.trim() &&
        (process.env.B3S_SCANNER_API_TOKEN?.trim() ||
          process.env.BRAND3_SCANNER_API_TOKEN?.trim() ||
          process.env.BRAND3_TOKEN?.trim()),
    ),
    webSearch: searchConfigured(),
  });
}
