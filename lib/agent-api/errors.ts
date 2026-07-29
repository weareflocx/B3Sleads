export class AgentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AgentApiError';
  }
}

const apiHeaders = (requestId: string) => ({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-b3s-api-version': 'v1',
  'x-request-id': requestId,
});

export function agentCompatibleSuccess(
  body: unknown,
  requestId: string,
  options: { status?: number; headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(options.headers);
  for (const [name, value] of Object.entries(apiHeaders(requestId))) {
    headers.set(name, value);
  }
  return Response.json(body, {
    status: options.status ?? 200,
    headers,
  });
}

export function agentSuccess(
  data: unknown,
  requestId: string,
  options: {
    status?: number;
    meta?: Record<string, unknown>;
  } = {},
): Response {
  return Response.json(
    options.meta ? { data, meta: options.meta } : { data },
    {
      status: options.status ?? 200,
      headers: apiHeaders(requestId),
    },
  );
}

export function agentErrorResponse(error: unknown, requestId: string): Response {
  const known =
    error instanceof AgentApiError
      ? error
      : new AgentApiError(500, 'internal_error', 'La operación no se pudo completar.');

  return Response.json(
    {
      error: {
        code: known.code,
        message: known.message,
        ...(known.details === undefined ? {} : { details: known.details }),
        request_id: requestId,
      },
    },
    {
      status: known.status,
      headers: {
        ...apiHeaders(requestId),
        ...(known.retryAfterSeconds === undefined
          ? {}
          : { 'retry-after': String(known.retryAfterSeconds) }),
      },
    },
  );
}

export function agentCompatibleErrorResponse(error: unknown, requestId: string): Response {
  const known =
    error instanceof AgentApiError
      ? error
      : new AgentApiError(500, 'internal_error', 'La operación no se pudo completar.');

  return Response.json(
    {
      // `error` sigue siendo string para no romper los clientes v1 existentes.
      error: known.message,
      code: known.code,
      ...(known.details === undefined ? {} : { details: known.details }),
      request_id: requestId,
    },
    {
      status: known.status,
      headers: {
        ...apiHeaders(requestId),
        ...(known.retryAfterSeconds === undefined
          ? {}
          : { 'retry-after': String(known.retryAfterSeconds) }),
      },
    },
  );
}
