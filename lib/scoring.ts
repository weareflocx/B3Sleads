// priority_score v0.2 (spec §8 + revisión Explee) — iterar con datos reales.
// priority = recencia*0.4 + ronda*0.2 + gap_marca*0.3 + fit_ICP*0.1
// gap_de_marca invertido: score bajo del Scanner = más oportunidad.
// v0.2: fit sin sesgo crypto — el ICP es startup early-stage de CUALQUIER
// sector; el sector solo penaliza si es desconocido.

import type { Signal, Scan, Company } from './types';

const KNOWN_SECTORS = [
  'saas',
  'ai',
  'marketplace',
  'ecommerce',
  'web3',
  'fintech',
  'consumer',
  'health',
];

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

export interface PriorityBreakdown {
  total: number;
  recencia: number;      // 0-40
  ronda: number;         // 0-20
  gap_marca: number;     // 0-30
  fit_icp: number;       // 0-10
  bonus_engaged: number; // 0 | 20
}

export function priorityBreakdown(opts: {
  company: Company;
  signal: Signal | null;
  scan: Scan | null;
}): PriorityBreakdown {
  const { company, signal, scan } = opts;

  const rec = signal ? recency(signal.detected_at) : 0.2;
  const round = normalizeRoundSize(signal?.detail?.amount as string | undefined);
  // Gap de marca: 100 - score del Scanner. Sin scan: neutro.
  const gap = scan?.score != null ? (100 - Number(scan.score)) / 100 : 0.5;
  // Fit: cualquier sector conocido vale; solo penaliza el desconocido.
  const sector = company.sector?.toLowerCase() ?? null;
  const fit = sector && KNOWN_SECTORS.includes(sector) ? 1 : sector ? 0.8 : 0.6;
  const bonus = company.source === 'engaged' ? 20 : 0; // warm gana a cold (spec §10.3)

  const parts = {
    recencia: Math.round(rec * 40 * 10) / 10,
    ronda: Math.round(round * 20 * 10) / 10,
    gap_marca: Math.round(gap * 30 * 10) / 10,
    fit_icp: Math.round(fit * 10 * 10) / 10,
    bonus_engaged: bonus,
  };
  const total =
    Math.round(
      Math.min(parts.recencia + parts.ronda + parts.gap_marca + parts.fit_icp + bonus, 100) * 10,
    ) / 10;
  return { total, ...parts };
}

export function priorityScore(opts: {
  company: Company;
  signal: Signal | null;
  scan: Scan | null;
}): number {
  return priorityBreakdown(opts).total;
}
