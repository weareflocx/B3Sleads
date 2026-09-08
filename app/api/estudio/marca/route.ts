import { NextRequest, NextResponse } from 'next/server';
import { absoluteB3SUrl, apiConfigured, B3SApiError, createScan, storedScanStatus } from '@/lib/brand3';
import { syncStoredScan } from '@/lib/b3s-scan-storage';
import { normalizarDominio } from '@/lib/eclipse';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Scan } from '@/lib/types';

// Alta de una marca en el corpus para un estudio. POST { domain }.
//
// Es deliberadamente distinta del alta de lead (/api/scans): crea la company
// y lanza el scan, pero NO crea lead. Un competidor entra en el corpus para
// medirlo, no para perseguirlo; si un día interesa como cliente, convertirlo
// es un paso explícito. Así el estudio nunca ensucia el pipeline.
//
// Idempotente por dominio: si ya existe con scan listo, lo devuelve; si
// existe sin scan (o falló), lanza uno; si hay uno en marcha, lo reutiliza.
export async function POST(req: NextRequest) {
  try {
    const { domain: raw } = (await req.json()) as { domain?: string };
    const domain = normalizarDominio(raw ?? '');
    if (!domain) return NextResponse.json({ error: 'Ese dominio no parece una web.' }, { status: 422 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true, domain });

    const db = getServiceSupabase()!;

    // Primero mirar qué hay, y solo después crear. Si la marca ya existe con
    // scan listo no hace falta ni token; y si hay que lanzar scan, el token se
    // comprueba ANTES de insertar nada: si no, un fallo dejaba una company
    // huérfana sin scan ni lead.
    const { data: existente } = await db.from('companies').select('*').eq('domain', domain).maybeSingle();
    if (existente) {
      const { data: scans } = await db
        .from('scans')
        .select('*')
        .eq('company_id', existente.id)
        .order('created_at', { ascending: false });
      const activo = (scans ?? []).find((s) => ['queued', 'running', 'blocked'].includes(s.status));
      if (activo) return NextResponse.json({ ok: true, domain, estado: 'escaneando', scanId: activo.id });
      const listo = (scans ?? []).find((s) => s.status === 'ready' && s.score != null);
      if (listo) return NextResponse.json({ ok: true, domain, estado: 'listo', scanId: listo.id });
    }

    if (!apiConfigured()) {
      return NextResponse.json(
        {
          // Decir DONDE se configura ahorra la pregunta. Es una herramienta
          // interna: nombrar la variable no expone nada.
          error:
            process.env.NODE_ENV === 'production'
              ? 'Falta el token del Scanner. Añade B3S_SCANNER_API_TOKEN en las variables de Netlify y redespliega.'
              : 'En local no hay token del Scanner. Pégalo en .env.local (BRAND3_SCANNER_API_TOKEN=…) y reinicia el servidor. En producción ya está configurado.',
        },
        { status: 503 },
      );
    }

    let company = existente;
    // Si la creamos nosotros y el scan no llega a lanzarse, hay que deshacerla:
    // una company sin scan ni lead no se ve en ninguna pantalla, no se puede
    // borrar desde la interfaz y bloquea el alta siguiente, porque la rama de
    // "ya existe" la encuentra y no vuelve a intentar el scan.
    let reciennacida = false;
    if (!company) {
      const { data, error } = await db
        .from('companies')
        .insert({ name: domain, domain, source: 'estudio' })
        .select()
        .single();
      if (error) throw error;
      company = data;
      reciennacida = true;
    }

    try {
      const job = await createScan(`https://${domain}`, {
        brandName: company.name,
        allowDegradedFallback: true,
        // La clave de idempotencia hace que reintentar sea gratis: si el scan
        // llegó a crearse en el Scanner y solo se perdió la respuesta, la
        // segunda llamada devuelve ese mismo trabajo en vez de duplicarlo.
        idempotencyKey: `estudio-${domain}-${new Date().toISOString().slice(0, 10)}`,
      });
      const { data: scan, error } = await db
        .from('scans')
        .insert({
          company_id: company.id,
          scanner_job_id: job.id,
          status: storedScanStatus(job.status),
          ui_url: absoluteB3SUrl(job.links.report),
        })
        .select()
        .single();
      if (error) throw error;
      const stored = job.status === 'completed' ? (await syncStoredScan(db, scan as Scan)).scan : scan;
      return NextResponse.json({
        ok: true,
        domain,
        estado: stored.status === 'ready' ? 'listo' : 'escaneando',
        scanId: stored.id,
      });
    } catch (e) {
      if (reciennacida) {
        await db.from('companies').delete().eq('id', company.id);
      }
      const esDelScanner = e instanceof B3SApiError;
      return NextResponse.json(
        {
          error: esDelScanner
            ? e.message
            : `No se pudo lanzar el scan de ${domain}: ${e instanceof Error ? e.message : 'error desconocido'}`,
        },
        { status: esDelScanner ? (e as B3SApiError).status : 500 },
      );
    }
  } catch (e) {
    console.error('[estudio/marca]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
