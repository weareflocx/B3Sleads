import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  B3SApiError,
  createScan,
  getBrandProfile,
  reportScanIdFromUrl,
  type B3SScanEvidence,
  type B3SScanResult,
  type ScanJob,
} from '../lib/brand3';
import { storedScanReport } from '../lib/scan-report';

const originalFetch = globalThis.fetch;

const links = {
  self: '/api/v1/scans/scan123',
  result: '/api/v1/scans/scan123/result',
  evidence: '/api/v1/scans/scan123/evidence',
  continue_scan: '/api/v1/scans/scan123/continue',
  cancel: '/api/v1/scans/scan123/cancel',
  report: '/report/scan123',
  report_markdown: '/report/scan123.md',
};

const job: ScanJob = {
  object: 'scan',
  api_version: 'v1',
  id: 'scan123',
  status: 'running',
  phase: 'research',
  progress: 0.25,
  brand_name: 'Acme',
  url: 'https://acme.test',
  language: 'es',
  started_at: '2026-07-20T10:00:00Z',
  completed_at: null,
  phases: [],
  acquisition: [],
  acquisition_gate: {},
  failure: null,
  result_available: false,
  durable_status: true,
  resumable_after_restart: false,
  links,
};

const result: B3SScanResult = {
  object: 'scan_result',
  api_version: 'v1',
  id: 'scan123',
  status: 'completed',
  brand: { name: 'Acme', url: 'https://acme.test', domain: 'acme.test' },
  score: { value: 64, scale: 100, base_average: 61, reliability_status: 'reliable' },
  summary: 'Una marca clara con una prueba todavía débil.',
  executive_reading: 'Una marca clara con una prueba todavía débil.',
  components: [
    {
      key: 'propuesta',
      label: 'Propuesta de valor',
      status: 'detected',
      score: 3,
      max_score: 5,
      confidence: 'high',
      summary: 'Se entiende lo que ofrece.',
      verdict: 'La promesa es clara, pero genérica.',
      message: '',
      detected_content: 'Software para equipos modernos.',
      coverage_status: 'covered',
      tile_summary: { passed: 1, failed: 1, insufficient_evidence: 0, total: 2 },
      tiles: [
        { label: 'Propia', state: 'off', description: 'La frase podría pertenecer a un competidor.' },
      ],
      evidence_refs: [],
    },
  ],
  detected_count: 1,
  component_count: 1,
  not_detected: ['Prueba social'],
  limitations: [],
  acquisition_summary: {},
  acquisition_gate: {},
  metadata: {
    schema_version: 'b3s-scanner-result-v1',
    pipeline_schema_version: '1',
    rubric_version: '1',
    prompt_version: '1',
    evaluator_model: 'test',
    generated_at: '2026-07-20T10:01:00Z',
  },
  links,
};

const evidence: B3SScanEvidence = {
  object: 'scan_evidence',
  api_version: 'v1',
  scan_id: 'scan123',
  brand: result.brand,
  acquisition_summary: {},
  acquisition_gate: {},
  references: [],
  absences: [],
  attempts: [],
  totals: { references: 0 },
  links,
};

beforeEach(() => {
  process.env.B3S_SCANNER_API_URL = 'https://scanner.test/api/v1/';
  process.env.B3S_SCANNER_API_TOKEN = 'secret-test-token';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.B3S_SCANNER_API_URL;
  delete process.env.B3S_SCANNER_API_TOKEN;
});

test('createScan usa el contrato v1, auth server-only e idempotencia', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json(job, { status: 202 });
  };

  const created = await createScan('https://acme.test', {
    brandName: ' Acme ',
    allowDegradedFallback: true,
    idempotencyKey: 'lead:acme:1',
  });

  assert.equal(created.id, 'scan123');
  assert.equal(capturedUrl, 'https://scanner.test/api/v1/scans');
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get('authorization'), 'Bearer secret-test-token');
  assert.equal(headers.get('idempotency-key'), 'lead:acme:1');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    url: 'https://acme.test',
    brand_name: 'Acme',
    language: 'es',
    allow_degraded_fallback: true,
  });
  assert.equal(capturedInit?.cache, 'no-store');
});

test('los errores del API conservan código y request_id sin volcar el body', async () => {
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: 'invalid_domain', message: 'Dominio no válido', request_id: 'req-1' } },
      { status: 400 },
    );

  await assert.rejects(
    () => createScan('bad'),
    (error: unknown) =>
      error instanceof B3SApiError &&
      error.status === 400 &&
      error.code === 'invalid_domain' &&
      error.requestId === 'req-1',
  );
});

test('getBrandProfile importa resultado y evidencia estructurados por dominio', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/brands/acme.test/scans?limit=1&offset=0')) {
      return Response.json({
        object: 'scan_list',
        api_version: 'v1',
        domain: 'acme.test',
        items: [
          {
            id: 'scan123',
            status: 'completed',
            brand_name: 'Acme',
            url: 'https://acme.test',
            score: 64,
            created_at: '2026-07-20T10:01:00Z',
            result_url: links.result,
            report_url: links.report,
          },
        ],
        pagination: { limit: 1, offset: 0, count: 1, has_more: false },
      });
    }
    if (url.endsWith('/scans/scan123/result')) return Response.json(result);
    if (url.endsWith('/scans/scan123/evidence')) return Response.json(evidence);
    return Response.json({ error: { code: 'not_found', message: 'No', request_id: 'req' } }, { status: 404 });
  };

  const profile = await getBrandProfile('https://www.acme.test/about');
  assert.equal(profile.found, true);
  assert.equal(profile.scanId, 'scan123');
  assert.equal(profile.score, 64);
  assert.equal(profile.uiUrl, 'https://scanner.test/report/scan123');
  assert.deepEqual(profile.tldr.gaps, ['Prueba social']);
});

test('extrae scan_id de informes y endpoints v1', () => {
  assert.equal(reportScanIdFromUrl('https://b3s.fly.dev/report/abc123'), 'abc123');
  assert.equal(
    reportScanIdFromUrl('https://b3s.fly.dev/api/v1/scans/abc_123/result'),
    'abc_123',
  );
  assert.equal(reportScanIdFromUrl('javascript:alert(1)'), null);
});

test('el argumentario consume components del resultado v1 sin Markdown', () => {
  const report = storedScanReport(result as unknown as Record<string, unknown>);
  assert.equal(report?.summary, result.summary);
  assert.equal(report?.dimensions[0].name, 'Propuesta de valor');
  assert.deepEqual(report?.dimensions[0].todos, [
    { label: 'Propia', desc: 'La frase podría pertenecer a un competidor.' },
  ]);
  assert.equal(report?.weaknesses[0].ratio, 0.6);
});
