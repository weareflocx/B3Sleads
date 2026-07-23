import { NextRequest, NextResponse } from 'next/server';
import { absoluteB3SUrl, createScan, storedScanStatus } from '@/lib/brand3';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan } from '@/lib/types';

// POST { url, name?, source? } — alta manual/engaged: crea company + scan + lead.
// Lo usa la vista Engaged (source='engaged', bonus +20 en scoring).
export async function POST(req: NextRequest) {
  try {
    const { url, name, source = 'manual' } = await req.json();
    if (!url) return NextResponse.json({ error: 'url requerida' }, { status: 400 });

    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(
      /^www\./,
      '',
    );

    if (isDemoMode()) {
      return NextResponse.json({
        ok: true,
        demo: true,
        message: `Demo: se registraría ${domain} (${source}) y se lanzaría el Scanner.`,
      });
    }

    const db = getServiceSupabase()!;

    // Dedupe por dominio
    const { data: existing } = await db.from('companies').select('id').eq('domain', domain).maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, deduped: true, companyId: existing.id });
    }

    const { data: company, error: cErr } = await db
      .from('companies')
      .insert({ name: name || domain, domain, source })
      .select()
      .single();
    if (cErr) throw cErr;

    const job = await createScan(`https://${domain}`, {
      brandName: name || domain,
      allowDegradedFallback: true,
      idempotencyKey: req.headers.get('idempotency-key')?.trim() || undefined,
    });
    const { data: scan, error: sErr } = await db
      .from('scans')
      .insert({
        company_id: company.id,
        scanner_job_id: job.id,
        status: storedScanStatus(job.status),
        ui_url: absoluteB3SUrl(job.links.report),
      })
      .select()
      .single();
    if (sErr) throw sErr;
    const storedScan =
      job.status === 'completed' ? (await syncStoredScan(db, scan as Scan)).scan : scan;

    const score = priorityScore({ company: company as Company, signal: null, scan: null });
    const { error: lErr } = await db.from('leads').insert({
      company_id: company.id,
      scan_id: storedScan.id,
      stage: 'detected',
      priority_score: score,
    });
    if (lErr) throw lErr;

    return NextResponse.json(
      { ok: true, companyId: company.id, scanId: storedScan.id, scanJobId: job.id },
      { status: 202 },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
