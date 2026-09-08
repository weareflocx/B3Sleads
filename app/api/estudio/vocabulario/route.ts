import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getCorpusBrand, getCorpusBrands, getEstudio, excluirTermino } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { companyLabel, type Scan } from '@/lib/types';
import { fusionaNotas, parseGrupos, ultimoPublicable } from '@/lib/benchmark';
import { cruzaVocabulario } from '@/lib/vocabulario';
import { csvDelVocabulario } from '@/lib/export-estudio';

export const dynamic = 'force-dynamic';

// El cruce de vocabulario de un estudio.
//
//   GET   ?domain=cliente.com[&g=...]     calcula el cruce
//   PATCH { domain, termino, excluir }    excluye o recupera un término
//
// Va en su propia ruta y no dentro de la página porque cuesta: hay que sacar
// los n-gramas de las marcas del estudio y de las ~86 del corpus de
// contraste. Metido en la página, se pagaría en cada visita aunque nadie
// abriera la pestaña.

// El corpus de contraste cambia poco (una marca nueva al día, como mucho) y
// es lo caro de la operación. Se guarda por día.
const scansDeContraste = unstable_cache(
  async (excluidos: string[]) => {
    const db = getServiceSupabase()!;
    const { data } = await db
      .from('scans')
      .select('id,company_id,result_raw')
      .eq('status', 'ready')
      .not('score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(400);
    // Una entrada por marca: su scan más reciente. Sin esto, una marca con
    // cinco pasadas contaría cinco veces y hundiría el contraste.
    const porEmpresa = new Map<string, Scan>();
    for (const s of (data as Scan[] | null) ?? []) {
      if (excluidos.includes(s.company_id)) continue;
      if (!porEmpresa.has(s.company_id)) porEmpresa.set(s.company_id, s);
    }
    return [...porEmpresa.values()];
  },
  ['vocabulario-contraste'],
  { revalidate: 86_400 },
);

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const domain = (p.get('domain') ?? '').toLowerCase().trim();
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ grupos: [], corpusFuera: 0 });

    const cliente = await getCorpusBrand(domain);
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const guardado = await getEstudio(cliente.company.id);
    const g = p.get('g');
    const grupos = fusionaNotas(
      g !== null ? parseGrupos(g) : (guardado?.grupos ?? []),
      guardado?.grupos,
    );

    const dominios = [...new Set(grupos.flatMap((x) => x.dominios))];
    const marcas = await getCorpusBrands([...dominios, domain]);

    const scanPorDominio = new Map<string, Scan>();
    const nombrePorDominio = new Map<string, string>();
    const idsDelEstudio: string[] = [];
    for (const m of marcas) {
      const s = ultimoPublicable(m);
      if (s) scanPorDominio.set(m.company.domain, s);
      nombrePorDominio.set(m.company.domain, companyLabel(m.company.name, m.company.domain));
      idsDelEstudio.push(m.company.id);
    }

    // Las marcas del propio estudio no pueden ser su propio contraste: si
    // Multinivel se compara consigo mismo, sus códigos parecen universales.
    const fondo = await scansDeContraste(idsDelEstudio.sort());

    const res = cruzaVocabulario({
      grupos,
      scanPorDominio,
      nombrePorDominio,
      scansDeFuera: fondo,
      clienteDominio: domain,
      excluidos: guardado?.excluded_terms ?? [],
    });
    if (p.get('formato') === 'csv') {
      const fecha = new Date().toISOString().slice(0, 10);
      return new NextResponse(csvDelVocabulario(res.grupos), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="vocabulario-${domain.replace(/\./g, '-')}-${fecha}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }
    return NextResponse.json(res);
  } catch (e) {
    console.error('[estudio/vocabulario]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { domain, termino, excluir } = (await req.json()) as {
      domain?: string;
      termino?: string;
      excluir?: boolean;
    };
    if (!domain || !termino) {
      return NextResponse.json({ error: 'domain y termino requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    await excluirTermino(company.id, termino, excluir !== false, await currentUserEmail());
    return NextResponse.json({ ok: true });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (e && typeof e === 'object' && 'message' in e) msg = String((e as { message: unknown }).message);
    if (/estudio_termino_excluir|excluded_terms|schema cache|function/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Falta aplicar la migración 20260908090000_battle_cards_vocabulario. Pégala en el editor SQL de Supabase.',
        },
        { status: 503 },
      );
    }
    console.error('[estudio/vocabulario]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
