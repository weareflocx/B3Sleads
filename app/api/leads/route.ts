import { NextRequest, NextResponse } from 'next/server';
import { getBriefingLeads, updateLeadStage } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

export async function GET() {
  try {
    const leads = await getBriefingLeads();
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH { leadId, stage?, discardReason?, ownerEmail? }
//  - stage: mover de etapa / descartar
//  - ownerEmail: delegar el lead. Cadena vacía lo devuelve a quien lo detectó.
export async function PATCH(req: NextRequest) {
  try {
    const { leadId, stage, discardReason, ownerEmail } = await req.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId requerido' }, { status: 400 });
    }

    if (typeof ownerEmail === 'string') {
      if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
      const db = getServiceSupabase()!;
      const { error } = await db
        .from('leads')
        .update({ owner_email: ownerEmail.trim().toLowerCase() || null })
        .eq('id', leadId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!stage) return NextResponse.json({ ok: true });
    }

    if (!stage) {
      return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 });
    }
    if (stage === 'discarded' && !discardReason) {
      return NextResponse.json({ error: 'Descartar exige motivo' }, { status: 400 });
    }
    await updateLeadStage(leadId, stage, discardReason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
