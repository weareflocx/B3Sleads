// Leads duplicados de una misma marca. Pasaba al añadir el founder desde la
// ficha a una marca que ya tenía un lead sin founder (alta desde "Rondas de la
// semana" o por dominio): se creaba un lead nuevo en vez de completar el que
// había, y la marca salía dos veces en la cola y el kanban.
//
// La unidad de trabajo es el founder (contacts.linkedin_url), así que dos
// leads con founders distintos NO son duplicados: son dos personas a
// contactar. Duplicado es un lead SIN founder cuando la marca ya tiene otro
// lead, o dos leads del mismo founder.
import type { Lead, LeadStage } from './types';

// Cuánto ha avanzado cada etapa. Al unir se queda la más avanzada; pausa,
// pérdida y descarte no ganan a una etapa viva.
const AVANCE: Record<LeadStage, number> = {
  discarded: -3,
  lost: -2,
  paused: -1,
  detected: 0,
  briefed: 1,
  invited: 2,
  connected: 3,
  contacted: 4,
  conversation: 5,
  call: 6,
  proposal: 7,
  won: 8,
};

export function avance(stage: LeadStage): number {
  return AVANCE[stage] ?? 0;
}

export interface PlanUnion {
  queda: Lead; // el lead que se conserva
  sobran: Lead[]; // los que se funden en él y se borran
  stage: LeadStage; // la etapa que le queda al conservado
  scanId: string | null; // el scan que le queda (el suyo o el de un duplicado)
  contactId: string | null;
}

// Un plan por cada grupo de duplicados de la marca. Vacío si no hay nada que
// unir.
export function planDeUnion(leads: Lead[]): PlanUnion[] {
  if (leads.length < 2) return [];
  const conFounder = leads.filter((l) => l.contact_id);
  const sinFounder = leads.filter((l) => !l.contact_id);

  // Agrupar: cada founder con sus leads repetidos; los leads sin founder van
  // al mejor lead con founder (o, si ninguno tiene, al mejor de ellos).
  const grupos = new Map<string, Lead[]>();
  for (const l of conFounder) {
    const k = l.contact_id!;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const mejor = (ls: Lead[]) =>
    [...ls].sort(
      (a, b) =>
        avance(b.stage) - avance(a.stage) ||
        // A igual etapa, el más reciente: es el que se ha estado trabajando.
        b.updated_at.localeCompare(a.updated_at),
    )[0];

  if (sinFounder.length) {
    if (conFounder.length) {
      const destino = mejor(conFounder);
      const k = destino.contact_id!;
      grupos.set(k, [...grupos.get(k)!, ...sinFounder]);
    } else {
      grupos.set('', sinFounder);
    }
  }

  const planes: PlanUnion[] = [];
  for (const ls of grupos.values()) {
    if (ls.length < 2) continue;
    // Se conserva el que tiene founder; entre ellos, el más avanzado.
    const queda = mejor(ls.filter((l) => l.contact_id).length ? ls.filter((l) => l.contact_id) : ls);
    const sobran = ls.filter((l) => l.id !== queda.id);
    const top = mejor(ls);
    planes.push({
      queda,
      sobran,
      stage: avance(top.stage) > avance(queda.stage) ? top.stage : queda.stage,
      scanId: queda.scan_id ?? sobran.find((l) => l.scan_id)?.scan_id ?? null,
      contactId: queda.contact_id ?? sobran.find((l) => l.contact_id)?.contact_id ?? null,
    });
  }
  return planes;
}
