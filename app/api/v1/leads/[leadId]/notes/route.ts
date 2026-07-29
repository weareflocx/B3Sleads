import {
  parseNoteInput,
  readJson,
  requireIdempotencyKey,
} from '@/lib/agent-api/contracts';
import { handleAgentRequest } from '@/lib/agent-api/handler';
import { createAgentNote } from '@/lib/agent-api/notes';
import { noteView } from '@/lib/agent-api/serializers';
import { recordAgentAction } from '@/lib/agent-api/audit';

type RouteContext = { params: Promise<{ leadId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handleAgentRequest(request, ['notes:write'], async (agentContext) => {
    const { principal } = agentContext;
    const { leadId } = await context.params;
    const input = parseNoteInput(await readJson(request));
    const result = await createAgentNote({
      leadId,
      ...input,
      agentApiKeyId: principal.id,
      agentName: principal.name,
      keyFingerprint: principal.keyFingerprint,
      idempotencyKey: requireIdempotencyKey(request),
    });
    if (!result.deduped) {
      await recordAgentAction(agentContext, {
        action: 'create_note',
        resourceType: 'note',
        resourceId: result.note.id,
      });
    }
    return {
      data: {
        note: noteView(result.note),
        deduped: result.deduped,
      },
      status: result.deduped ? 200 : 201,
    };
  });
}
