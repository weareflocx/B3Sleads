import { loadFiche } from '@/lib/api-v1';
import { buildLeadContext } from '@/lib/lead-prompts';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';

// GET /api/v1/companies/{domain}/dossier — el dossier en texto plano, el
// mismo que copia el botón "Pregunta al dossier", sobre el consolidado.
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
        dossier: buildLeadContext(bundle.bl, bundle.consolidado.dimensions),
      },
    };
  });
}
