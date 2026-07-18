// priority_score v0.2 (spec §8 + revisión Explee) — iterar con datos reales.
// priority = recencia*0.4 + ronda*0.2 + gap_marca*0.3 + fit_ICP*0.1
// gap_de_marca invertido: score bajo del Scanner = más oportunidad.
// v0.2: fit sin sesgo crypto — el ICP es startup early-stage de CUALQUIER
// sector; el sector solo penaliza si es desconocido.

import type { Signal, Scan, Company, BriefingLead } from './types';

// Temperatura del lead en llamas (0-5) a partir de un score 0-100.
// ≥90 = respondió o señal máxima; los umbrales bajan de 15 en 15.
export function heatLevel(score: number | null): number {
  if (score == null) return 0;
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 45) return 2;
  if (score >= 25) return 1;
  return 0;
}

export interface Temperature {
  level: number; // 0-5 llamas
  score: number; // 0-100
  trend: 'up' | 'down' | 'flat'; // calentando / enfriando
  note: string; // por qué (tooltip)
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Temperatura VIVA del lead: se calcula del estado actual, no del score
// congelado al insertar. Sube con la intención (etapa, respuesta, interacción,
// ronda, hueco de marca) y BAJA con la inactividad desde el último contacto.
// Así un lead se enfría solo si lo dejas parado, que es lo que pedía la escala.
export function leadTemperature(bl: BriefingLead): Temperature {
  const stage = bl.lead.stage;
  if (stage === 'won') return { level: 5, score: 100, trend: 'flat', note: 'Cerrado' };
  if (stage === 'lost') return { level: 0, score: 0, trend: 'flat', note: 'Perdido' };
  if (stage === 'discarded') return { level: 0, score: 0, trend: 'flat', note: 'Descartado' };

  let score = 0;
  const reasons: string[] = [];

  // 1) Intención declarada por la etapa del embudo
  const stageScore: Partial<Record<string, number>> = {
    detected: 8,
    briefed: 10,
    contacted: 28,
    conversation: 60,
    call: 74,
    proposal: 84,
  };
  score += stageScore[stage] ?? 10;

  const inTalks = stage === 'conversation' || stage === 'call' || stage === 'proposal';
  const engaged = bl.contact?.source === 'engaged' || bl.company?.source === 'engaged';
  if (inTalks) reasons.push('conversación abierta');
  else if (bl.signal?.type === 'engagement' || engaged) {
    score += 16;
    reasons.push('interactuó con tus posts');
  }

  // 2) Oportunidad de marca: hueco del scan (score bajo = más oportunidad) + fit
  if (bl.scan?.score != null) {
    const s = Number(bl.scan.score);
    score += Math.min(Math.max(0, 70 - s) * 0.35, 18);
    if (s < 50) reasons.push('gap de marca amplio');
  }
  if (bl.company?.icp_fit != null) score += (bl.company.icp_fit / 100) * 10;

  // 3) Ronda reciente
  if (bl.signal?.type === 'funding_round') {
    const d = daysSince(bl.signal.detected_at);
    if (d != null && d <= 90) {
      score += 12;
      reasons.push('ronda reciente');
    }
  }

  // 4) Enfriamiento por inactividad (desde el último toque; si nunca, la edad)
  const lastTouch = daysSince(bl.contact?.last_touch_at) ?? daysSince(bl.lead.updated_at);
  let trend: Temperature['trend'] = 'flat';
  if (stage === 'contacted' || inTalks) {
    if (lastTouch != null && lastTouch >= 30) {
      score -= 28;
      trend = 'down';
      reasons.push(`${lastTouch} días sin contacto`);
    } else if (lastTouch != null && lastTouch >= 14) {
      score -= 15;
      trend = 'down';
      reasons.push(`${lastTouch} días sin contacto`);
    } else if (lastTouch != null && lastTouch >= 7) {
      score -= 6;
    }
  } else if (lastTouch != null && lastTouch >= 21) {
    score -= 8;
    trend = 'down';
    reasons.push('lleva en cola sin contactar');
  }

  // 5) Calentamiento reciente: cambió de etapa hoy o ayer
  const sinceUpdate = daysSince(bl.lead.updated_at);
  if (sinceUpdate != null && sinceUpdate <= 1 && trend !== 'down') trend = 'up';

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    level: heatLevel(score),
    score,
    trend,
    note: reasons.length ? reasons.join(' · ') : 'sin señales fuertes todavía',
  };
}

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
