import { NextRequest, NextResponse } from 'next/server';
import { getCorpusBrand, getCorpusBrands, getEstudio } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import {
  COMPONENTES,
  fusionaNotas,
  parseGrupos,
  perfilDeMarca,
  posicionMadurez,
  ultimoPublicable,
} from '@/lib/benchmark';
import { verificacionDe } from '@/lib/battle-cards';

export const dynamic = 'force-dynamic';

// El estudio entero en JSON, para alimentar automatizaciones de fuera.
//
// Se exportan los valores en INGLÉS (direct_competitor, core…), no las
// etiquetas de pantalla: una automatización que dependa de que pone "Núcleo"
// se rompe el día que se cambie el copy. Las etiquetas van aparte, en un
// diccionario, para quien las quiera pintar.
//
// GET /api/estudio/export/json?domain=cliente.com[&g=...]
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
    const corpus = new Map(
      (await getCorpusBrands(dominios)).map((m) => [m.company.domain, m]),
    );
    const marcas = guardado?.marcas ?? {};

    const ficha = (d: string) => {
      const m = corpus.get(d);
      const f = marcas[d];
      const perfil = m ? perfilDeMarca(m) : null;
      const scan = m ? ultimoPublicable(m) : null;
      const madurez = perfil ? posicionMadurez(perfil) : null;
      const sinRastro = new Set(perfil?.sinRastro ?? []);

      return {
        brand_domain: d,
        name: perfil?.name ?? d,
        score: perfil?.score ?? null,
        detected_components: perfil?.detectados ?? 0,
        // null cuando no hubo rastro. Distinto de 0, que es "se buscó y no
        // puntuó": quien consuma esto tiene que poder separarlos.
        dimensions: Object.fromEntries(
          COMPONENTES.map((c) => [
            c,
            !perfil || sinRastro.has(c)
              ? null
              : perfil.ratios[c] == null
                ? null
                : Math.round(perfil.ratios[c]! * 100),
          ]),
        ),
        classification: {
          role: f?.role ?? null,
          layer: f?.layer ?? null,
          priority: f?.priority ?? null,
          note: f?.note ?? null,
          legacy_note: f?.legacy_note ?? null,
        },
        axis_scores: f?.axis_scores ?? {},
        maturity: madurez
          ? { x: madurez.x, y: madurez.y, sufficient: madurez.suficiente }
          : null,
        verification: verificacionDe(f, {
          conScanPublicable: scan != null,
          conScanRetenido: (m?.scans.length ?? 0) > 0 && scan == null,
        }),
        report_url: scan?.ui_url ?? null,
        scanned_at: scan?.created_at ?? null,
      };
    };

    const salida = {
      object: 'brand_study',
      version: 1,
      exported_at: new Date().toISOString(),
      study_id: guardado?.id ?? null,
      client_domain: domain,
      client_name: companyLabel(cliente.company.name, cliente.company.domain),
      client_positions: guardado?.client_positions ?? {},
      axes: guardado?.axes ?? [],
      excluded_terms: guardado?.excluded_terms ?? [],
      groups: grupos.map((gr) => ({
        name: gr.nombre,
        // El orden importa: lo decide quien monta el estudio.
        brands: gr.dominios.map(ficha),
        // Fuera de la comparación por decisión (prioridad out) o por foco.
        hidden: gr.ocultas ?? [],
      })),
      // El cruce de vocabulario NO va aquí: cuesta segundos de cálculo y
      // tiene su propia ruta con su propio CSV. Meterlo haría lento un
      // export que casi siempre se pide por los datos, no por los términos.
      vocabulary_url: `/api/estudio/vocabulario?domain=${encodeURIComponent(domain)}`,
      labels_note:
        'Los valores van en inglés a propósito. Las etiquetas en español viven en lib/battle-cards.ts y pueden cambiar sin avisar.',
    };

    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(salida, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="estudio-${domain.replace(/\./g, '-')}-${fecha}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[estudio/export/json]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
