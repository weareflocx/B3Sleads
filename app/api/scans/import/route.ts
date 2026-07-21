import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { apiConfigured, getBrandProfile, getReportByUrl } from '@/lib/brand3';
import { persistImportedScan } from '@/lib/b3s-scan-storage';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan } from '@/lib/types';

// Importa un scan existente mediante B3S Scanner API v1. El token sólo se
// usa en servidor; reportUrl y domain son dos formas de resolver el scan_id.
// POST { reportUrl?, domain?, leadId?, companyId? }
export async function POST(req: NextRequest) {
  try {
    const { reportUrl, domain: rawDomain, leadId, companyId } = await req.json();
    if (!reportUrl && !rawDomain) {
      return NextResponse.json({ error: 'reportUrl o domain requerido' }, { status: 400 });
    }

    // El histórico por dominio sólo existe en la API autenticada. Importar un
    // informe por su URL sí funciona sin token (Markdown público).
    if (!reportUrl && !apiConfigured()) {
      return NextResponse.json({
        found: false,
        message:
          'Buscar por dominio necesita el token de la API de B3S. Pega la URL del informe (b3s.fly.dev/report/…) y lo importo igual.',
      });
    }

    const profile = reportUrl ? await getReportByUrl(reportUrl) : await getBrandProfile(rawDomain);
    if (!profile.found || !profile.scanId) {
      return NextResponse.json({
        found: false,
        message: reportUrl
          ? 'No pude leer ese informe. Revisa que la URL sea de b3s.fly.dev/report/…'
          : 'Esa marca aún no tiene scans en B3S.',
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

    // Nombre comercial real del Scanner. Solo pisa el nombre si era un
    // placeholder (vacío o igual al dominio); nunca sobreescribe uno propio.
    if (profile.brandName && company && (!company.name || company.name === company.domain)) {
      await db.from('companies').update({ name: profile.brandName }).eq('id', coId);
      company = { ...company, name: profile.brandName };
    }

    const scanRow = await persistImportedScan(db, coId, profile);

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
