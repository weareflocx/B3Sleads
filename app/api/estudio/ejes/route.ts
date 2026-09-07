import { NextRequest, NextResponse } from 'next/server';
import { borrarEje, guardarEjes, guardarPuntuacionEje } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { saneaEjes, saneaPosicionesCliente, saneaPuntuacionEje } from '@/lib/battle-cards';

// Los ejes de posicionamiento de un estudio.
//
//   PUT    { domain, axes, clientPositions }        definir los ejes
//   PATCH  { domain, marca, eje, valor }            puntuar una marca
//   DELETE { domain, eje }                          borrar un eje y lo suyo
//
// PUT manda el conjunto entero (son cuatro como mucho y los toca una persona
// cada vez). PATCH va marca a marca contra una función que mezcla dentro de
// axis_scores, para que puntuar rápido no haga que un valor pise a otro.

async function idDelCliente(domain: string): Promise<string | null> {
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('companies')
    .select('id')
    .eq('domain', domain.toLowerCase())
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function PUT(req: NextRequest) {
  return conErrores(async () => {
    const { domain, axes, clientPositions } = (await req.json()) as {
      domain?: string;
      axes?: unknown;
      clientPositions?: unknown;
    };
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const id = await idDelCliente(domain);
    if (!id) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    // Los ejes se sanean antes que las posiciones, porque una posición en un
    // eje que no existe no debe llegar a guardarse.
    const limpios = saneaEjes(axes);
    const posiciones = saneaPosicionesCliente(clientPositions, limpios);
    await guardarEjes(id, limpios, posiciones, await currentUserEmail());
    return NextResponse.json({ ok: true, axes: limpios, clientPositions: posiciones });
  });
}

export async function PATCH(req: NextRequest) {
  return conErrores(async () => {
    const { domain, marca, eje, valor } = (await req.json()) as {
      domain?: string;
      marca?: string;
      eje?: string;
      valor?: unknown;
    };
    if (!domain || !marca || !eje) {
      return NextResponse.json({ error: 'domain, marca y eje requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const id = await idDelCliente(domain);
    if (!id) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    // null borra la puntuación. No es un 0: el 0 es el extremo izquierdo.
    const n = valor === null || valor === '' ? null : saneaPuntuacionEje(valor);
    await guardarPuntuacionEje(id, marca, eje, n, await currentUserEmail());
    return NextResponse.json({ ok: true, valor: n });
  });
}

export async function DELETE(req: NextRequest) {
  return conErrores(async () => {
    const { domain, eje } = (await req.json()) as { domain?: string; eje?: string };
    if (!domain || !eje) {
      return NextResponse.json({ error: 'domain y eje requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const id = await idDelCliente(domain);
    if (!id) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    await borrarEje(id, eje, await currentUserEmail());
    return NextResponse.json({ ok: true });
  });
}

// Los errores de PostgREST son objetos planos, no instancias de Error: sin
// esto el motivo llegaba como un escueto "Error" y una migración sin aplicar
// era indistinguible de un fallo de verdad.
async function conErrores(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    let msg = String(e);
    if (e instanceof Error) msg = e.message;
    else if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      const partes = [o.message, o.details, o.hint, o.code].filter(
        (x): x is string => typeof x === 'string' && x.trim() !== '',
      );
      if (partes.length) msg = partes.join(' · ');
    }
    if (/estudio_eje_|schema cache|function|column .*(axes|client_positions)/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Faltan las migraciones de Battle Cards. Pega supabase/migrations/20260907*_battle_cards*.sql en el editor SQL de Supabase.',
        },
        { status: 503 },
      );
    }
    console.error('[estudio/ejes]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
