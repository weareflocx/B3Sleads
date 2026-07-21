import { NextRequest, NextResponse } from 'next/server';
import { absoluteB3SUrl, apiConfigured, createScan, storedScanStatus } from '@/lib/brand3';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Company, Scan } from '@/lib/types';

// Lanza un scan para una compañía ya existente. La llamada al API y su token
// permanecen en servidor; el cliente sólo recibe la fila local de Supabase.
// POST { companyId, leadId? }
export async function POST(req: NextRequest) {
  try {
    const { companyId, leadId } = (await req.json()) as {
      companyId?: string;
      leadId?: string;
    };
    if (!companyId) {
      return NextResponse.json({ error: 'companyId requerido' }, { status: 400 });
    }

    if (isDemoMode()) {
      return NextResponse.json({ ok: true, demo: true });
    }

    // Lanzar un scan nuevo consume cuota: no hay vía pública, hace falta token.
    if (!apiConfigured()) {
      return NextResponse.json(
        {
          error:
            'Lanzar scans nuevos necesita el token de la API de B3S, que aún no está configurado. Mientras tanto puedes pegar abajo la URL de un informe ya generado en b3s.fly.dev e importarlo.',
        },
        { status: 503 },
      );
    }

    const db = getServiceSupabase()!;

    const { data: company, error: companyError } = await db
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (companyError || !company) {
      return NextResponse.json({ error: 'Compañía no encontrada' }, { status: 404 });
    }

    // No lanzar dos trabajos simultáneos para la misma marca.
    const { data: activeScan } = await db
      .from('scans')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['queued', 'running', 'blocked'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeScan) {
      return NextResponse.json({ ok: true, deduped: true, scan: activeScan });
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim() || undefined;
    const typedCompany = company as Company;
    const job = await createScan(`https://${typedCompany.domain}`, {
      brandName: typedCompany.name,
      // El flujo de Leads es desatendido: conserva las limitaciones del
      // resultado, pero no deja el pipeline esperando aprobación humana.
      allowDegradedFallback: true,
      idempotencyKey,
    });

    const { data: scan, error: scanError } = await db
      .from('scans')
      .insert({
        company_id: companyId,
        scanner_job_id: job.id,
        status: storedScanStatus(job.status),
        ui_url: absoluteB3SUrl(job.links.report),
      })
      .select()
      .single();
    if (scanError) throw scanError;

    const storedScan =
      job.status === 'completed' ? await syncStoredScan(db, scan as Scan) : (scan as Scan);

    if (leadId) {
      await db
        .from('leads')
        .update({ scan_id: storedScan.id, updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('company_id', companyId);
    }

    return NextResponse.json({ ok: true, scan: storedScan }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
