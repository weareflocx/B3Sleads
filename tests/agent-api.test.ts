import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  AGENT_SCOPES,
  agentKeyFingerprint,
  agentRequestHash,
  authenticateAgentRequest,
  hashAgentApiKey,
  requireAgentScopes,
  type AgentPrincipal,
} from '../lib/agent-api/auth';
import {
  parseLeadListQuery,
  parseCompatibleLeadListQuery,
  parseLeadPatch,
  parseNoteInput,
  parseScanInput,
  parseSignalInput,
  requireIdempotencyKey,
} from '../lib/agent-api/contracts';
import { AgentApiError } from '../lib/agent-api/errors';
import { agentOpenApi } from '../lib/agent-api/openapi';
import { enforceAgentRateLimit } from '../lib/agent-api/rate-limit';
import { GET as listLeads } from '../app/api/v1/leads/route';
import {
  GET as getLead,
  PATCH as patchLead,
} from '../app/api/v1/leads/[leadId]/route';
import { GET as getOpenApi } from '../app/api/v1/openapi.json/route';

const envNames = [
  'B3S_AGENT_API_KEY',
  'B3SLEADS_API_KEYS',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
const originalEnv = new Map<string, string | undefined>();
const testToken = 'b3s_test_123456789012345678901234567890';

beforeEach(() => {
  for (const name of envNames) originalEnv.set(name, process.env[name]);
  process.env.B3S_AGENT_API_KEY = testToken;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.B3SLEADS_API_KEYS;
});

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

test('las claves se comparan por hash y la huella no revela el token', () => {
  const hash = hashAgentApiKey(testToken);
  assert.equal(hash.length, 64);
  assert.equal(hash, hashAgentApiKey(testToken));
  assert.equal(agentKeyFingerprint(testToken), hash.slice(0, 16));
  assert.equal(hash.includes(testToken), false);
  assert.equal(
    agentRequestHash({ lead_id: 'lead-1', body: 'nota' }),
    agentRequestHash({ lead_id: 'lead-1', body: 'nota' }),
  );
  assert.notEqual(
    agentRequestHash({ lead_id: 'lead-1', body: 'nota' }),
    agentRequestHash({ lead_id: 'lead-2', body: 'nota' }),
  );
});

test('Bearer auth exige credencial y reconoce la clave server-only', async () => {
  await assert.rejects(
    () => authenticateAgentRequest(new Request('https://b3s.test/api/v1/leads')),
    (error: unknown) =>
      error instanceof AgentApiError &&
      error.status === 401 &&
      error.code === 'missing_api_key',
  );

  const principal = await authenticateAgentRequest(
    new Request('https://b3s.test/api/v1/leads', {
      headers: { authorization: `Bearer ${testToken}` },
    }),
  );
  assert.equal(principal.source, 'environment');
  assert.deepEqual(principal.scopes, AGENT_SCOPES);
});

test('la compatibilidad reconoce una clave v1 por Bearer o x-api-key', async () => {
  delete process.env.B3S_AGENT_API_KEY;
  process.env.B3SLEADS_API_KEYS = `hermes-test:${testToken}`;
  const authenticationHeaders: Array<Record<string, string>> = [
    { authorization: `Bearer ${testToken}` },
    { 'x-api-key': testToken },
  ];
  for (const headers of authenticationHeaders) {
    const principal = await authenticateAgentRequest(
      new Request('https://b3s.test/api/v1/leads', { headers }),
    );
    assert.equal(principal.name, 'hermes-test');
    assert.equal(principal.source, 'legacy_environment');
  }
});

test('los scopes rechazan privilegios ausentes', () => {
  const principal: AgentPrincipal = {
    id: 'key-1',
    name: 'reader',
    scopes: ['leads:read'],
    keyFingerprint: 'abc',
    source: 'database',
  };
  requireAgentScopes(principal, ['leads:read']);
  assert.throws(
    () => requireAgentScopes(principal, ['leads:write']),
    (error: unknown) =>
      error instanceof AgentApiError &&
      error.status === 403 &&
      error.code === 'insufficient_scope',
  );
});

test('la cuota por operación bloquea excesos con retry_after', async () => {
  const principal: AgentPrincipal = {
    id: null,
    name: 'scan-loop-test',
    scopes: [...AGENT_SCOPES],
    keyFingerprint: `rate-limit-${Date.now()}`,
    source: 'environment',
  };
  for (let index = 0; index < 10; index += 1) {
    await enforceAgentRateLimit(principal, ['scans:write']);
  }
  await assert.rejects(
    () => enforceAgentRateLimit(principal, ['scans:write']),
    (error: unknown) =>
      error instanceof AgentApiError &&
      error.status === 429 &&
      error.code === 'rate_limit_exceeded' &&
      Boolean(error.retryAfterSeconds),
  );
});

test('los filtros de leads se normalizan y validan', () => {
  const parsed = parseLeadListQuery(
    new Request(
      'https://b3s.test/api/v1/leads?stage=detected,briefed&has_linkedin=true&limit=5&offset=10&owner_email=A@B.COM&q=fintech',
    ),
  );
  assert.deepEqual(parsed, {
    stages: ['detected', 'briefed'],
    hasLinkedIn: true,
    limit: 5,
    offset: 10,
    ownerEmail: 'a@b.com',
    q: 'fintech',
  });
  assert.throws(
    () => parseLeadListQuery(new Request('https://b3s.test/api/v1/leads?stage=invented')),
    (error: unknown) => error instanceof AgentApiError && error.code === 'invalid_stage',
  );
  assert.deepEqual(
    parseCompatibleLeadListQuery(
      new Request('https://b3s.test/api/v1/leads?state=activo&stage=detected&limit=5&offset=10'),
    ),
    { state: 'activo', stage: 'detected', limit: 5, offset: 10 },
  );
  assert.throws(
    () =>
      parseCompatibleLeadListQuery(
        new Request('https://b3s.test/api/v1/leads?state=inventado'),
      ),
    (error: unknown) => error instanceof AgentApiError && error.code === 'invalid_state',
  );
});

test('las mutaciones validan estado, notas, scan e idempotencia', () => {
  assert.deepEqual(parseLeadPatch({ stage: 'discarded', discard_reason: 'Fuera de ICP' }), {
    stage: 'discarded',
    discardReason: 'Fuera de ICP',
  });
  assert.deepEqual(parseLeadPatch({ stage: 'discarded', discardReason: 'Fuera de ICP' }), {
    stage: 'discarded',
    discardReason: 'Fuera de ICP',
  });
  assert.throws(
    () => parseLeadPatch({ stage: 'discarded' }),
    (error: unknown) => error instanceof AgentApiError && error.code === 'discard_reason_required',
  );
  assert.deepEqual(parseNoteInput({ body: '  Contexto nuevo ', kind: 'insight' }), {
    body: 'Contexto nuevo',
    kind: 'insight',
  });
  assert.deepEqual(parseScanInput({ lead_id: ' lead-1 ' }), { leadId: 'lead-1' });
  assert.deepEqual(
    parseSignalInput({
      domain: 'acme.test',
      type: 'web_nueva',
      occurredAt: '2026-07-28',
      evidence: 'Nueva web publicada',
      sourceUrl: 'https://acme.test/news',
    }),
    {
      domain: 'acme.test',
      type: 'web_nueva',
      occurredAt: '2026-07-28',
      evidence: 'Nueva web publicada',
      sourceUrl: 'https://acme.test/news',
    },
  );
  assert.throws(
    () =>
      parseSignalInput({
        domain: 'acme.test',
        type: 'web_nueva',
        occurredAt: '2026-02-31',
        evidence: 'Fecha imposible',
      }),
    (error: unknown) =>
      error instanceof AgentApiError && error.code === 'invalid_occurred_at',
  );
  assert.equal(
    requireIdempotencyKey(
      new Request('https://b3s.test', { headers: { 'idempotency-key': 'note:lead-1:001' } }),
    ),
    'note:lead-1:001',
  );
  assert.throws(
    () => requireIdempotencyKey(new Request('https://b3s.test')),
    (error: unknown) =>
      error instanceof AgentApiError && error.code === 'idempotency_key_required',
  );
});

test('OpenAPI es consumible sin envelope y declara auth, scopes y límites', async () => {
  assert.equal(agentOpenApi.openapi, '3.1.0');
  assert.ok(agentOpenApi.paths['/leads']);
  assert.ok(agentOpenApi.paths['/leads/{leadId}/notes']);
  assert.ok(agentOpenApi.paths['/companies/{domain}']);
  assert.ok(agentOpenApi.paths['/companies/{domain}/scans']);
  assert.ok(agentOpenApi.paths['/signals']);
  assert.equal(agentOpenApi.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(agentOpenApi['x-agent-safety'].linkedin_browser_automation_allowed, false);
  assert.ok(agentOpenApi.paths['/leads'].get.responses['429']);

  const response = await getOpenApi(new Request('https://b3s.test/api/v1/openapi.json'));
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.openapi, '3.1.0');
  assert.equal('data' in body, false);
});

test('la ruta de leads conserva el contrato v1, minimiza PII y demo es read-only', async () => {
  const unauthorized = await listLeads(new Request('https://b3s.test/api/v1/leads'));
  assert.equal(unauthorized.status, 401);
  const unauthorizedBody = await unauthorized.json();
  assert.equal(unauthorizedBody.code, 'missing_api_key');
  assert.equal(typeof unauthorizedBody.error, 'string');
  assert.ok(unauthorizedBody.request_id);

  const request = new Request('https://b3s.test/api/v1/leads?limit=1', {
    headers: {
      authorization: `Bearer ${testToken}`,
      'x-request-id': 'agent-api-test-1',
    },
  });
  const response = await listLeads(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'agent-api-test-1');
  const body = await response.json();
  assert.equal(Array.isArray(body.leads), true);
  assert.equal(body.pagination.limit, 1);
  const founder = body.leads[0]?.founder;
  if (founder) {
    assert.equal('email' in founder, false);
    assert.equal('phone' in founder, false);
  }

  const leadId = body.leads[0].id as string;
  const detail = await getLead(
    new Request(`https://b3s.test/api/v1/leads/${leadId}`, {
      headers: { authorization: `Bearer ${testToken}` },
    }),
    { params: Promise.resolve({ leadId }) },
  );
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.safety.outbound_messages_require_human, true);

  const mutation = await patchLead(
    new Request(`https://b3s.test/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ stage: 'contacted' }),
    }),
    { params: Promise.resolve({ leadId }) },
  );
  assert.equal(mutation.status, 409);
  assert.equal((await mutation.json()).code, 'demo_mode_read_only');
});
