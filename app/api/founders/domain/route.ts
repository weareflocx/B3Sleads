import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan } from '@/lib/types';

// Completar el dominio de un founder que se añadió solo con su LinkedIn.
// Crea/encuentra la compañía, la vincula al lead y lanza el Brand3 Scanner.
// POST { leadId, domain, companyName? }
export async function POST(req: NextRequest) {
  try {
    const { leadId, domain: rawDomain, companyName } = await req.json();
    if (!leadId || !rawDomain) {
      return NextResponse.json({ error: 'leadId y domain requeridos' }, { status: 400 });
    }
    const domain = String(rawDomain)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return NextResponse.json({ error: 'Dominio no válido' }, { status: 400 });
    }

    if (isDemoMode()) {
      return NextResponse.json({ ok: true, demo: true });
    }
    const db = getServiceSupabase()!;

    // Compañía: reusar si el dominio ya existe, si no crearla
    let company: Company | null = null;
    const { data: existing } = await db.from('companies').select('*').eq('domain', domain).maybeSingle();
    if (existing) {
      company = existing as Company;
    } else {
      const { data: created, error } = await db
        .from('companies')
        .insert({ name: companyName || domain, domain, source: 'linkedin' })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      company = created as Company;
    }

    // Vincular la compañía al contacto y al lead
    const { data: lead } = await db.from('leads').select('contact_id').eq('id', leadId).single();
    if (lead?.contact_id) {
      await db.from('contacts').update({ company_id: company.id }).eq('id', lead.contact_id);
    }

    // Lanzar el Scanner (si hay token). Sin token, se queda sin scan pero
    // la ficha ya existe y el founder sigue en la cola.
    // Importar el scan del Observatorio público si esa marca ya está en Brand3.
    let scanId: string | null = null;
    let scanRow: Scan | null = null;
    try {
      const profile = await getBrandProfile(domain);
      if (profile.found) {
        const { data } = await db
          .from('scans')
          .insert({
            company_id: company.id,
            scanner_job_id: profile.scanId ?? 0,
            status: 'ready',
            score: profile.score,
            tldr: profile.tldr,
            evidence: profile.evidence,
            result_raw: profile.raw,
            ui_url: profile.uiUrl,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single();
        scanRow = data as Scan | null;
        scanId = scanRow?.id ?? null;
      }
    } catch (err) {
      console.error(`[founders/domain] scan no importado para ${domain}: ${err}`);
    }

    await db
      .from('leads')
      .update({
        company_id: company.id,
        scan_id: scanId,
        priority_score: priorityScore({ company, signal: null, scan: scanRow }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    return NextResponse.json({
      ok: true,
      domain,
      scanImported: scanId != null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
