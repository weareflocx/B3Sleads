// Rankings del leaderboard. Tres lecturas del mismo embudo:
//  - Usuarios: quién añade y avanza leads (puntos por fase alcanzada).
//  - Founders: momentum de la relación (fase + temperatura + señales).
//  - Startups: la marca (score del Brand3 Scanner).
// Todo se computa de los leads hidratados; nada de métricas externas de
// LinkedIn (seguidores, repercusión) porque eso sería scraping (spec §9):
// la "repercusión" aquí es lo que vemos en el embudo: respondió, avanzó,
// interactuó.

import type { BriefingLead, LeadStage } from './types';
import { displayName } from './types';
import { leadTemperature, type Temperature } from './scoring';

// Puntos por la fase donde está cada lead. Añadir vale poco; avanzar, mucho.
export const STAGE_POINTS: Record<LeadStage, number> = {
  detected: 1,
  briefed: 1,
  contacted: 3,
  conversation: 8,
  call: 12,
  proposal: 20,
  won: 40,
  lost: 5, // llegó lejos aunque no cerrara
  discarded: 0,
};

// Los leads sin atribución (pipeline nocturno, o anteriores al login) se
// atribuyen a Sergio, el dueño del radar hasta que entre el resto del equipo.
export const OWNER_EMAIL = 'sergio@wearefloc.com';

// Etiqueta legible de un usuario: la parte local del email, capitalizada.
// (El nombre de user_metadata no está en leads; el email es la identidad.)
export function userLabel(email: string): string {
  return email.split('@')[0].replace(/^./, (c) => c.toUpperCase());
}

export interface UserRow {
  user: string;
  leads: number;
  conversations: number;
  won: number;
  points: number;
}

// Los mejores captando y trabajando leads. Los leads sin atribución
// (anteriores al login, o del pipeline nocturno) cuentan como equipo.
export function usersRanking(leads: BriefingLead[]): UserRow[] {
  const byUser = new Map<string, UserRow>();
  for (const bl of leads) {
    // Puntúa quien lo trabaja hoy, no quien lo trajo: si un lead se delega,
    // los puntos se van con él. (No se usa leadOwner() para no crear un
    // import circular con lib/team.)
    const key =
      bl.lead.owner_email?.trim() || bl.lead.created_by_email?.trim() || OWNER_EMAIL;
    const row = byUser.get(key) ?? { user: key, leads: 0, conversations: 0, won: 0, points: 0 };
    row.leads += 1;
    row.points += STAGE_POINTS[bl.lead.stage] ?? 0;
    if (['conversation', 'call', 'proposal'].includes(bl.lead.stage)) row.conversations += 1;
    if (bl.lead.stage === 'won') row.won += 1;
    byUser.set(key, row);
  }
  return [...byUser.values()].sort((a, b) => b.points - a.points || b.leads - a.leads);
}

export interface FounderRow {
  name: string;
  avatarUrl: string | null;
  company: string | null;
  domain: string | null;
  stage: LeadStage;
  temp: Temperature;
  replied: boolean;
  points: number;
}

// Los founders con más momentum: fase alcanzada + temperatura viva +
// señales registradas (ronda, engagement). El que respondió, arriba.
export function foundersRanking(leads: BriefingLead[]): FounderRow[] {
  return leads
    .filter((bl) => bl.contact)
    .map((bl) => {
      const temp = leadTemperature(bl);
      const replied =
        ['conversation', 'call', 'proposal', 'won'].includes(bl.lead.stage) ||
        bl.signal?.type === 'engagement';
      const points =
        (STAGE_POINTS[bl.lead.stage] ?? 0) * 2 + Math.round(temp.score / 5) + (bl.signal ? 5 : 0);
      return {
        name: displayName(bl.contact!.full_name),
        avatarUrl: bl.contact!.avatar_url ?? null,
        company: bl.company?.name ?? null,
        domain: bl.company?.domain ?? null,
        stage: bl.lead.stage,
        temp,
        replied,
        points,
      };
    })
    .sort((a, b) => b.points - a.points || b.temp.score - a.temp.score);
}

export interface StartupRow {
  name: string;
  domain: string;
  score: number;
  scannedAt: string | null;
}

// Las mejores marcas según el Brand3 Scanner. Una fila por startup
// (si hay varios leads/scans, el score más alto).
export function startupsRanking(leads: BriefingLead[]): StartupRow[] {
  const byDomain = new Map<string, StartupRow>();
  for (const bl of leads) {
    if (!bl.company || bl.scan?.status !== 'ready' || bl.scan.score == null) continue;
    const score = Number(bl.scan.score);
    const prev = byDomain.get(bl.company.domain);
    if (!prev || score > prev.score) {
      byDomain.set(bl.company.domain, {
        name: bl.company.name,
        domain: bl.company.domain,
        score,
        scannedAt: bl.scan.completed_at ?? bl.scan.created_at ?? null,
      });
    }
  }
  return [...byDomain.values()].sort((a, b) => b.score - a.score);
}
