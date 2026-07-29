import { parseLeadPatch, readJson } from '@/lib/agent-api/contracts';
import {
  handleAgentRequest,
  handleCompatibleAgentRequest,
} from '@/lib/agent-api/handler';
import { getAgentLead, patchAgentLead } from '@/lib/agent-api/leads';
import { recordAgentAction } from '@/lib/agent-api/audit';

type RouteContext = { params: Promise<{ leadId: string }> };

// Endpoint nuevo: usa el envelope estable de la API endurecida.
export async function GET(request: Request, context: RouteContext) {
  return handleAgentRequest(request, ['leads:read'], async () => {
    const { leadId } = await context.params;
    return { data: await getAgentLead(leadId) };
  });
}

// PATCH conserva `{ ok, stage }` y `discardReason` para Hermes. También
// acepta el contrato nuevo (`discard_reason`, `owner_email`).
export async function PATCH(request: Request, context: RouteContext) {
  return handleCompatibleAgentRequest(request, ['leads:write'], async (agentContext) => {
    const { leadId } = await context.params;
    const patch = parseLeadPatch(await readJson(request));
    const lead = await patchAgentLead(leadId, patch);
    await recordAgentAction(agentContext, {
      action: 'update_lead',
      resourceType: 'lead',
      resourceId: leadId,
    });
    return {
      body: {
        ok: true,
        stage: lead.stage,
        owner_email: lead.owner_email,
      },
    };
  });
}
