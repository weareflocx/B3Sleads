import { NextRequest, NextResponse } from 'next/server';
import {
  getCorpusBrand,
  getCorpusBrands,
  getEstudio,
  guardarTiposDeClaim,
  marcarClaim,
} from '@/lib/data';
import { isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { companyLabel } from '@/lib/types';
import { fusionaNotas, parseGrupos, visibles } from '@/lib/benchmark';
import {
  extraeClaims,
  matrizDeClaims,
  TIPOS_POR_DEFECTO,
  type TipoClaim,
} from '@/lib/claims';
import { csvDeClaims } from '@/lib/export-estudio';

export const dynamic = 'force-dynamic';

// Los claims de un estudio: qué promete cada marca y quién lo prueba.
//
//   GET   ?domain=cliente.com[&g=...][&csv=1]   extrae y cruza
//   PATCH { domain, claimId, tipo?, oculto? }   decide sobre un claim
//   PATCH { domain, tipos }                     edita el vocabulario de tipos
//
// Va en su propia ruta, como el vocabulario, porque cuesta: hay que abrir el
// informe de cada marca del estudio y sacar sus afirmaciones. Metido en la
// página se pagaría en cada visita aunque nadie abriera la pestaña.

async function contexto(domain: string, g: string | null) {
  const cliente = await getCorpusBrand(domain);
  if (!cliente) return null;
  const guardado = await getEstudio(cliente.company.id);
  const grupos = fusionaNotas(
    g !== null ? parseGrupos(g) : (guardado?.grupos ?? []),
    guardado?.grupos,
  );
  return { cliente, guardado, grupos };
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const domain = (p.get('domain') ?? '').toLowerCase().trim();
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ claims: [], matriz: null, tipos: TIPOS_POR_DEFECTO });

    const ctx = await contexto(domain, p.get('g'));
    if (!ctx) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    const { cliente, guardado, grupos } = ctx;

    // Solo las marcas que están DENTRO de la comparación: una marca oculta o
    // descartada no debe mover el contador de "cuántas lo prometen".
    const porGrupo = new Map<string, string>();
    for (const gr of grupos) {
      for (const d of visibles(gr, guardado?.marcas)) porGrupo.set(d, gr.nombre);
    }
    const dominios = [...porGrupo.keys()];
    const corpus = await getCorpusBrands([...dominios, domain]);

    const tipos: TipoClaim[] = guardado?.claim_types?.length
      ? guardado.claim_types
      : TIPOS_POR_DEFECTO;

    const claims = extraeClaims(
      corpus.map((m) => ({
        marca: m,
        nombre: companyLabel(m.company.name, m.company.domain),
        grupo: porGrupo.get(m.company.domain) ?? null,
      })),
      tipos,
      guardado?.claim_overrides ?? {},
    );
    const matriz = matrizDeClaims(claims, tipos, domain);

    if (p.get('csv')) {
      const nombre = companyLabel(cliente.company.name, cliente.company.domain);
      return new NextResponse(csvDeClaims(claims, tipos), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="claims-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv"`,
        },
      });
    }

    return NextResponse.json({ claims, matriz, tipos, cliente: domain });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      domain?: string;
      claimId?: string;
      tipo?: string | null;
      oculto?: boolean | null;
      tipos?: TipoClaim[];
    };
    const domain = (body.domain ?? '').toLowerCase().trim();
    if (!domain) return NextResponse.json({ error: 'domain requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const cliente = await getCorpusBrand(domain);
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    const email = await currentUserEmail();

    // El vocabulario de tipos, entero.
    if (body.tipos) {
      const limpios = body.tipos
        .map((t) => ({
          clave: String(t.clave ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
          nombre: String(t.nombre ?? '').trim().slice(0, 40),
        }))
        .filter((t) => t.clave && t.nombre)
        .slice(0, 20);
      // Sin tipos no hay matriz: una lista vacía vuelve a los de por defecto
      // en vez de dejar la pantalla muda.
      await guardarTiposDeClaim(cliente.company.id, limpios, email);
      return NextResponse.json({ ok: true, tipos: limpios.length ? limpios : TIPOS_POR_DEFECTO });
    }

    if (!body.claimId) return NextResponse.json({ error: 'claimId requerido' }, { status: 400 });
    const parche: Record<string, unknown> = {};
    if (body.tipo !== undefined) parche.tipo = body.tipo;
    if (body.oculto !== undefined) parche.oculto = body.oculto;
    await marcarClaim(cliente.company.id, body.claimId, parche, email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
