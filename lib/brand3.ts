// Cliente del Brand3 Scanner API (spec §4)
// Base: https://brand3.fly.dev/api/v1/scanner
// Auth: Bearer <BRAND3_SCANNER_API_TOKEN>. Es un secreto compartido que vive
// en la config del servidor Brand3 (Fly.io secrets); lo tiene Jesús (GsusFC).
// No se emite desde ninguna web ni está en el repo. Mín. 24 caracteres.

const BASE = 'https://brand3.fly.dev/api/v1/scanner';

function headers(): Record<string, string> {
  const token = process.env.BRAND3_SCANNER_API_TOKEN || process.env.BRAND3_TOKEN;
  if (!token) throw new Error('BRAND3_SCANNER_API_TOKEN no configurado (pedir a Jesús)');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface ScanJob {
  id: number;
  status: 'queued' | 'running' | 'ready' | 'failed';
  phase?: string;
  status_url?: string;
  result_url?: string;
  ui_url?: string;
  error_message?: string;
  [key: string]: unknown;
}

export async function createScan(url: string, lang = 'en'): Promise<ScanJob> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ url, lang, mode: 'advanced', include_audit: true }),
  });
  if (!res.ok) throw new Error(`Scanner create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getScanStatus(id: number): Promise<ScanJob> {
  const res = await fetch(`${BASE}/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`Scanner status failed: ${res.status}`);
  return res.json();
}

export async function pollScan(id: number, timeoutMs = 10 * 60 * 1000): Promise<ScanJob> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await getScanStatus(id);
    if (job.status === 'ready') return job;
    if (job.status === 'failed') throw new Error(job.error_message || 'Scan failed');
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`Scanner timeout (job ${id})`);
}

export async function getResult(id: number, lang = 'en'): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${id}/result?lang=${lang}`, { headers: headers() });
  if (res.status === 409) throw new Error('Scan not ready');
  if (!res.ok) throw new Error(`Scanner result failed: ${res.status}`);
  return res.json();
}

export async function getEvidence(id: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${id}/evidence`, { headers: headers() });
  if (!res.ok) throw new Error(`Scanner evidence failed: ${res.status}`);
  return res.json();
}

// ---------- Perfil público del Observatorio (SIN token) ----------
// GET /api/brands/{domain}/profile es abierto: devuelve el análisis de una
// marca YA escaneada en Brand3. Permite importar scans previos sin el token
// del Scanner API. Los 170+ scans del Observatorio están disponibles así.
const OBSERVATORY = 'https://brand3.fly.dev';

export interface ImportedScan {
  found: boolean;
  score: number | null; // score magnetism (la óptica FLOC), o best_score
  quadrant: string | null; // ej: "Marca sin escribir · target FLOC*"
  brandName: string | null; // nombre comercial real ("B-Zero", no el dominio)
  tldr: { summary: string; gaps: string[] };
  evidence: Record<string, unknown>;
  uiUrl: string | null; // link al informe en brand3.fly.dev
  scanId: number | null;
  raw: Record<string, unknown>;
}

// El nombre comercial va en el H1 del informe: "# Brand3 Scanner — B-Zero".
export function brandNameFromMarkdown(md: string): string | null {
  const m =
    md.match(/^#\s*Brand3 Scanner\s*[—–]\s*(.+?)\s*$/m) ||
    md.match(/^#\s*Brand3 Scanner\s+-\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

interface ScanRef {
  score?: number;
  score_model?: string;
  quadrant?: string;
  href?: string;
  magnetism_scan_id?: number | null;
  sv9_scan_id?: number | null;
  source_run_id?: number | null;
}

export async function getBrandProfile(rawDomain: string): Promise<ImportedScan> {
  const domain = rawDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const res = await fetch(`${OBSERVATORY}/api/brands/${encodeURIComponent(domain)}/profile`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return emptyImport();
  if (!res.ok) throw new Error(`Brand profile failed: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const profile = (data.profile ?? {}) as Record<string, unknown>;
  const scans = (data.scans ?? []) as ScanRef[];
  // El score de la óptica FLOC es el modelo 'magnetism' (marca definida o no).
  const magnetism = scans.find((s) => s.score_model === 'magnetism');
  const best = (data.best_score as number | undefined) ?? null;
  const chosen = magnetism ?? scans[0];

  const score = magnetism?.score ?? best ?? null;
  const gaps = (profile.evidence_gaps as string[] | undefined) ?? [];
  const summary = ((profile.summary as string) ?? (profile.audience as string) ?? '').slice(0, 400);
  const href = chosen?.href ?? null;

  const brandName =
    ((profile.name as string) ||
      (data.name as string) ||
      (data.brand as string) ||
      (profile.brand_name as string) ||
      null) ??
    null;

  return {
    found: true,
    score,
    quadrant: magnetism?.quadrant ?? null,
    brandName: brandName ? brandName.trim() : null,
    tldr: { summary, gaps },
    evidence: {
      dimensions: (data.visual_signature_scan as Record<string, unknown> | undefined)?.dimensions ?? null,
      proof_points: profile.proof_points ?? null,
      offer: profile.offer ?? null,
    },
    uiUrl: href ? `${OBSERVATORY}${href}` : null,
    scanId: magnetism?.magnetism_scan_id ?? chosen?.sv9_scan_id ?? chosen?.source_run_id ?? null,
    raw: data,
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

// ---------- Informe individual de B3S por URL (b3s.fly.dev/report/{hash}) ----------
// Cada informe tiene una versión markdown (.md) limpia y parseable, pública.
// Es la vía fiable para importar: pegas la URL del informe y se extraen score,
// resumen y gaps (las secciones marcadas "_No detectado._").
const B3S = 'https://b3s.fly.dev';

export function reportHashFromUrl(url: string): string | null {
  const m = url.match(/\/report\/([a-f0-9]{6,})/i);
  return m ? m[1] : null;
}

export async function getReportByUrl(url: string): Promise<ImportedScan> {
  const hash = reportHashFromUrl(url.trim());
  if (!hash) return emptyImport();
  const res = await fetch(`${B3S}/report/${hash}.md`, { headers: { Accept: 'text/markdown' } });
  if (res.status === 404) return emptyImport();
  if (!res.ok) throw new Error(`Report fetch failed: ${res.status}`);
  const md = await res.text();

  // Score: "Brand3 Score: **57/100**"
  const scoreMatch = md.match(/Score:\s*\*\*(\d+(?:\.\d+)?)\s*\/\s*100\*\*/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

  // Resumen: el primer blockquote (línea que empieza por "> ")
  const summaryMatch = md.match(/^>\s*(.+)$/m);
  const summary = (summaryMatch?.[1] ?? '').trim();

  // Gaps: secciones "## X" cuyo cuerpo contiene "_No detectado._"
  const gaps: string[] = [];
  const sections = md.split(/\n## /).slice(1);
  for (const s of sections) {
    const title = s.split('\n')[0].trim();
    if (/_No detectado\._/i.test(s)) gaps.push(`${title} no detectada en superficies públicas`);
  }

  return {
    found: true,
    score,
    quadrant: null,
    brandName: brandNameFromMarkdown(md),
    tldr: { summary: summary.slice(0, 400), gaps },
    evidence: { model: md.match(/Modelo:\s*([^\n]+)/)?.[1]?.trim() ?? null },
    uiUrl: `${B3S}/report/${hash}`,
    scanId: parseInt(hash.slice(0, 8), 16) % 2147483647, // hash → int estable para scanner_job_id
    raw: { source: 'b3s_report', hash, markdown: md.slice(0, 8000) },
  };
}

// El schema OpenAPI de /result es abierto (additionalProperties: true).
// Extrae el score principal probando las claves más plausibles.
// TODO semana 1: mapear el payload real y eliminar esta heurística.
export function extractScore(result: Record<string, unknown>): number | null {
  for (const key of ['score', 'overall_score', 'total_score', 'brand_score', 'magnetism']) {
    const v = result[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).value === 'number') {
      return (v as { value: number }).value;
    }
  }
  return null;
}
