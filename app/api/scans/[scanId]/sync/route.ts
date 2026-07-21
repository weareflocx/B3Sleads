import { NextRequest, NextResponse } from 'next/server';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Scan } from '@/lib/types';

// Consulta el job remoto y materializa resultado + evidencia cuando termina.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
    const db = getServiceSupabase()!;
    const { data, error } = await db.from('scans').select('*').eq('id', scanId).single();
    if (error || !data) {
      return NextResponse.json({ error: 'Scan no encontrado' }, { status: 404 });
    }

    const scan = data as Scan;
    if (['ready', 'failed', 'cancelled'].includes(scan.status)) {
      return NextResponse.json({ ok: true, scan });
    }

    const updated = await syncStoredScan(db, scan);
    return NextResponse.json({ ok: true, scan: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
