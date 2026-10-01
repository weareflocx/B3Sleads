import { NextRequest, NextResponse } from 'next/server';
import { esInformePublico, syncStoredScan } from '@/lib/b3s-scan-storage';
import { apiConfigured, B3SApiError, getPublicReport } from '@/lib/brand3';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Scan } from '@/lib/types';
import type { ScanJob } from '@/lib/brand3';

// La API reporta el progreso como fracción 0..1 (así lo fija su OpenAPI).
// Aquí se pasa a 0..100 y se acota a 95 mientras corre: una barra llena con
// el scan aún en marcha miente. Si no hay número, se estima por fases.
function pctFromJob(job: ScanJob): number | null {
  if (typeof job.progress === 'number' && job.progress > 0) {
    return Math.min(95, Math.max(2, Math.round(job.progress * 100)));
  }
  const phases = job.phases ?? [];
  if (phases.length) {
    const done = phases.filter((f) => /complete|done|finish|ok/i.test(f.state ?? '')).length;
    const active = phases.some((f) => /running|progress|active|curso/i.test(f.state ?? '')) ? 0.5 : 0;
    return Math.min(95, Math.round(((done + active) / phases.length) * 100));
  }
  return null;
}

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
    // Un scan cerrado por la vía pública se intenta completar por la API
    // (evidencia estructurada). El resto de cerrados no se tocan.
    const mejorar = esInformePublico(scan);
    if (['ready', 'failed', 'cancelled'].includes(scan.status) && !mejorar) {
      return NextResponse.json({ ok: true, scan });
    }
    if (mejorar && !apiConfigured()) return NextResponse.json({ ok: true, scan });

    try {
      // 4 s para el estado y 5 s para resultado y evidencia (en paralelo):
      // cabe en los 10 s de Netlify. Antes eran 8 + 8.
      const { scan: updated, job } = await syncStoredScan(db, scan, { estado: 4_000, informe: 5_000 });
      return NextResponse.json({
        ok: true,
        scan: updated,
        progress: pctFromJob(job),
        phase: job.phase ?? null,
        ...(mejorar ? { mejorado: !esInformePublico(updated) } : {}),
      });
    } catch (apiError) {
      if (mejorar) return NextResponse.json({ ok: true, scan, mejorado: false });
      // Un timeout pasajero no cierra el scan por la vía pública: el próximo
      // sondeo (3 s) lo vuelve a intentar. Solo si el scan lleva ya más de
      // diez minutos se acepta el informe público como cierre.
      const pasajero =
        apiError instanceof B3SApiError &&
        (apiError.code === 'scanner_timeout' || apiError.code === 'scanner_unreachable');
      const reciente = Date.now() - new Date(scan.created_at).getTime() < 10 * 60_000;
      if (pasajero && reciente) {
        return NextResponse.json({ ok: true, scan, pendiente: true });
      }
      // La API v1 encadena tres llamadas (estado + resultado + evidencia) y a
      // veces no cabe en el tiempo que da el hosting. Si el informe público ya
      // existe, el scan ha terminado: se cierra con esos datos en vez de
      // dejarlo colgado en "running" para siempre.
      const jobId = String(scan.scanner_job_id);
      const fallback = await getPublicReport(jobId);
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
