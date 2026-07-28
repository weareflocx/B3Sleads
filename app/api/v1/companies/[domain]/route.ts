import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { loadFiche, serializeFiche } from '@/lib/api-v1';

// GET /api/v1/companies/{domain} — la ficha completa, con los dos scores
// etiquetados y los componentes del Brand Seed consolidado.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  if (!apiAgent(req)) return unauthorized();
  try {
    const { domain } = await params;
    const bundle = await loadFiche(decodeURIComponent(domain));
    if (!bundle) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    return NextResponse.json(await serializeFiche(bundle));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
