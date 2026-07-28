import { loadFiche, serializeFiche } from '@/lib/api-v1';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';

// GET /api/v1/companies/{domain} — la ficha completa, con los dos scores
// etiquetados y los componentes del Brand Seed consolidado.
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
    return { body: await serializeFiche(bundle) };
  });
}
