import { randomUUID } from 'node:crypto';
import {
  optionalIdempotencyKey,
  parseSignalInput,
  readJson,
} from '@/lib/agent-api/contracts';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';
import { createAgentSignal } from '@/lib/agent-api/signals';
import { recordAgentAction } from '@/lib/agent-api/audit';
import { loadFiche } from '@/lib/api-v1';

// POST /api/v1/signals — registrar una señal del radar. Misma validación que
// el alta manual: sin evidencia o sin fecha en que ocurrió, no hay señal.
export async function POST(request: Request) {
  return handleCompatibleAgentRequest(request, ['signals:write'], async (context) => {
    const input = parseSignalInput(await readJson(request));
    const bundle = await loadFiche(input.domain);
    if (!bundle) {
      throw new AgentApiError(404, 'company_not_found', 'Empresa no encontrada.');
    }
    const result = await createAgentSignal({
      companyId: bundle.bl.company!.id,
      type: input.type,
      occurredAt: input.occurredAt,
      evidence: input.evidence,
      sourceUrl: input.sourceUrl,
      agentApiKeyId: context.principal.id,
      agentName: context.principal.name,
      keyFingerprint: context.principal.keyFingerprint,
      idempotencyKey:
        optionalIdempotencyKey(request) ?? `legacy-signal-${randomUUID()}`,
    });
    if (!result.deduped) {
      await recordAgentAction(context, {
        action: 'create_signal',
        resourceType: 'signal',
        resourceId: result.signal.id,
      });
    }
    return {
      body: {
        ok: true,
        level: result.level,
        weight: result.weight,
        deduped: result.deduped,
      },
      status: 200,
    };
  });
}
