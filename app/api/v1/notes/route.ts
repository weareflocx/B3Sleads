import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { loadFiche } from '@/lib/api-v1';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// POST /api/v1/notes — anotar en la bitácora. La nota queda firmada por el
// agente en el propio cuerpo ("[hermes] …"): la bitácora es evidencia y tiene
// que decir quién habla.
export async function POST(req: NextRequest) {
  const agent = apiAgent(req);
  if (!agent) return unauthorized();
  try {
    const { domain, leadId, body, kind } = await req.json();
    if (typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'body requerido' }, { status: 400 });
    }
    if (!domain && !leadId) {
      return NextResponse.json({ error: 'domain o leadId requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    let lead = leadId ? { id: leadId, companyId: null as string | null } : null;
    if (!lead) {
      const bundle = await loadFiche(String(domain));
      if (!bundle) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
      lead = { id: bundle.bl.lead.id, companyId: bundle.bl.company!.id };
    }

    const db = getServiceSupabase()!;
    const { data: note, error } = await db
      .from('notes')
      .insert({
        lead_id: lead.id,
        company_id: lead.companyId,
        body: `[${agent.name}] ${body.trim()}`,
        kind: kind === 'call_report' || kind === 'insight' ? kind : 'note',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Anotar es actividad: mantiene viva la temperatura del lead.
    await db.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', lead.id);
    return NextResponse.json({ ok: true, note });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
