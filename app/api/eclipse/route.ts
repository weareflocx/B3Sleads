import { NextRequest, NextResponse } from 'next/server';
import { apiConfigured, createScan, getBrandProfile, getResult, getScanStatus } from '@/lib/brand3';
import {
  demoEclipseResult,
  eclipseResultFromRaw,
  emailValido,
  normalizarDominio,
} from '@/lib/eclipse';
import { getServiceSupabase } from '@/lib/supabase';

// La API pública del Eclipse Scan. Dos verbos:
//  POST { domain, email } — registra el lead en la waitlist y resuelve el
//    scan: si la marca ya está en el histórico de B3S, el resultado es
//    inmediato; si no, se lanza un scan y el cliente hace polling.
//  GET ?job=ID — estado de un scan lanzado.
//
// Es un endpoint abierto a internet que puede disparar scans de pago, así que
// lleva dos frenos: tope diario de scans nuevos e idempotencia por dominio y
// día (repetir el submit no lanza dos trabajos).
const MAX_SCANS_NUEVOS_POR_DIA = 40;

async function guardarLead(email: string, domain: string, score: number | null) {
  const db = getServiceSupabase();
  if (!db) return;
  try {
    // upsert por (email, dominio): reintentar no duplica, y si ya hay score
    // no se pisa con un null.
    const { error } = await db
      .from('eclipse_waitlist')
      .upsert(
        { email, domain, ...(score != null ? { score } : {}) },
        { onConflict: 'email,domain' },
      );
    if (error) console.error('[eclipse] waitlist no guardada:', error.message);
  } catch (e) {
    console.error('[eclipse] waitlist no guardada:', e);
  }
}

async function scansLanzadosHoy(): Promise<number> {
  const db = getServiceSupabase();
  if (!db) return 0;
  try {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    const { count } = await db
      .from('eclipse_waitlist')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', desde.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { domain?: string; email?: string };
    const domain = normalizarDominio(body.domain ?? '');
    const email = (body.email ?? '').trim().toLowerCase();
    if (!domain) {
      return NextResponse.json({ error: 'Ese dominio no parece una web.' }, { status: 422 });
    }
    if (!emailValido(email)) {
      return NextResponse.json({ error: 'Revisa el email.' }, { status: 422 });
    }

    // El email se guarda ANTES de escanear: la captación no puede depender de
    // que el Scanner esté de buen humor.
    await guardarLead(email, domain, null);

    // Sin token del Scanner (desarrollo local): resultado de demostración,
    // marcado como tal.
    if (!apiConfigured()) {
      return NextResponse.json({ status: 'ready', result: demoEclipseResult(domain) });
    }

    // La marca ya pasó por B3S: resultado inmediato, sin gastar un scan.
    try {
      const perfil = await getBrandProfile(domain);
      if (perfil.found) {
        const result = eclipseResultFromRaw(perfil.raw, perfil.score);
        if (result) {
          void guardarLead(email, domain, result.score);
          return NextResponse.json({ status: 'ready', result });
        }
      }
    } catch {
      // El histórico no responde: se intenta el scan nuevo igualmente.
    }

    // Freno de gasto: pasado el tope diario, el lead queda registrado y el
    // análisis llega por email. Es la degradación honesta.
    if ((await scansLanzadosHoy()) > MAX_SCANS_NUEVOS_POR_DIA) {
      return NextResponse.json({ status: 'queued' });
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const job = await createScan(`https://${domain}`, {
      allowDegradedFallback: true,
      idempotencyKey: `eclipse-${hoy}-${domain.replace(/[^a-z0-9]/g, '-')}`,
    });
    if (job.status === 'completed') {
      const result = eclipseResultFromRaw(
        (await getResult(job.id)) as unknown as Record<string, unknown>,
        null,
      );
      if (result) return NextResponse.json({ status: 'ready', result });
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({ status: 'queued' });
    }
    return NextResponse.json({ status: 'running', job: job.id, email, domain });
  } catch (e) {
    console.error('[eclipse] POST:', e);
    // El lead ya está guardado: al usuario se le promete el email, no un 500.
    return NextResponse.json({ status: 'queued' });
  }
}

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get('job');
  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  const domain = normalizarDominio(req.nextUrl.searchParams.get('domain') ?? '');
  if (!job) return NextResponse.json({ error: 'job requerido' }, { status: 400 });
  try {
    const estado = await getScanStatus(job);
    if (estado.status === 'completed') {
      const raw = (await getResult(job)) as unknown as { score?: { value?: number | null } };
      const result = eclipseResultFromRaw(
        raw as unknown as Record<string, unknown>,
        raw.score?.value ?? null,
      );
      if (result) {
        if (email && domain) void guardarLead(email, domain, result.score);
        return NextResponse.json({ status: 'ready', result });
      }
      return NextResponse.json({ status: 'queued' });
    }
    if (estado.status === 'failed' || estado.status === 'cancelled') {
      return NextResponse.json({ status: 'queued' });
    }
    return NextResponse.json({ status: 'running' });
  } catch {
    return NextResponse.json({ status: 'running' });
  }
}
