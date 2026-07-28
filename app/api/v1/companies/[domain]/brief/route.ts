import { loadFiche } from '@/lib/api-v1';
import { buildCallBriefPrompt } from '@/lib/lead-prompts';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';

// GET /api/v1/companies/{domain}/brief — el prompt maestro del brief de
// llamada (instrucciones + dossier), sobre el Brand Seed consolidado. Es lo
// que un agente ejecuta para preparar la llamada.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  return handleCompatibleAgentRequest(request, ['leads:read'], async () => {
    const { domain } = await params;
    const bundle = await loadFiche(decodeURIComponent(domain));
    if (!bundle) {
      throw new AgentApiError(404, 'company_not_found', 'Empresa no encontrada.');
    }
    return {
      body: {
        domain: bundle.bl.company!.domain,
        prompt: buildCallBriefPrompt(bundle.bl, bundle.consolidado.dimensions),
      },
    };
  });
}
