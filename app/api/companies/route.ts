import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// Editar la ficha de compañía. Por ahora solo el nombre comercial (edición
// inline en la ficha). PATCH { companyId, name }
export async function PATCH(req: NextRequest) {
  try {
    const { companyId, name } = await req.json();
    if (!companyId || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'companyId y name requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db.from('companies').update({ name: name.trim() }).eq('id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
