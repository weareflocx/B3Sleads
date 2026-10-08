import { NextRequest, NextResponse } from 'next/server';
import { getLeadFiche } from '@/lib/data';
import { generateDraft, draftInputFromLead, MAX_NOTA } from '@/lib/claude';

// POST { leadId } — la nota de la invitación de conexión de LinkedIn (≤300),
// con el mismo hallazgo del Scanner que el mensaje. No se guarda: es de usar
// y tirar, y el mensaje del lead sigue siendo el borrador de después.
export async function POST(req: NextRequest) {
  try {
    const { leadId } = await req.json();
    const bl = await getLeadFiche(leadId);
    if (!bl) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    const nota = await generateDraft({ ...draftInputFromLead(bl), formato: 'nota' });
    return NextResponse.json({ nota, max: MAX_NOTA });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
