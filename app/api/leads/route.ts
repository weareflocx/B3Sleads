import { NextRequest, NextResponse } from 'next/server';
import { getBriefingLeads, updateLeadStage } from '@/lib/data';

export async function GET() {
  try {
    const leads = await getBriefingLeads();
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH { leadId, stage, discardReason? } — mover de stage / descartar
export async function PATCH(req: NextRequest) {
  try {
    const { leadId, stage, discardReason } = await req.json();
    if (!leadId || !stage) {
      return NextResponse.json({ error: 'leadId y stage requeridos' }, { status: 400 });
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
