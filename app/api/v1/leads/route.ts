import { NextRequest } from 'next/server';
import { POST as foundersPost } from '@/app/api/founders/route';
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
        const inner = new NextRequest('http://internal/api/founders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: [entry] }),
        });
        const response = await foundersPost(inner);
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body && typeof body === 'object' && typeof body.error === 'string'
              ? body.error
              : 'No se pudo crear el lead.';
          throw new AgentApiError(response.status, 'lead_create_failed', message);
        }
        const first =
          body && typeof body === 'object' && Array.isArray(body.results) ? body.results[0] : null;
        await recordAgentAction(context, {
          action: 'create_lead',
          resourceType: 'lead',
          resourceId:
            first && typeof first === 'object' && typeof first.domain === 'string'
              ? first.domain
              : domain ?? linkedin ?? null,
        });
        return { body, status: response.status };
      },
    });
  });
}
