import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { signalMeta } from '@/lib/radar';

// Registra una señal del radar de cualquier tipo (spec §3.2). Es la vía por
// la que entran a mano las señales A y B: normalmente promoviendo una nota de
// la bitácora, que ya trae la evidencia literal y su fecha.
//
// `occurredAt` es CUÁNDO PASÓ el evento, que es lo único que decae. Si no
// llega, no se inventa: se usa la fecha del texto que la origina.
// `evidence` es obligatoria: un número de radar sin evidencia no se muestra.
//
// POST { companyId, type, occurredAt, evidence, sourceUrl?, detail? }
export async function POST(req: NextRequest) {
  try {
    const { companyId, type, occurredAt, evidence, sourceUrl, detail } = await req.json();

    if (!companyId || !type) {
      return NextResponse.json({ error: 'companyId y type requeridos' }, { status: 400 });
    }
    const meta = signalMeta(type);
    if (!meta) {
      return NextResponse.json({ error: `Tipo de señal desconocido: ${type}` }, { status: 400 });
    }
    // Sin evidencia no hay señal: es la regla que sostiene todo el radar.
    if (typeof evidence !== 'string' || evidence.trim().length < 3) {
      return NextResponse.json({ error: 'La señal necesita evidencia' }, { status: 400 });
    }
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
      return NextResponse.json({ error: 'La señal necesita la fecha en que ocurrió' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db.from('signals').insert({
      company_id: companyId,
      type: meta.type,
      detail: {
        ...(detail && typeof detail === 'object' ? detail : {}),
        occurred_at: occurredAt,
        evidence: evidence.trim(),
        source_url: sourceUrl || null,
        manual: true,
      },
      // Auditoría: cuándo lo registramos. No entra en el cálculo.
      detected_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, level: meta.level, weight: meta.weight });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
