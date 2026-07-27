// Radar v2 — eje TIMING (spec 27/07/2026).
//
// El radar mide dos cosas distintas y las multiplica:
//   fit    (0-10) qué oportunidad de marca hay
//   timing (0-10) si ES EL MOMENTO, según la mejor señal viva
//   radar  = fit × timing  (0-100)
//
// Reglas que gobiernan este fichero (de la spec; si algo las contradice, está
// mal, no al revés):
//  1. Un valor por defecto NO es un dato. Sin señal → null, no un número.
//  2. La señal caduca: el decaimiento va sobre occurred_at (cuándo PASÓ),
//     nunca sobre detected_at (cuándo lo vimos).
//  3. No todas las señales pesan igual: el peso lo da el tipo. La ronda es
//     de las más débiles (capacidad de pago, no intención de marca).
//  4. Elegibilidad y prioridad son cosas distintas: primero el estado
//     (activo/reserva/no_escaneable), después el orden.
//
// Multiplicativo, no aditivo: un fit excelente con timing cero es prioridad
// cero. Y MÁXIMO, no suma: una intención declarada vale más que cinco señales
// débiles apiladas.
import type { BriefingLead, Signal } from './types';

export const RADAR_VERSION = 'v2';

// ---------- Tipos de señal y su peso ----------
// El nivel se DERIVA del tipo; no es editable a mano.
export type SignalLevel = 'A' | 'B' | 'C';

export const SIGNAL_TYPES: {
  type: string;
  level: SignalLevel;
  weight: number;
  label: string;
  hint: string;
}[] = [
  // A (10): intención de marca declarada. Lo más fuerte que existe.
  { type: 'rebranding_declarado', level: 'A', weight: 10, label: 'Rebranding declarado', hint: 'Dice en público o en respuesta que se plantea rebranding, naming o reposicionamiento' },
  { type: 'oferta_empleo_marca', level: 'A', weight: 10, label: 'Oferta de empleo de marca', hint: 'Vacante de Brand / Marketing / Design Lead o Head of Brand' },
  { type: 'busqueda_agencia', level: 'A', weight: 10, label: 'Busca agencia', hint: 'Pide recomendaciones de estudio o agencia públicamente' },
  // B (6): movimiento real en la superficie de marca.
  { type: 'web_nueva', level: 'B', weight: 6, label: 'Web nueva', hint: 'Rediseño o dominio nuevo detectado' },
  { type: 'cambio_nombre', level: 'B', weight: 6, label: 'Cambio de nombre', hint: 'Cambio de naming en curso' },
  { type: 'pivot_lanzamiento', level: 'B', weight: 6, label: 'Pivot o lanzamiento', hint: 'Producto nuevo o pivot anunciado' },
  { type: 'cambio_ceo_cmo', level: 'B', weight: 6, label: 'Cambio de CEO o CMO', hint: 'Entrada de CMO, cambio de CEO' },
  { type: 'expansion_mercado', level: 'B', weight: 6, label: 'Expansión de mercado', hint: 'Nuevo mercado o idioma' },
  // Levantando ronda AHORA (no una ya cerrada): momento de máxima presión
  // narrativa, necesitan contar la historia para el deck. Pesa más que una
  // ronda cerrada (capacidad de pago) y menos que una intención declarada.
  { type: 'levantando_ronda', level: 'B', weight: 6, label: 'Levantando ronda', hint: 'Está en proceso de levantar: necesita narrativa para inversores' },
  // C (3): contexto, no intención.
  { type: 'ronda', level: 'C', weight: 3, label: 'Ronda de financiación', hint: 'Solo capacidad de pago' },
  { type: 'crecimiento_plantilla', level: 'C', weight: 3, label: 'Crecimiento de plantilla', hint: 'Contratación agresiva sin perfil de marca' },
];

// Tipos heredados del esquema viejo (signals.type era texto libre).
const LEGACY_TYPE_MAP: Record<string, string> = {
  funding_round: 'ronda',
  rebrand: 'cambio_nombre',
  launch: 'pivot_lanzamiento',
  hiring: 'crecimiento_plantilla',
};

export function canonicalType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (SIGNAL_TYPES.some((s) => s.type === t)) return t;
  return LEGACY_TYPE_MAP[t] ?? null;
}

export function signalMeta(raw: string | null | undefined) {
  const t = canonicalType(raw);
  return t ? (SIGNAL_TYPES.find((s) => s.type === t) ?? null) : null;
}

// ---------- Decaimiento ----------
// Escalones de la spec. Pasados 180 días la señal vale 0: ya no es timing.
export function decay(days: number): number {
  if (days <= 45) return 1.0;
  if (days <= 90) return 0.7;
  if (days <= 180) return 0.4;
  return 0.0;
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

// CUÁNDO OCURRIÓ el evento, que es lo único que decae. detected_at es
// auditoría y nunca entra en el cálculo: una ronda de hace 1000 días
// detectada hoy no es una señal fresca.
export function occurredAt(signal: Signal): string | null {
  const d = signal.detail as Record<string, unknown> | null;
  const raw = d?.occurred_at ?? d?.announced_at ?? d?.date;
  if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return raw;
  return null;
}

export function signalEvidence(signal: Signal): string | null {
  const d = signal.detail as Record<string, unknown> | null;
  const raw = d?.evidence ?? d?.quote;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function signalSourceUrl(signal: Signal): string | null {
  const d = signal.detail as Record<string, unknown> | null;
  const raw = d?.source_url ?? d?.url;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export interface ScoredSignal {
  signal: Signal;
  type: string;
  label: string;
  level: SignalLevel;
  weight: number;
  occurredAt: string;
  days: number;
  decay: number;
  value: number; // peso × decay
  evidence: string | null;
  sourceUrl: string | null;
}

// Valora una señal. Devuelve null si no es utilizable: sin tipo conocido, sin
// occurred_at o sin evidencia. Una señal sin evidencia no sostiene un número.
export function scoreSignal(signal: Signal, now = new Date()): ScoredSignal | null {
  const meta = signalMeta(signal.type);
  const when = occurredAt(signal);
  const evidence = signalEvidence(signal);
  if (!meta || !when || !evidence) return null;
  const days = daysSince(when, now);
  const dec = decay(days);
  return {
    signal,
    type: meta.type,
    label: meta.label,
    level: meta.level,
    weight: meta.weight,
    occurredAt: when,
    days,
    decay: dec,
    value: meta.weight * dec,
    evidence,
    sourceUrl: signalSourceUrl(signal),
  };
}

// ---------- Fit ----------
// Se mantiene la lectura monótona (score bajo del Scanner = más hueco de
// marca), pendiente de evaluar la curva en U de la §4.1. Lo que sí se aplica
// es la regla dura: sin scan válido no hay fit inventado, hay null.
export function fitScore(bl: BriefingLead): number | null {
  const scan = bl.scan;
  if (!scan || scan.status !== 'ready' || scan.score == null) return null;
  const s = Number(scan.score);
  // Un 0 no es "oportunidad máxima": es un scan que no pudo leer nada.
  if (!Number.isFinite(s) || s <= 0) return null;
  const fit = Math.round(((100 - s) / 100) * 10);
  return Math.max(1, Math.min(10, fit));
}

// ---------- Radar ----------
export type RadarState = 'activo' | 'reserva' | 'no_escaneable';

export interface Radar {
  state: RadarState;
  fit: number | null;
  timing: number | null;
  score: number | null; // fit × timing, 0-100
  best: ScoredSignal | null; // la señal que sostiene el número
  live: ScoredSignal[]; // todas las señales con valor > 0
  version: string;
}

// MÁXIMO de las señales vivas, nunca suma.
export function timingScore(signals: Signal[], now = new Date()): {
  timing: number | null;
  best: ScoredSignal | null;
  live: ScoredSignal[];
} {
  const live = signals
    .map((s) => scoreSignal(s, now))
    .filter((s): s is ScoredSignal => s != null && s.value > 0)
    .sort((a, b) => b.value - a.value || b.occurredAt.localeCompare(a.occurredAt));
  if (!live.length) return { timing: null, best: null, live: [] };
  return { timing: Math.round(live[0].value), best: live[0], live };
}

export function computeRadar(
  bl: BriefingLead,
  signals: Signal[],
  now = new Date(),
): Radar {
  const fit = fitScore(bl);
  const { timing, best, live } = timingScore(signals, now);
  // Sin scan utilizable no se puede valorar: fuera de la cola, a reintento.
  if (fit == null) {
    return { state: 'no_escaneable', fit: null, timing, score: null, best, live, version: RADAR_VERSION };
  }
  // Con fit pero sin señal viva: no es un lead malo, es un lead esperando
  // su momento. A reserva, automáticamente y por caducidad.
  if (timing == null) {
    return { state: 'reserva', fit, timing: null, score: null, best: null, live: [], version: RADAR_VERSION };
  }
  return {
    state: 'activo',
    fit,
    timing,
    score: fit * timing,
    best,
    live,
    version: RADAR_VERSION,
  };
}

// "hace 12 días" / "hoy" — para mostrar la señal junto al número.
export function agoLabel(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(days / 365);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}
