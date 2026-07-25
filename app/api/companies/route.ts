import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';

// Editar la ficha de compañía desde la propia ficha (edición inline).
// PATCH { companyId, name?, logo_url?, description?, sectors? }
export async function PATCH(req: NextRequest) {
  try {
    const { companyId, name, logo_url, description, sectors } = await req.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId requerido' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const update: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    // null o cadena vacía quitan el logo y devuelven el monograma.
    if (logo_url === null) update.logo_url = null;
    else if (typeof logo_url === 'string') update.logo_url = logo_url.trim() || null;
    if (typeof description === 'string') update.description = description.trim() || null;
    // Tags de sector para filtrar marcas. Se guardan de momento en la columna
    // `sector` (text) unidas por " · "; cuando el filtrado crezca migran a un
    // text[] propio. Lista vacía deja el campo en null.
    if (Array.isArray(sectors)) {
      const clean = sectors
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
      update.sector = clean.length ? Array.from(new Set(clean)).join(' · ') : null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 });
    }

    const db = getServiceSupabase()!;
    const { error } = await db.from('companies').update(update).eq('id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
