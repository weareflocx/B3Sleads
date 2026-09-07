import { NextRequest, NextResponse } from 'next/server';
import { getEstudio, guardarEstudio } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';

// El porqué de una marca en el estudio. PATCH { domain, marca, nota }.
// Va aparte del PUT de grupos porque una nota no cambia pertenencia ni orden
// (que viven en la URL): toca solo el estudio guardado, en la marca que
// toque, esté en el grupo que esté. Nota vacía = borrar.
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

    const estudio = await getEstudio(company.id);
    if (!estudio) return NextResponse.json({ error: 'Este cliente no tiene estudio guardado' }, { status: 404 });

    const m = marca.trim().toLowerCase();
    const texto = String(nota ?? '').trim().slice(0, 600);
    let tocado = false;
    const grupos = estudio.grupos.map((g) => {
      if (!g.dominios.includes(m)) return g;
      tocado = true;
      const notas = { ...(g.notas ?? {}) };
      if (texto) notas[m] = texto;
      else delete notas[m];
      return { ...g, ...(Object.keys(notas).length ? { notas } : { notas: undefined }) };
    });
    if (!tocado) {
      return NextResponse.json({ error: 'Esa marca no está en ningún grupo del estudio' }, { status: 404 });
    }

    await guardarEstudio(company.id, grupos, await currentUserEmail());
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[estudio/nota]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
