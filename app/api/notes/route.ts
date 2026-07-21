import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// Bitácora del lead: cada nota es un registro con su fecha, no un campo que
// se sobrescribe. Lo que se habló el martes sigue ahí cuando anotas lo del
// jueves.
//
// Además de insertar, se refresca `contacts.notes` con la última nota: de
// ahí beben el dossier, el argumentario y la temperatura del lead, y así
// siguen viendo lo más reciente sin tocar nada más.
// De momento no se guarda autor: Sergio es el único que anota y meter el
// email en cada nota sería ruido. Cuando entre el equipo, columna aparte.
// POST { leadId, companyId?, contactId?, body, kind? }
export async function POST(req: NextRequest) {
  try {
    const { leadId, companyId, contactId, body, kind } = await req.json();
    if (!leadId || typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'leadId y body requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const text = body.trim();

    const { data: note, error } = await db
      .from('notes')
      .insert({
        lead_id: leadId,
        company_id: companyId ?? null,
        body: text,
        kind: kind === 'call_report' || kind === 'insight' ? kind : 'note',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const now = new Date().toISOString();
    if (contactId) {
      await db.from('contacts').update({ notes: text, last_touch_at: now }).eq('id', contactId);
    }
    // Anotar es actividad: mantiene viva la temperatura del lead.
    await db.from('leads').update({ updated_at: now }).eq('id', leadId);

    return NextResponse.json({ ok: true, note });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE { noteId } — para una nota mal pegada o duplicada.
export async function DELETE(req: NextRequest) {
  try {
    const { noteId } = await req.json();
    if (!noteId) return NextResponse.json({ error: 'noteId requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db.from('notes').delete().eq('id', noteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
