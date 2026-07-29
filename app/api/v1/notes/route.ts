import { randomUUID } from 'node:crypto';
import {
  optionalIdempotencyKey,
  parseCompatibleNoteInput,
  readJson,
} from '@/lib/agent-api/contracts';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';
import { createAgentNote } from '@/lib/agent-api/notes';
import { noteView } from '@/lib/agent-api/serializers';
import { recordAgentAction } from '@/lib/agent-api/audit';
import { loadFiche } from '@/lib/api-v1';

// POST /api/v1/notes — anotar en la bitácora. La nota queda firmada por el
// agente en el propio cuerpo ("[hermes] …"): la bitácora es evidencia y tiene
// que decir quién habla.
export async function POST(request: Request) {
  return handleCompatibleAgentRequest(request, ['notes:write'], async (context) => {
    const input = parseCompatibleNoteInput(await readJson(request));
    let leadId = input.leadId;
    if (!leadId) {
      const bundle = await loadFiche(input.domain!);
      if (!bundle) {
        throw new AgentApiError(404, 'company_not_found', 'Empresa no encontrada.');
      }
      leadId = bundle.bl.lead.id;
    }
    const result = await createAgentNote({
      leadId,
      body: `[${context.principal.name}] ${input.body}`,
      kind: input.kind,
      agentApiKeyId: context.principal.id,
      agentName: context.principal.name,
      keyFingerprint: context.principal.keyFingerprint,
      idempotencyKey:
        optionalIdempotencyKey(request) ?? `legacy-note-${randomUUID()}`,
    });
    if (!result.deduped) {
      await recordAgentAction(context, {
        action: 'create_note',
        resourceType: 'note',
        resourceId: result.note.id,
      });
    }
    return {
      body: { ok: true, note: noteView(result.note), deduped: result.deduped },
      status: 200,
    };
  });
}
