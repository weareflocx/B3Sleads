import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { loadFiche } from '@/lib/api-v1';
import { POST as markSignal } from '@/app/api/signals/mark/route';
import { SIGNAL_TYPES } from '@/lib/radar';

// POST /api/v1/signals — registrar una señal del radar. Misma validación que
// el alta manual: sin evidencia o sin fecha en que ocurrió, no hay señal.
export async function POST(req: NextRequest) {
  const agent = apiAgent(req);
  if (!agent) return unauthorized();
  try {
    const { domain, type, occurredAt, evidence, sourceUrl } = await req.json();
    if (!domain) {
      return NextResponse.json(
        {
          error: 'domain requerido',
          types: SIGNAL_TYPES.map((t) => ({ type: t.type, level: t.level, weight: t.weight })),
        },
        { status: 400 },
      );
    }
    const bundle = await loadFiche(String(domain));
    if (!bundle) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    const inner = new NextRequest('http://internal/api/signals/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: bundle.bl.company!.id,
        type,
        occurredAt,
        evidence,
        sourceUrl,
        detail: { source: `api:${agent.name}` },
      }),
    });
    return await markSignal(inner);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
