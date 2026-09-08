import { NextRequest, NextResponse } from 'next/server';
import { getCorpusBrand, getCorpusBrands, getEstudio } from '@/lib/data';
import { csvDelEstudio } from '@/lib/export-estudio';
import { companyLabel } from '@/lib/types';
import { fusionaNotas, parseGrupos } from '@/lib/benchmark';

export const dynamic = 'force-dynamic';

// El CSV de marcas del estudio: una fila por marca con todo lo que B3S sabe
// de ella, para que el análisis cualitativo se escriba en Notion SIN volver a
// teclear los datos.
//
// GET /api/estudio/export/csv?domain=cliente.com[&g=...]
// El parámetro g permite exportar exactamente lo que se está viendo, igual
// que hace la página.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const domain = (p.get('domain') ?? '').toLowerCase().trim();
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });

    const cliente = await getCorpusBrand(domain);
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const guardado = await getEstudio(cliente.company.id);
    const g = p.get('g');
    const grupos = fusionaNotas(
      g !== null ? parseGrupos(g) : (guardado?.grupos ?? []),
      guardado?.grupos,
    );

    const dominios = [...new Set(grupos.flatMap((x) => x.dominios))];
    const marcas = await getCorpusBrands(dominios);
    const corpus = new Map(marcas.map((m) => [m.company.domain, m]));

    const csv = csvDelEstudio({
      grupos,
      marcas: guardado?.marcas ?? {},
      ejes: guardado?.axes ?? [],
      corpus,
    });

    const nombre = companyLabel(cliente.company.name, cliente.company.domain)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const fecha = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="estudio-${nombre}-${fecha}.csv"`,
        // Un estudio cambia cada vez que alguien clasifica: servir una copia
        // en caché sería exportar el trabajo de ayer.
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[estudio/export/csv]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
