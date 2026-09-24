import { NextRequest, NextResponse } from 'next/server';
import { getComposicion, guardarComposicion } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import type { Grupo } from '@/lib/benchmark';

// La composición de un estudio: qué marcas hay, en qué grupo y en qué orden.
//
//   GET  ?domain=        lo guardado ahora mismo, para que una pestaña abierta
//                        vea lo que añade otra persona
//   PUT  { domain, base, grupos }   guarda SIN pisar a nadie: se aplica lo que
//                        cambió quien escribe desde `base`, no su copia entera
//   POST (igual)         sendBeacon solo sabe mandar POST, y se usa al salir
//
// Antes esto guardaba la copia entera de quien escribiera último, y así el
// 24/09 las altas de Victor borraron las de Sergio. Ver lib/composicion.ts.

async function empresa(domain: string) {
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('companies')
    .select('id')
    .eq('domain', domain.toLowerCase())
    .maybeSingle();
  return data as { id: string } | null;
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain') ?? '';
  if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ grupos: [], updated_at: null });
  const c = await empresa(domain);
  if (!c) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });
  const comp = await getComposicion(c.id);
  return NextResponse.json(comp ?? { grupos: [], updated_at: null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: NextRequest) {
  return guardar(req);
}

export async function POST(req: NextRequest) {
  return guardar(req);
}

// Nombres con contenido, dominios en minúsculas y sin repetir, y ocultas
// solo de marcas que estén en su grupo. Las notas ya no viajan aquí: viven
// en la ficha de cada marca.
function sanea(gs: unknown): Grupo[] {
  if (!Array.isArray(gs)) return [];
  const vistos = new Set<string>();
  return gs
    .map((g: { nombre?: unknown; dominios?: unknown; ocultas?: unknown }) => {
      const dominios = [
        ...new Set(
          (Array.isArray(g?.dominios) ? g.dominios : [])
            .map((d: unknown) => String(d).trim().toLowerCase())
            .filter(Boolean),
        ),
      ].filter((d) => {
        // Una marca, un grupo: si llega en dos, se queda en el primero.
        if (vistos.has(d)) return false;
        vistos.add(d);
        return true;
      });
      const dentro = new Set(dominios);
      const ocultas = [
        ...new Set(
          (Array.isArray(g?.ocultas) ? g.ocultas : [])
            .map((d: unknown) => String(d).trim().toLowerCase())
            .filter((d: string) => dentro.has(d)),
        ),
      ];
      return {
        nombre: String(g?.nombre ?? '').trim().slice(0, 60),
        dominios,
        ...(ocultas.length ? { ocultas } : {}),
      };
    })
    .filter((g) => g.nombre);
}

async function guardar(req: NextRequest) {
  try {
    const cuerpo = (await req.json()) as { domain?: string; grupos?: unknown; base?: unknown };
    if (!cuerpo.domain || !Array.isArray(cuerpo.grupos)) {
      return NextResponse.json({ error: 'domain y grupos requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const c = await empresa(cuerpo.domain);
    if (!c) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

    const grupos = await guardarComposicion(
      c.id,
      sanea(cuerpo.grupos),
      Array.isArray(cuerpo.base) ? sanea(cuerpo.base) : null,
      await currentUserEmail(),
    );
    // Se devuelve lo que quedó guardado de verdad, con lo de los demás
    // dentro: quien escribe lo adopta y ve al instante lo que no tenía.
    return NextResponse.json({ ok: true, grupos });
  } catch (e) {
    console.error('[estudio/grupos]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
