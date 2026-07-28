import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { loadLeads } from '@/lib/api-v1';
import { POST as foundersPost } from '@/app/api/founders/route';

// GET /api/v1/leads — la cola completa con su radar y su evidencia.
export async function GET(req: NextRequest) {
  if (!apiAgent(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    const stage = url.searchParams.get('stage');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

    let leads = await loadLeads();
    if (state) leads = leads.filter((l) => l.radar.state === state);
    if (stage) leads = leads.filter((l) => l.stage === stage);
    // Activos primero por radar; el resto por actividad reciente.
    leads.sort(
      (a, b) => (b.radar.score ?? -1) - (a.radar.score ?? -1) || b.updated_at.localeCompare(a.updated_at),
    );
    return NextResponse.json({ count: Math.min(leads.length, limit), leads: leads.slice(0, limit) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/v1/leads — alta de un lead. Reutiliza el mismo camino que el alta
// del dashboard (dedupe, autocompletado del nombre, búsqueda de scan por
// dominio), para que un lead entre igual venga de donde venga.
export async function POST(req: NextRequest) {
  const agent = apiAgent(req);
  if (!agent) return unauthorized();
  try {
    const { linkedin, name, domain, note } = await req.json();
    if (!linkedin?.trim() && !domain?.trim()) {
      return NextResponse.json({ error: 'linkedin o domain requeridos' }, { status: 400 });
    }
    const entry = {
      linkedin: linkedin?.trim() || undefined,
      name: name?.trim() || undefined,
      domain: domain?.trim() || undefined,
      note: [note?.trim(), `alta vía API (${agent.name})`].filter(Boolean).join(' · '),
    };
    const inner = new NextRequest('http://internal/api/founders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [entry] }),
    });
    return await foundersPost(inner);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
