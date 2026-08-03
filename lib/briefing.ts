// El digest del briefing: lo que convierte una lista de leads en un plan de
// trabajo. Un briefing real responde tres preguntas: qué ha cambiado desde
// ayer, qué toca hacer hoy y qué se está escapando. Todo se DERIVA de datos
// que ya existen (señales, mensajes, etapas, decay del radar): nada nuevo que
// mantener, y por construcción cambia cada día porque el tiempo pasa.
import type { BriefingLead } from './types';
import { companyLabel } from './types';
import { computeRadar, signalMeta, occurredAt, type Radar } from './radar';

const DAY = 86_400_000;

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

export function diasLabel(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

// ---------- Novedades: qué ha cambiado en las últimas 48h ----------
// Señales detectadas y scans terminados. Es lo que hace que el briefing de
// hoy no sea el de ayer; si no hay nada, se dice, no se rellena.
export interface Novedad {
  kind: 'señal' | 'scan';
  domain: string;
  company: string;
  text: string;
  at: string;
}

export function novedades(leads: BriefingLead[], now = new Date()): Novedad[] {
  const out: Novedad[] = [];
  const seen = new Set<string>();
  for (const bl of leads) {
    if (!bl.company) continue;
    const name = companyLabel(bl.company.name, bl.company.domain);
    for (const s of bl.signals) {
      const key = `s:${s.id}`;
      if (seen.has(key) || daysSince(s.detected_at, now) > 2) continue;
      seen.add(key);
      const meta = signalMeta(s.type);
      const d = s.detail as Record<string, unknown> | null;
      const extra = [d?.round, d?.amount].filter(Boolean).join(' · ');
      out.push({
        kind: 'señal',
        domain: bl.company.domain,
        company: name,
        text: `${meta?.label ?? s.type}${extra ? ` · ${extra}` : ''}`,
        at: s.detected_at,
      });
    }
    if (
      bl.scan?.status === 'ready' &&
      daysSince(bl.scan.created_at, now) <= 2 &&
      !seen.has(`c:${bl.scan.id}`)
    ) {
      seen.add(`c:${bl.scan.id}`);
      out.push({
        kind: 'scan',
        domain: bl.company.domain,
        company: name,
        text: `Scan listo · ${bl.scan.score ?? '—'}/100`,
        at: bl.scan.created_at,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------- Seguimientos: contactados sin respuesta ----------
// La cadencia humana de LinkedIn: a los 5 días sin respuesta toca volver a
// aparecer. La fecha buena es sent_at (cuándo se envió de verdad); updated_at
// es el respaldo para etapas movidas a mano.
export interface Seguimiento {
  bl: BriefingLead;
  days: number;
  reason: 'sin_respuesta' | 'conversacion_fria';
}

const FOLLOW_UP_DAYS = 5;
const COLD_CONVERSATION_DAYS = 7;

export function seguimientos(leads: BriefingLead[], now = new Date()): Seguimiento[] {
  const out: Seguimiento[] = [];
  for (const bl of leads) {
    if (!bl.company) continue;
    if (bl.lead.stage === 'contacted') {
      const since = bl.message?.sent_at ?? bl.lead.updated_at;
      const days = daysSince(since, now);
      if (days >= FOLLOW_UP_DAYS) out.push({ bl, days, reason: 'sin_respuesta' });
    } else if (['conversation', 'call', 'proposal'].includes(bl.lead.stage)) {
      const days = daysSince(bl.lead.updated_at, now);
      if (days >= COLD_CONVERSATION_DAYS) out.push({ bl, days, reason: 'conversacion_fria' });
    }
  }
  // Lo más abandonado primero: es lo que más urge rescatar.
  return out.sort((a, b) => b.days - a.days);
}

// ---------- Caducidades: señales a punto de perder fuerza ----------
// El decay va a escalones (45/90/180 días). Una señal a días de cruzar un
// escalón es EL argumento para contactar hoy y no la semana que viene: el
// timing que la puso en la cola se está agotando.
export interface Caducidad {
  bl: BriefingLead;
  label: string; // qué señal
  daysLeft: number; // días hasta el escalón
  from: number; // fuerza actual (0-1)
  to: number; // fuerza tras el escalón
}

const EDGES: [number, number, number][] = [
  // [día del escalón, fuerza antes, fuerza después]
  [45, 1.0, 0.7],
  [90, 0.7, 0.4],
  [180, 0.4, 0.0],
];
const EXPIRY_WINDOW = 7;

export function caducidades(
  activos: { bl: BriefingLead; radar: Radar }[],
  now = new Date(),
): Caducidad[] {
  const out: Caducidad[] = [];
  for (const { bl, radar } of activos) {
    const best = radar.best;
    if (!best) continue;
    const edge = EDGES.find(([day]) => best.days <= day && day - best.days <= EXPIRY_WINDOW);
    if (!edge) continue;
    out.push({
      bl,
      label: best.label,
      daysLeft: edge[0] - best.days,
      from: edge[1],
      to: edge[2],
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------- La frase del día ----------
// Un briefing empieza con la lectura, no con la lista. Declarativa y honesta:
// si no hay nada, dice que no hay nada.
export function resumen(counts: {
  cola: number;
  novedades: number;
  seguimientos: number;
  caducan: number;
}): string {
  const partes: string[] = [];
  if (counts.novedades > 0) {
    partes.push(counts.novedades === 1 ? 'una novedad desde ayer' : `${counts.novedades} novedades desde ayer`);
  }
  if (counts.cola > 0) {
    partes.push(counts.cola === 1 ? '1 lead con señal viva' : `${counts.cola} leads con señal viva`);
  }
  if (counts.seguimientos > 0) {
    partes.push(counts.seguimientos === 1 ? '1 seguimiento pendiente' : `${counts.seguimientos} seguimientos pendientes`);
  }
  if (counts.caducan > 0) {
    partes.push(counts.caducan === 1 ? '1 señal a punto de perder fuerza' : `${counts.caducan} señales a punto de perder fuerza`);
  }
  if (partes.length === 0) return 'Día tranquilo: sin novedades y sin cola. Buen momento para alimentar el radar.';
  const frase = partes.join(', ');
  return frase.charAt(0).toUpperCase() + frase.slice(1) + '.';
}

// Fecha del briefing en horario de Madrid, que es donde se trabaja.
export function fechaBriefing(now = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  }).format(now);
}

// Ocurrencia de la señal viva más reciente, para ordenar la cola de forma
// secundaria (a igual radar, la más fresca primero).
export function frescura(bl: BriefingLead): number {
  const dates = bl.signals.map((s) => occurredAt(s)).filter((d): d is string => !!d);
  return dates.length ? Math.max(...dates.map((d) => new Date(d).getTime())) : 0;
}

export { computeRadar };
