import { altaDeFounders } from '@/lib/alta-founders';
import {
  parseCompatibleLeadListQuery,
  parseLeadCreate,
  optionalIdempotencyKey,
  readJson,
} from '@/lib/agent-api/contracts';
import { handleCompatibleAgentRequest } from '@/lib/agent-api/handler';
import { AgentApiError } from '@/lib/agent-api/errors';
import { recordAgentAction } from '@/lib/agent-api/audit';
import { runIdempotentAgentOperation } from '@/lib/agent-api/idempotency';
import { loadLeads } from '@/lib/api-v1';

// Mantiene la forma `{ count, leads }` consumida por Hermes y añade
// paginación sin romper clientes existentes.
export async function GET(request: Request) {
  return handleCompatibleAgentRequest(request, ['leads:read'], async () => {
    const query = parseCompatibleLeadListQuery(request);
    let leads = await loadLeads();
    if (query.state) leads = leads.filter((lead) => lead.radar.state === query.state);
    if (query.stage) leads = leads.filter((lead) => lead.stage === query.stage);
    leads.sort(
      (left, right) =>
        (right.radar.score ?? -1) - (left.radar.score ?? -1) ||
        right.updated_at.localeCompare(left.updated_at),
    );

    const total = leads.length;
    const page = leads.slice(query.offset, query.offset + query.limit);
    return {
      body: {
        count: page.length,
        leads: page,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          has_more: query.offset + page.length < total,
        },
      },
    };
  });
}

// Conserva el mismo flujo de alta del dashboard: dedupe, enriquecimiento e
// importación del último scan. La identidad del agente queda en la nota.
export async function POST(request: Request) {
  return handleCompatibleAgentRequest(request, ['leads:write'], async (context) => {
    const { principal } = context;
    const input = parseLeadCreate(await readJson(request));
    const { linkedin, name, domain, note } = input;
    const entry = {
      linkedin,
      name,
      domain,
      note: [note, `alta vía API (${principal.name})`].filter(Boolean).join(' · '),
    };
    return runIdempotentAgentOperation({
      principal,
      operation: 'create_lead',
      idempotencyKey: optionalIdempotencyKey(request),
      payload: input,
      execute: async () => {
        // La misma alta que /api/founders, llamada directamente: esa ruta exige
        // la sesión de un usuario y la Agent API no la tiene. Sin usuario, el
        // lead no se atribuye a nadie, igual que antes.
        const { status, body } = await altaDeFounders({ entries: [entry] }, null);
        if ('error' in body) {
          throw new AgentApiError(status, 'lead_create_failed', body.error || 'No se pudo crear el lead.');
        }
        const first = body.results[0];
        await recordAgentAction(context, {
          action: 'create_lead',
          resourceType: 'lead',
          resourceId: first?.domain ?? domain ?? linkedin ?? null,
        });
        return { body, status };
      },
    });
  });
}
