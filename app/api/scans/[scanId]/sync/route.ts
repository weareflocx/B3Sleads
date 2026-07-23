import { NextRequest, NextResponse } from 'next/server';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { getReportByUrl } from '@/lib/brand3';
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

    try {
      const updated = await syncStoredScan(db, scan);
      return NextResponse.json({ ok: true, scan: updated });
    } catch (apiError) {
      // La API v1 encadena tres llamadas (estado + resultado + evidencia) y a
      // veces no cabe en el tiempo que da el hosting. Si el informe público ya
      // existe, el scan ha terminado: se cierra con esos datos en vez de
      // dejarlo colgado en "running" para siempre.
      const jobId = String(scan.scanner_job_id);
      const fallback = await getReportByUrl(`https://b3s.fly.dev/report/${jobId}`).catch(() => null);
      if (!fallback?.found) throw apiError;

      const { data: closed } = await db
        .from('scans')
        .update({
          status: 'ready',
          score: fallback.score,
          tldr: fallback.tldr,
          result_raw: fallback.raw,
          ui_url: fallback.uiUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scan.id)
        .select()
        .single();
      return NextResponse.json({ ok: true, scan: closed ?? scan, viaPublicReport: true });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
