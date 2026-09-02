import { NextRequest, NextResponse } from 'next/server';
import { guardarEstudio } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';

// Guarda los grupos de un estudio. PUT { domain, grupos }.
// El cliente manda el estado completo y no parches: un estudio son unos pocos
// grupos con unos pocos dominios, y mandarlo entero evita toda una familia de
// bugs de sincronización a cambio de nada de peso.
export async function PUT(req: NextRequest) {
  try {
    const { domain, grupos } = (await req.json()) as {
      domain?: string;
      grupos?: { nombre: string; dominios: string[] }[];
    };
    if (!domain || !Array.isArray(grupos)) {
      return NextResponse.json({ error: 'domain y grupos requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

    // Se sanea lo que llega: nombres con contenido y dominios en minúsculas
    // sin repetir. Es un endpoint autenticado, pero el saneado evita que un
    // grupo vacío o un dominio duplicado se quede guardado para siempre.
    const limpios = grupos
      .map((g) => ({
        nombre: String(g?.nombre ?? '').trim().slice(0, 60),
        dominios: [...new Set((g?.dominios ?? []).map((d) => String(d).trim().toLowerCase()).filter(Boolean))],
      }))
      .filter((g) => g.nombre);

    await guardarEstudio(company.id, limpios, await currentUserEmail());
    return NextResponse.json({ ok: true, grupos: limpios });
  } catch (e) {
    console.error('[estudio/grupos]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
