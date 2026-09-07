import { NextRequest, NextResponse } from 'next/server';
import { guardarMarcaEstudio } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { saneaParcheMarca } from '@/lib/battle-cards';

// La ficha de criterio de UNA marca dentro de un estudio: rol, capa,
// prioridad, el porqué y la verificación.
//
// PATCH { domain, marca, parche }
//
// Va por marca y no por estudio entero a propósito. Clasificar es teclear
// rápido, y mandar el documento completo en cada cambio significa que dos
// cambios seguidos se pisan. Aquí cada petición toca un dominio y la mezcla
// la hace la base (estudio_marca_merge), así que el orden de llegada da
// igual mientras no sean el mismo campo de la misma marca.
//
// Un campo con valor null se borra de la ficha: es lo que manda el selector
// al volver a "sin asignar".
export async function PATCH(req: NextRequest) {
  try {
    const { domain, marca, parche } = (await req.json()) as {
      domain?: string;
      marca?: string;
      parche?: unknown;
    };
    if (!domain || !marca) {
      return NextResponse.json({ error: 'domain y marca requeridos' }, { status: 400 });
    }

    const limpio = saneaParcheMarca(parche);
    if (!limpio) {
      return NextResponse.json({ error: 'Nada que guardar en el parche' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    await guardarMarcaEstudio(company.id, marca, limpio, await currentUserEmail());
    return NextResponse.json({ ok: true, parche: limpio });
  } catch (e) {
    const msg = mensajeDeError(e);
    // La migración de Battle Cards añade la función de mezcla. Sin ella el
    // fallo es un 404 de PostgREST que no dice nada por sí solo.
    if (/estudio_marca_merge|schema cache|function/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Falta aplicar la migración 20260907190000_battle_cards. Pégala en el editor SQL de Supabase y vuelve a intentarlo.',
        },
        { status: 503 },
      );
    }
    console.error('[estudio/clasificacion]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Los errores de PostgREST NO son instancias de Error: son objetos planos con
// message, details, hint y code. Tratarlos como Error dejaba el motivo en un
// escueto "Error" y hacía imposible distinguir una migración sin aplicar de
// un fallo de verdad.
function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const partes = [o.message, o.details, o.hint, o.code].filter(
      (x): x is string => typeof x === 'string' && x.trim() !== '',
    );
    if (partes.length) return partes.join(' · ');
  }
  return String(e);
}
