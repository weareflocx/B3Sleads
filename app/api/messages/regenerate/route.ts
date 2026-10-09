import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getLeadFiche } from '@/lib/data';
import { generateDraft, draftInputFromLead } from '@/lib/claude';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// POST { leadId } — regenera el borrador del lead con Claude API.
//
// Devuelve también el id del mensaje nuevo: quien regenera tiene que apuntar
// a ESE mensaje al copiar. Antes seguía apuntando al viejo y guardaba el texto
// nuevo de la IA como `edited_final` del anterior, que es donde vive lo que
// el humano envió de verdad.
//
// Antes escribía con el cliente anónimo, sin permisos: el insert fallaba en
// silencio y el borrador regenerado no se guardaba nunca.
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { leadId } = await req.json();
    const bl = await getLeadFiche(leadId);
    if (!bl) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });

    const input = draftInputFromLead(bl);
    const draft = await generateDraft(input);

    if (isDemoMode()) return NextResponse.json({ draft, messageId: null });
    const db = getServiceSupabase()!;
    const { data, error } = await db
      .from('messages')
      .insert({ lead_id: leadId, channel: 'linkedin', lang: input.lang, draft })
      .select('id')
      .single();
    if (error) throw new Error(`No se pudo guardar el borrador: ${error.message}`);
    return NextResponse.json({ draft, messageId: data.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
