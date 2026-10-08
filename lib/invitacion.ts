// La invitación de LinkedIn como paso propio del embudo. En LinkedIn el
// mensaje no sale hasta que el founder acepta la conexión, así que
// "Contactado" no puede empezar a contar el día que se invita.
//
//   detected → invited (invitación enviada) → connected (aceptó, falta el
//   mensaje) → contacted (mensaje enviado)
//
// Si no acepta, el lead se aparca en pausa con este motivo: no es un
// descarte, la marca sigue siendo buena.
import type { BriefingLead, Lead } from './types';

export const PAUSA_NO_ACEPTA = 'No acepta conexión';

const DAY = 86_400_000;

// Cuándo se invitó. Sin la migración 20261008 (o en leads movidos antes)
// no hay invited_at y la fecha de respaldo es updated_at.
export function fechaInvitacion(lead: Lead): string {
  return lead.invited_at ?? lead.updated_at;
}

export function diasDesdeInvitacion(lead: Lead, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(fechaInvitacion(lead)).getTime()) / DAY));
}

// Invitaciones sin aceptar, la más antigua primero: es la que más urge
// revisar en LinkedIn.
export function invitacionesPendientes(leads: BriefingLead[], now = new Date()): Invitacion[] {
  return leads
    .filter((bl) => bl.lead.stage === 'invited')
    .map((bl) => invitacion(bl, now))
    .sort((a, b) => b.days - a.days);
}

// ---------- Avisos: qué hacer con una invitación que no se acepta ----------
// 7 días: mirar si aceptó y dejarse ver. 14: probar otra vía. 21: retirarla
// (LinkedIn limita las pendientes; al retirarla no se puede volver a invitar a
// esa persona en unas tres semanas) y aparcar el lead.
export type NivelInvitacion = 'reciente' | 'revisar' | 'otra_via' | 'retirar';

export function nivelInvitacion(days: number): NivelInvitacion {
  if (days >= 21) return 'retirar';
  if (days >= 14) return 'otra_via';
  if (days >= 7) return 'revisar';
  return 'reciente';
}

export const AVISO_INVITACION: Record<Exclude<NivelInvitacion, 'reciente'>, string> = {
  revisar: 'Mira si aceptó. Si no, comenta algo suyo para que tu nombre le suene.',
  otra_via: 'Dos semanas sin aceptar: prueba otra vía (su email, un cofundador o un InMail).',
  retirar: 'Tres semanas sin aceptar: retírala en LinkedIn y pásala a pausa.',
};

const SILENCIO = 7; // días que "Sigue pendiente" calla el aviso

export interface Invitacion {
  bl: BriefingLead;
  days: number;
  nivel: NivelInvitacion;
  // Hay algo que hacer hoy: nivel con aviso y sin revisar en la última semana.
  activa: boolean;
  revisadaHace: number | null;
}

export function invitacion(bl: BriefingLead, now = new Date()): Invitacion {
  const days = diasDesdeInvitacion(bl.lead, now);
  const nivel = nivelInvitacion(days);
  const check = bl.lead.invite_checked_at;
  const revisadaHace = check ? Math.max(0, Math.floor((now.getTime() - new Date(check).getTime()) / DAY)) : null;
  const activa = nivel !== 'reciente' && (revisadaHace == null || revisadaHace >= SILENCIO);
  return { bl, days, nivel, activa, revisadaHace };
}

// ---------- Vuelven al radar ----------
// Un lead aparcado porque no aceptó no se pierde: si aparece una señal nueva
// de la marca (otra ronda, un lanzamiento) después de la pausa, hay un motivo
// nuevo para volver a invitar.
export function fechaPausa(lead: Lead): string {
  return lead.paused_at ?? lead.updated_at;
}

export function vuelvenAlRadar(leads: BriefingLead[]): { bl: BriefingLead; signal: BriefingLead['signals'][number] }[] {
  const out: { bl: BriefingLead; signal: BriefingLead['signals'][number] }[] = [];
  for (const bl of leads) {
    if (bl.lead.stage !== 'paused' || bl.lead.discard_reason !== PAUSA_NO_ACEPTA) continue;
    const desde = new Date(fechaPausa(bl.lead)).getTime();
    const nueva = bl.signals
      .filter((s) => new Date(s.detected_at).getTime() > desde)
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))[0];
    if (nueva) out.push({ bl, signal: nueva });
  }
  return out.sort((a, b) => b.signal.detected_at.localeCompare(a.signal.detected_at));
}
