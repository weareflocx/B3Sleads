import { NextRequest, NextResponse } from 'next/server';
import { getCorpusBrand, getEstudio } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { fusionaNotas, parseGrupos } from '@/lib/benchmark';
import { ImportInvalido, preparaImport } from '@/lib/import-estudio';

export const dynamic = 'force-dynamic';

// Importa el criterio de un estudio desde el JSON que exporta esta misma
// página. La operación inversa de /api/estudio/export/json.
//
//   POST { domain, estudio, soloProbar? }
//
// Con soloProbar se calcula todo y se devuelve el resumen SIN escribir: así
// se puede ver qué va a pasar antes de que pase, que con cuarenta y cuatro
// marcas y una sola pantalla de deshacer no es un lujo.
export async function POST(req: NextRequest) {
  try {
    const { domain, estudio, soloProbar } = (await req.json()) as {
      domain?: string;
      estudio?: unknown;
      soloProbar?: boolean;
    };
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
    if (estudio == null) return NextResponse.json({ error: 'Falta el contenido del archivo' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const cliente = await getCorpusBrand(domain);
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const guardado = await getEstudio(cliente.company.id);
    if (!guardado) {
      return NextResponse.json(
        { error: 'Este cliente todavía no tiene estudio guardado. Monta los grupos antes de importar.' },
        { status: 404 },
      );
    }
    const grupos = fusionaNotas(guardado.grupos ?? [], guardado.grupos);

    const plan = preparaImport({
      json: estudio,
      clienteDominio: domain.toLowerCase(),
      grupos,
      marcasActuales: guardado.marcas ?? {},
    });

    if (soloProbar) return NextResponse.json({ ok: true, probado: true, resumen: plan.resumen });

    // Una sola escritura: importar es todo o nada. A medias dejaría un
    // estudio con la mitad del criterio de un archivo y la otra mitad del
    // anterior, y nadie sabría cuál es cuál.
    const db = getServiceSupabase()!;
    const { error } = await db
      .from('studies')
      .update({
        grupos: plan.grupos,
        marcas: plan.marcas,
        axes: plan.axes,
        client_positions: plan.clientPositions,
        excluded_terms: plan.excludedTerms,
        updated_by_email: await currentUserEmail(),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', cliente.company.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, resumen: plan.resumen });
  } catch (e) {
    if (e instanceof ImportInvalido) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    let msg = e instanceof Error ? e.message : String(e);
    if (e && typeof e === 'object' && 'message' in e) msg = String((e as { message: unknown }).message);
    if (/marcas|axes|client_positions|excluded_terms|schema cache/i.test(msg)) {
      return NextResponse.json(
        { error: 'Faltan las migraciones de Battle Cards. Aplícalas antes de importar.' },
        { status: 503 },
      );
    }
    console.error('[estudio/import]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
