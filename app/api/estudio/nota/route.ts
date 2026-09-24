import { NextRequest, NextResponse } from 'next/server';
import { guardarMarcaEstudio } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { NOTA_MAX } from '@/lib/battle-cards';

// El porqué de una marca en el estudio. PATCH { domain, marca, nota }.
//
// La nota vive en la ficha de la marca (`marcas[dominio].note`) y se guarda
// sola, mezclándola en la base. Antes vivía dentro de la composición y esta
// ruta la reescribía ENTERA para guardar una frase: si otra persona acababa
// de añadir una marca, la nota se la llevaba por delante, y la siguiente
// escritura de composición de esa persona se llevaba la nota. La app nueva
// ya no pasa por aquí (usa la clasificación), pero una pestaña abierta antes
// del cambio sí, y así también escribe en el sitio bueno.
export async function PATCH(req: NextRequest) {
  try {
    const { domain, marca, nota } = (await req.json()) as {
      domain?: string;
      marca?: string;
      nota?: string;
    };
    if (!domain || !marca) {
      return NextResponse.json({ error: 'domain y marca requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

    const texto = String(nota ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX);
    await guardarMarcaEstudio(
      company.id,
      marca.trim().toLowerCase(),
      { note: texto || null },
      await currentUserEmail(),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[estudio/nota]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
