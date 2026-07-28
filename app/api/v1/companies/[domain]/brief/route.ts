import { NextRequest, NextResponse } from 'next/server';
import { apiAgent, unauthorized } from '@/lib/api-auth';
import { loadFiche } from '@/lib/api-v1';
import { buildCallBriefPrompt } from '@/lib/lead-prompts';

// GET /api/v1/companies/{domain}/brief — el prompt maestro del brief de
// llamada (instrucciones + dossier), sobre el Brand Seed consolidado. Es lo
// que un agente ejecuta para preparar la llamada.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  if (!apiAgent(req)) return unauthorized();
  try {
    const { domain } = await params;
    const bundle = await loadFiche(decodeURIComponent(domain));
    if (!bundle) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    return NextResponse.json({
      domain: bundle.bl.company!.domain,
      prompt: buildCallBriefPrompt(bundle.bl, bundle.consolidado.dimensions),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
