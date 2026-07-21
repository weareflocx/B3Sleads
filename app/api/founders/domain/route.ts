import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { persistImportedScan } from '@/lib/b3s-scan-storage';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan } from '@/lib/types';

// Completar el dominio de un founder que se añadió solo con su LinkedIn.
// Crea/encuentra la compañía, la vincula al lead e importa su último scan B3S.
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

    // Importar el último scan disponible mediante el API autenticado.
    let scanId: string | null = null;
    let scanRow: Scan | null = null;
    try {
      const profile = await getBrandProfile(domain);
      if (profile.found && profile.scanId) {
        scanRow = await persistImportedScan(db, company.id, profile);
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
