import {
  parseScanInput,
  readJson,
  requireIdempotencyKey,
} from '@/lib/agent-api/contracts';
import { handleAgentRequest } from '@/lib/agent-api/handler';
import { launchAgentScan } from '@/lib/agent-api/scans';
import { scanView } from '@/lib/agent-api/serializers';
import { getCompanyFiche } from '@/lib/data';
import { AgentApiError } from '@/lib/agent-api/errors';
import { recordAgentAction } from '@/lib/agent-api/audit';

type RouteContext = { params: Promise<{ domain: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handleAgentRequest(request, ['scans:write'], async (agentContext) => {
    const { principal } = agentContext;
    const { domain } = await context.params;
    const fiche = await getCompanyFiche(decodeURIComponent(domain));
    if (!fiche?.company) {
      throw new AgentApiError(404, 'company_not_found', 'Compañía no encontrada.');
    }
    const input = parseScanInput(await readJson(request));
    const result = await launchAgentScan({
      companyId: fiche.company.id,
      ...input,
      keyFingerprint: principal.keyFingerprint,
      idempotencyKey: requireIdempotencyKey(request),
    });
    if (!result.deduped) {
      await recordAgentAction(agentContext, {
        action: 'launch_scan',
        resourceType: 'scan',
        resourceId: result.scan?.id ?? fiche.company.id,
      });
    }
    return {
      data: {
        scan: scanView(result.scan),
        deduped: result.deduped,
        reason: result.reason ?? null,
      },
      status: result.deduped ? 200 : 202,
    };
  });
}
