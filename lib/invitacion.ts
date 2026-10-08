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
export function invitacionesPendientes(leads: BriefingLead[], now = new Date()): { bl: BriefingLead; days: number }[] {
  return leads
    .filter((bl) => bl.lead.stage === 'invited')
    .map((bl) => ({ bl, days: diasDesdeInvitacion(bl.lead, now) }))
    .sort((a, b) => b.days - a.days);
}
