// La señal de ronda de una empresa, de un vistazo: "Ronda detectada" (cerrada
// y anunciada) o "Buscando ronda" (sin cerrar).
//
// No es una columna nueva: sale de las señales que ya existían. Una ronda
// cerrada es una señal `funding_round`; una que están levantando, una
// `levantando_ronda`. Importe, fecha del anuncio y fuente ya vivían en su
// detalle; la confirmación se guarda ahí también (`detail.confirmada`). Así
// las empresas sin señal siguen exactamente igual que antes.
import type { Signal } from './types';

export type TipoRonda = 'detectada' | 'buscando';

export interface SenalRonda {
  tipo: TipoRonda;
  importe: string | null;
  fecha: string; // del anuncio (o de cuándo se registró, si no hay otra)
  fuente: string | null; // URL
  confirmada: boolean;
  signalId: string;
}

export const ETIQUETA_RONDA: Record<TipoRonda, string> = {
  detectada: 'Ronda detectada',
  buscando: 'Buscando ronda',
};

// Cuándo se anunció: la fecha del evento si se conoce, la de alta si no.
export function fechaAnuncio(s: Signal): string {
  const d = (s.detail ?? {}) as Record<string, unknown>;
  for (const k of ['announced_at', 'occurred_at', 'date']) {
    const v = d[k];
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  }
  return s.detected_at;
}

// Confirmada si alguien lo dijo; si nadie lo ha dicho, cuenta como
// confirmada lo que entró a mano en la ficha y como "sin confirmar" lo que
// llegó solo (pipeline nocturno, buscador, subida en lote).
export function estaConfirmada(s: Signal): boolean {
  const d = (s.detail ?? {}) as Record<string, unknown>;
  if (typeof d.confirmada === 'boolean') return d.confirmada;
  return d.manual === true;
}

function fuenteDe(d: Record<string, unknown>): string | null {
  const v = d.source_url ?? d.url;
  return typeof v === 'string' && /^https?:\/\//i.test(v) ? v : null;
}

// La señal vigente es la más reciente de las dos clases: si después de
// cerrar una ronda empiezan a levantar otra, lo que pesa es que buscan.
export function senalDeRonda(signals: Signal[] | null | undefined): SenalRonda | null {
  const rondas = (signals ?? []).filter((s) => s.type === 'funding_round' || s.type === 'levantando_ronda');
  if (!rondas.length) return null;
  const s = [...rondas].sort((a, b) => fechaAnuncio(b).localeCompare(fechaAnuncio(a)))[0];
  const d = (s.detail ?? {}) as Record<string, unknown>;
  const tipo: TipoRonda = s.type === 'funding_round' ? 'detectada' : 'buscando';
  const importe = tipo === 'detectada' ? d.amount : d.target_amount ?? d.amount;
  return {
    tipo,
    importe: typeof importe === 'string' && importe.trim() ? importe.trim() : null,
    fecha: fechaAnuncio(s),
    fuente: fuenteDe(d),
    confirmada: estaConfirmada(s),
    signalId: s.id,
  };
}

export type FiltroRonda = 'todas' | 'detectada' | 'buscando' | 'ninguna';

export const FILTROS_RONDA: { valor: FiltroRonda; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'detectada', texto: 'Detectada' },
  { valor: 'buscando', texto: 'Buscando' },
  { valor: 'ninguna', texto: 'Ninguna' },
];

export function pasaFiltroRonda(senal: SenalRonda | null, filtro: FiltroRonda): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'ninguna') return senal == null;
  return senal?.tipo === filtro;
}

// Para ordenar por fecha del anuncio, de la más reciente a la más antigua;
// las que no tienen señal, al final.
export function comparaPorAnuncio(a: SenalRonda | null, b: SenalRonda | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.fecha.localeCompare(a.fecha);
}

// "12 sept 2026", en Madrid.
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' });
}
