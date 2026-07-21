// Cliente server-only de B3S Scanner API v1.
// El navegador siempre llama a Route Handlers de B3Sleads: el Bearer token
// nunca se serializa ni se expone mediante variables NEXT_PUBLIC_*.

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export type B3SScanStatus = 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';

export interface B3SScanLinks {
  self: string;
  result: string;
  evidence: string;
  continue_scan: string;
  cancel: string;
  report: string;
  report_markdown: string;
}

export interface B3SScanFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ScanJob {
  object: 'scan';
  api_version: 'v1';
  id: string;
  status: B3SScanStatus;
  phase: string;
  progress: number;
  brand_name: string;
  url: string;
  language: 'es';
  started_at: string | null;
  completed_at: string | null;
  phases: Array<{ key: string; label: string; state: string }>;
  acquisition: Array<Record<string, unknown>>;
  acquisition_gate: Record<string, unknown>;
  failure: B3SScanFailure | null;
  result_available: boolean;
  durable_status: boolean;
  resumable_after_restart: boolean;
  links: B3SScanLinks;
}

export interface B3SBrand {
  name: string;
  url: string;
  domain: string;
}

export interface B3SEvidenceReference {
  ref: string;
  component: string;
  url: string;
  snippet: string;
}

export interface B3SScanComponent {
  key: string;
  label: string;
  status: string;
  score: number | null;
  max_score: number | null;
  confidence: string;
  summary: string;
  verdict: string;
  message: string;
  detected_content: string;
  coverage_status: string;
  tile_summary: {
    passed: number;
    failed: number;
    insufficient_evidence: number;
    total: number;
  };
  tiles: Array<Record<string, unknown>>;
  evidence_refs: B3SEvidenceReference[];
}

export interface B3SScanResult {
  object: 'scan_result';
  api_version: 'v1';
  id: string;
  status: 'completed';
  brand: B3SBrand;
  score: {
    value: number | null;
    scale: 100;
    base_average: number | null;
    reliability_status: string;
  };
  summary: string;
  executive_reading: string;
  components: B3SScanComponent[];
  detected_count: number;
  component_count: number;
  not_detected: string[];
  limitations: string[];
  acquisition_summary: Record<string, unknown>;
  acquisition_gate: Record<string, unknown>;
  metadata: {
    schema_version: 'b3s-scanner-result-v1';
    pipeline_schema_version: string;
    rubric_version: string;
    prompt_version: string;
    evaluator_model: string;
    generated_at: string | null;
  };
  links: B3SScanLinks;
}

export interface B3SScanEvidence {
  object: 'scan_evidence';
  api_version: 'v1';
  scan_id: string;
  brand: B3SBrand;
  acquisition_summary: Record<string, unknown>;
  acquisition_gate: Record<string, unknown>;
  references: B3SEvidenceReference[];
  absences: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  totals: Record<string, number>;
  links: B3SScanLinks;
}

interface BrandScanHistory {
  object: 'scan_list';
  api_version: 'v1';
  domain: string;
  items: Array<{
    id: string;
    status: 'completed';
    brand_name: string;
    url: string;
    score: number | null;
    created_at: string | null;
    result_url: string;
    report_url: string;
  }>;
  pagination: { limit: number; offset: number; count: number; has_more: boolean };
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
    details?: Record<string, unknown> | null;
  };
}

export class B3SApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: Record<string, unknown> | null;

  constructor({
    status,
    code,
    message,
    requestId = null,
    details = null,
  }: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: Record<string, unknown> | null;
  }) {
    super(message);
    this.name = 'B3SApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

// Origen público de B3S. Sirve los informes ya generados en Markdown sin
// credenciales; es el plan B mientras no haya token de la API v1.
const PUBLIC_BASE = 'https://b3s.fly.dev';

function apiBase(): string {
  const configured = process.env.B3S_SCANNER_API_URL?.trim();
  if (!configured) {
    throw new Error('B3S_SCANNER_API_URL no configurada (ej. https://b3s.fly.dev/api/v1)');
  }
  return configured.replace(/\/+$/, '');
}

function readApiToken(): string | null {
  return (
    process.env.B3S_SCANNER_API_TOKEN?.trim() ||
    process.env.BRAND3_SCANNER_API_TOKEN?.trim() ||
    process.env.BRAND3_TOKEN?.trim() ||
    null
  );
}

function apiToken(): string {
  const token = readApiToken();
  if (!token) throw new Error('B3S_SCANNER_API_TOKEN no configurado');
  return token;
}

// La API v1 sólo es utilizable con las dos variables puestas. Sin ellas hay
// caminos que siguen funcionando (importar un informe público por su URL).
export function apiConfigured(): boolean {
  return Boolean(process.env.B3S_SCANNER_API_URL?.trim() && readApiToken());
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let envelope: ApiErrorEnvelope = {};
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // Nunca devolvemos el body en bruto: podría contener datos internos.
    }
    throw new B3SApiError({
      status: response.status,
      code: envelope.error?.code || `http_${response.status}`,
      message: envelope.error?.message || `B3S Scanner API respondió ${response.status}`,
      requestId: envelope.error?.request_id || null,
      details: envelope.error?.details || null,
    });
  }

  return (await response.json()) as T;
}

export interface CreateScanOptions {
  brandName?: string;
  allowDegradedFallback?: boolean;
  idempotencyKey?: string;
}

export async function createScan(url: string, options: CreateScanOptions = {}): Promise<ScanJob> {
  return request<ScanJob>('/scans', {
    method: 'POST',
    headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    body: JSON.stringify({
      url,
      ...(options.brandName?.trim() ? { brand_name: options.brandName.trim() } : {}),
      language: 'es',
      allow_degraded_fallback: options.allowDegradedFallback ?? false,
    }),
  });
}

export async function getScanStatus(id: string): Promise<ScanJob> {
  return request<ScanJob>(`/scans/${encodeURIComponent(id)}`);
}

export async function continueScan(id: string): Promise<ScanJob> {
  return request<ScanJob>(`/scans/${encodeURIComponent(id)}/continue`, { method: 'POST' });
}

export async function cancelScan(id: string): Promise<ScanJob> {
  return request<ScanJob>(`/scans/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export async function pollScan(
  id: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ScanJob> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await getScanStatus(id);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      throw new B3SApiError({
        status: 409,
        code: job.failure?.code || 'scan_execution_failed',
        message: job.failure?.message || 'El scan ha fallado',
        details: { retryable: job.failure?.retryable ?? false },
      });
    }
    if (job.status === 'cancelled') {
      throw new B3SApiError({ status: 409, code: 'scan_cancelled', message: 'El scan fue cancelado' });
    }
    if (job.status === 'blocked') {
      throw new B3SApiError({
        status: 409,
        code: 'scan_blocked',
        message: 'El scan necesita aprobación para continuar con evidencia degradada',
        details: { continue_url: job.links.continue_scan },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new B3SApiError({
    status: 408,
    code: 'scan_poll_timeout',
    message: `El scan ${id} no terminó dentro del tiempo configurado`,
  });
}

export async function getResult(id: string): Promise<B3SScanResult> {
  return request<B3SScanResult>(`/scans/${encodeURIComponent(id)}/result`);
}

export async function getEvidence(id: string): Promise<B3SScanEvidence> {
  return request<B3SScanEvidence>(`/scans/${encodeURIComponent(id)}/evidence`);
}

export interface ImportedScan {
  found: boolean;
  score: number | null;
  quadrant: string | null;
  brandName: string | null;
  tldr: { summary: string; gaps: string[] };
  evidence: Record<string, unknown>;
  uiUrl: string | null;
  scanId: string | null;
  raw: Record<string, unknown>;
}

function normalizeDomain(rawDomain: string): string {
  return rawDomain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

export function absoluteB3SUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  // Sin API configurada seguimos sabiendo dónde vive el informe público.
  let origin = PUBLIC_BASE;
  try {
    origin = new URL(apiBase()).origin;
  } catch {
    // se queda el origen público
  }
  return new URL(path, origin).toString();
}

function importedScan(result: B3SScanResult, evidence: B3SScanEvidence): ImportedScan {
  return {
    found: true,
    score: result.score.value,
    quadrant: null,
    brandName: result.brand.name.trim() || null,
    tldr: { summary: result.summary.slice(0, 400), gaps: result.not_detected },
    evidence: evidence as unknown as Record<string, unknown>,
    uiUrl: absoluteB3SUrl(result.links.report),
    scanId: result.id,
    raw: result as unknown as Record<string, unknown>,
  };
}

function emptyImport(): ImportedScan {
  return {
    found: false,
    score: null,
    quadrant: null,
    brandName: null,
    tldr: { summary: '', gaps: [] },
    evidence: {},
    uiUrl: null,
    scanId: null,
    raw: {},
  };
}

export async function getBrandProfile(rawDomain: string): Promise<ImportedScan> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return emptyImport();
  const history = await request<BrandScanHistory>(
    `/brands/${encodeURIComponent(domain)}/scans?limit=1&offset=0`,
  );
  const latest = history.items[0];
  if (!latest) return emptyImport();
  const [result, evidence] = await Promise.all([getResult(latest.id), getEvidence(latest.id)]);
  return importedScan(result, evidence);
}

export function reportScanIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const match = parsed.pathname.match(
      /(?:\/report\/|\/api\/v1\/scans\/)([a-z0-9_-]{4,})(?:\/result|\/evidence|\.md)?\/?$/i,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------- Plan B: informe público en Markdown ----------
// Los informes de b3s.fly.dev/report/{id} siguen siendo legibles sin token.
// No traen evidencia estructurada, pero sí score, nombre y el análisis por
// dimensiones que parsea lib/scan-report.ts. Suficiente para el argumentario.
export function brandNameFromMarkdown(md: string): string | null {
  const m = md.match(/^#\s*Brand3 Scanner\s*[—–-]\s*(.+)$/m);
  return m?.[1].trim() || null;
}

async function publicReportImport(scanId: string): Promise<ImportedScan> {
  const response = await fetch(`${PUBLIC_BASE}/report/${encodeURIComponent(scanId)}.md`, {
    cache: 'no-store',
    headers: { Accept: 'text/markdown' },
  });
  if (!response.ok) return emptyImport();

  const markdown = await response.text();
  if (markdown.length < 200 || !/Brand3 Scanner/.test(markdown)) return emptyImport();

  const scoreMatch = markdown.match(/Brand3 Score:\s*\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
  const summaryMatch = markdown.split(/\n## /)[0].match(/^>\s*(.+)$/m);
  const gaps = [...markdown.split(/\n## /).slice(1)]
    .filter((block) => /_No detectado\._/.test(block))
    .map((block) => block.split('\n')[0].replace(/[#*]/g, '').trim())
    .filter(Boolean);

  return {
    found: true,
    score: scoreMatch ? Math.round(parseFloat(scoreMatch[1])) : null,
    quadrant: null,
    brandName: brandNameFromMarkdown(markdown),
    tldr: { summary: (summaryMatch?.[1] ?? '').trim().slice(0, 400), gaps },
    evidence: {},
    uiUrl: `${PUBLIC_BASE}/report/${scanId}`,
    scanId,
    raw: { markdown, source: 'public_report' },
  };
}

export async function getReportByUrl(url: string): Promise<ImportedScan> {
  const scanId = reportScanIdFromUrl(url);
  if (!scanId) return emptyImport();
  // Sin credenciales de la API v1, el informe público es la única vía.
  if (!apiConfigured()) return publicReportImport(scanId);
  try {
    const [result, evidence] = await Promise.all([getResult(scanId), getEvidence(scanId)]);
    return importedScan(result, evidence);
  } catch (error) {
    if (error instanceof B3SApiError && error.status === 404) return emptyImport();
    // Token caducado o sin permiso: antes de romper, probamos la vía pública.
    if (error instanceof B3SApiError && (error.status === 401 || error.status === 403)) {
      const fallback = await publicReportImport(scanId);
      if (fallback.found) return fallback;
    }
    throw error;
  }
}

export function extractScore(result: B3SScanResult): number | null {
  return result.score.value;
}

export function storedTldr(result: B3SScanResult): { summary: string; gaps: string[] } {
  return { summary: result.summary, gaps: result.not_detected };
}

export function storedScanStatus(status: B3SScanStatus):
  | 'running'
  | 'blocked'
  | 'ready'
  | 'failed'
  | 'cancelled' {
  if (status === 'completed') return 'ready';
  return status;
}
