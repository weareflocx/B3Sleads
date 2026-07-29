import { randomUUID } from 'node:crypto';
import {
  authenticateAgentRequest,
  requireAgentScopes,
  type AgentPrincipal,
  type AgentScope,
} from './auth';
import {
  AgentApiError,
  agentCompatibleErrorResponse,
  agentCompatibleSuccess,
  agentErrorResponse,
  agentSuccess,
} from './errors';
import { enforceAgentRateLimit } from './rate-limit';

export interface AgentRequestContext {
  principal: AgentPrincipal;
  requestId: string;
}

export interface AgentHandlerResult {
  data: unknown;
  status?: number;
  meta?: Record<string, unknown>;
}

function requestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim();
  return incoming && /^[a-zA-Z0-9._:-]{1,100}$/.test(incoming) ? incoming : randomUUID();
}

async function authorizeAgentRequest(
  request: Request,
  scopes: AgentScope[],
  id: string,
): Promise<AgentRequestContext> {
  const principal = await authenticateAgentRequest(request);
  requireAgentScopes(principal, scopes);
  await enforceAgentRateLimit(principal, scopes);
  return { principal, requestId: id };
}

export async function handleAgentRequest(
  request: Request,
  scopes: AgentScope[],
  handler: (context: AgentRequestContext) => Promise<AgentHandlerResult>,
): Promise<Response> {
  const id = requestId(request);
  try {
    const context = await authorizeAgentRequest(request, scopes, id);
    const result = await handler(context);
    return agentSuccess(result.data, id, { status: result.status, meta: result.meta });
  } catch (error) {
    if (!(error instanceof AgentApiError)) {
      console.error(`[agent-api:${id}]`, error);
    }
    return agentErrorResponse(error, id);
  }
}

export interface CompatibleAgentHandlerResult {
  body: unknown;
  status?: number;
  headers?: HeadersInit;
}

export async function handleCompatibleAgentRequest(
  request: Request,
  scopes: AgentScope[],
  handler: (context: AgentRequestContext) => Promise<CompatibleAgentHandlerResult | Response>,
): Promise<Response> {
  const id = requestId(request);
  try {
    const context = await authorizeAgentRequest(request, scopes, id);
    const result = await handler(context);
    if (result instanceof Response) {
      const body = await result.json().catch(() => null);
      return agentCompatibleSuccess(body, id, {
        status: result.status,
        headers: result.headers,
      });
    }
    return agentCompatibleSuccess(result.body, id, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    if (!(error instanceof AgentApiError)) {
      console.error(`[agent-api:${id}]`, error);
    }
    return agentCompatibleErrorResponse(error, id);
  }
}

export function publicAgentResponse(
  request: Request,
  data: unknown,
  options: { status?: number; meta?: Record<string, unknown> } = {},
): Response {
  return agentSuccess(data, requestId(request), options);
}

export function publicAgentDocument(request: Request, data: unknown): Response {
  const id = requestId(request);
  return Response.json(data, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-b3s-api-version': 'v1',
      'x-request-id': id,
    },
  });
}
