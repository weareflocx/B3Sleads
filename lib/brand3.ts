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
