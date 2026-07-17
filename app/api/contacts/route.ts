import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// Notas de seguimiento del founder (ángulo personal, contexto de la
// conversación). Se guardan en contacts.notes y alimentan al redactor.
// PATCH { contactId, notes }
export async function PATCH(req: NextRequest) {
  try {
    const { contactId, notes } = await req.json();
    if (!contactId || typeof notes !== 'string') {
      return NextResponse.json({ error: 'contactId y notes requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db
      .from('contacts')
      .update({ notes: notes.trim() || null, last_touch_at: new Date().toISOString() })
      .eq('id', contactId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
