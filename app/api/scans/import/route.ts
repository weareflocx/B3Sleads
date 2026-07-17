import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan } from '@/lib/types';

// Importa un scan YA existente del Observatorio público de Brand3 y lo añade a
// la ficha. No necesita el token del Scanner API (usa el endpoint público).
// POST { domain, leadId?, companyId? }
export async function POST(req: NextRequest) {
  try {
    const { domain: rawDomain, leadId, companyId } = await req.json();
    if (!rawDomain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });

    const profile = await getBrandProfile(rawDomain);
    if (!profile.found) {
      return NextResponse.json({
        found: false,
        message: 'Esa marca aún no está en Brand3. Escanéala en brand3.fly.dev y vuelve a importarla.',
      });
    }

    if (isDemoMode()) {
      return NextResponse.json({
        found: true,
        demo: true,
        score: profile.score,
        quadrant: profile.quadrant,
        uiUrl: profile.uiUrl,
      });
    }
    const db = getServiceSupabase()!;

    // Resolver la company: por companyId, por leadId, o por dominio
    let coId: string | null = companyId ?? null;
    let company: Company | null = null;
    if (!coId && leadId) {
      const { data: lead } = await db.from('leads').select('company_id').eq('id', leadId).single();
      coId = lead?.company_id ?? null;
    }
    if (coId) {
      const { data } = await db.from('companies').select('*').eq('id', coId).single();
      company = data as Company | null;
    } else {
      const domain = rawDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      const { data } = await db.from('companies').select('*').eq('domain', domain).maybeSingle();
      company = data as Company | null;
      coId = company?.id ?? null;
    }
    if (!coId) {
      return NextResponse.json({ error: 'No hay ficha de empresa para ese dominio' }, { status: 400 });
    }

    // Guardar el scan importado como ready
    const { data: scanRow, error } = await db
      .from('scans')
      .insert({
        company_id: coId,
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Vincular el scan al lead y recalcular prioridad con el gap de marca real
    if (leadId && company) {
      await db
        .from('leads')
        .update({
          scan_id: scanRow.id,
          priority_score: priorityScore({ company, signal: null, scan: scanRow as Scan }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);
    }

    return NextResponse.json({
      found: true,
      score: profile.score,
      quadrant: profile.quadrant,
      gaps: profile.tldr.gaps,
      uiUrl: profile.uiUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
