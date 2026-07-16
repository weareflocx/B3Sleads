// priority_score v0 (spec §8) — iterar con datos reales.
// priority = recencia*0.4 + ronda*0.2 + gap_marca*0.3 + fit_ICP*0.1
// gap_de_marca invertido: score bajo del Scanner = más oportunidad.

import type { Signal, Scan, Company } from './types';

const ICP_SECTORS = ['web3', 'ai', 'marketplace', 'ecommerce', 'saas'];

// Normaliza importe de ronda a [0,1]. 10M€+ satura.
function normalizeRoundSize(amountRaw: string | undefined): number {
  if (!amountRaw) return 0.3; // ronda sin importe conocido: neutro-bajo
  const m = amountRaw.replace(',', '.').match(/([\d.]+)\s*(m|k|b)?/i);
  if (!m) return 0.3;
  let amount = parseFloat(m[1]);
  const unit = (m[2] || 'm').toLowerCase();
  if (unit === 'k') amount /= 1000;
  if (unit === 'b') amount *= 1000;
  return Math.min(amount / 10, 1);
}

// Recencia: señal de hoy = 1, decae linealmente a 0 en 30 días.
function recency(detectedAt: string, now = new Date()): number {
  const days = (now.getTime() - new Date(detectedAt).getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 30);
}

export function priorityScore(opts: {
  company: Company;
  signal: Signal | null;
  scan: Scan | null;
}): number {
  const { company, signal, scan } = opts;

  const rec = signal ? recency(signal.detected_at) : 0.2;
  const round = normalizeRoundSize(signal?.detail?.amount as string | undefined);
  // Gap de marca: 100 - score del Scanner. Sin scan: neutro.
  const gap = scan?.score != null ? (100 - Number(scan.score)) / 100 : 0.5;
  const fit = company.sector && ICP_SECTORS.includes(company.sector.toLowerCase()) ? 1 : 0.4;

  let score = (rec * 0.4 + round * 0.2 + gap * 0.3 + fit * 0.1) * 100;

  // Warm siempre gana a cold (spec §10.3)
  if (company.source === 'engaged') score += 20;

  return Math.round(Math.min(score, 100) * 10) / 10;
}
