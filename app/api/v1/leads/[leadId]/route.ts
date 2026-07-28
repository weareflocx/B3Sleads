import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { updateLeadStage } from '@/lib/data';
import { STAGES } from '@/lib/types';

// PATCH /api/v1/leads/{leadId} — mover de etapa. Descartar exige motivo,
// igual que en el dashboard.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  if (!apiAgent(req)) return unauthorized();
  try {
    const { leadId } = await params;
    const { stage, discardReason } = await req.json();
    if (!STAGES.some((s) => s.key === stage)) {
      return NextResponse.json(
        { error: `stage inválido. Uno de: ${STAGES.map((s) => s.key).join(', ')}` },
        { status: 400 },
      );
    }
    if (stage === 'discarded' && !discardReason) {
      return NextResponse.json({ error: 'Descartar exige discardReason' }, { status: 400 });
    }
    await updateLeadStage(leadId, stage, discardReason);
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
