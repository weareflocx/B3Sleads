import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// Editar el contacto. Notas de seguimiento (ángulo personal) y/o el nombre
// del founder (edición inline en la ficha, para corregir un alta mal parseada).
// PATCH { contactId, notes?, full_name? }
export async function PATCH(req: NextRequest) {
  try {
    const { contactId, notes, full_name } = await req.json();
    if (!contactId) {
      return NextResponse.json({ error: 'contactId requerido' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const update: Record<string, unknown> = {};
    // Editar notas cuenta como "toque"; editar el nombre no.
    if (typeof notes === 'string') {
      update.notes = notes.trim() || null;
      update.last_touch_at = new Date().toISOString();
    }
    if (typeof full_name === 'string' && full_name.trim()) {
      update.full_name = full_name.trim();
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 });
    }

    const db = getServiceSupabase()!;
    const { error } = await db.from('contacts').update(update).eq('id', contactId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
