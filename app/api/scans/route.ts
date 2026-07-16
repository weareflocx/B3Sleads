import { NextRequest, NextResponse } from 'next/server';
import { createScan } from '@/lib/brand3';
import { getSupabase, isDemoMode } from '@/lib/supabase';
import { priorityScore } from '@/lib/scoring';
import type { Company } from '@/lib/types';

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

    const db = getSupabase()!;

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

    const job = await createScan(`https://${domain}`);
    const { data: scan, error: sErr } = await db
      .from('scans')
      .insert({ company_id: company.id, scanner_job_id: job.id, status: job.status })
      .select()
      .single();
    if (sErr) throw sErr;

    const score = priorityScore({ company: company as Company, signal: null, scan: null });
    const { error: lErr } = await db.from('leads').insert({
      company_id: company.id,
      scan_id: scan.id,
      stage: 'detected',
      priority_score: score,
    });
    if (lErr) throw lErr;

    return NextResponse.json({ ok: true, companyId: company.id, scanJobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
