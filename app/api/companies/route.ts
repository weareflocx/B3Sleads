import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { eliminarMarca } from '@/lib/data';

// Editar la ficha de compañía desde la propia ficha (edición inline).
// PATCH { companyId, name?, logo_url?, description?, sectors? }
export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
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

// DELETE { companyId, confirmDomain } — borra la marca y todo lo que cuelga de
// ella. Irreversible: exige escribir el dominio para confirmar.
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { companyId, confirmDomain } = await req.json();
    if (!companyId || typeof confirmDomain !== 'string') {
      return NextResponse.json({ error: 'companyId y confirmDomain requeridos' }, { status: 400 });
    }
    await eliminarMarca(companyId, confirmDomain);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
