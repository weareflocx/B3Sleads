// Leads duplicados de una misma marca. Pasaba al añadir el founder desde la
// ficha a una marca que ya tenía un lead sin founder (alta desde "Rondas de la
// semana" o por dominio): se creaba un lead nuevo en vez de completar el que
// había, y la marca salía dos veces en la cola y el kanban.
//
// La unidad de trabajo es el founder (contacts.linkedin_url), así que dos
// leads con founders distintos NO son duplicados: son dos personas a
// contactar. Duplicado es un lead SIN founder cuando la marca ya tiene otro
// lead, o dos leads de la misma persona, aunque esté dos veces como contacto
// (una con LinkedIn y otra solo con el nombre: lib/persona.ts).
import type { Contact, Lead, LeadStage } from './types';
import { mismaPersona } from './persona';

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
  // Contactos repetidos de la misma persona: se funden en contactId y se borran.
  contactosSobran: string[];
}

type ContactoMin = Pick<Contact, 'id'> & Partial<Pick<Contact, 'linkedin_handle' | 'linkedin_url' | 'full_name'>>;

// Un plan por cada grupo de duplicados de la marca. Vacío si no hay nada que
// unir.
export function planDeUnion(leads: Lead[], contactos: ContactoMin[] = []): PlanUnion[] {
  if (leads.length < 2) return [];
  const conFounder = leads.filter((l) => l.contact_id);
  const sinFounder = leads.filter((l) => !l.contact_id);

  // Cada contacto, a la persona que representa: el primero de los contactos
  // de una persona hace de clave del grupo. mismaPersona no es transitiva (un
  // contacto sin LinkedIn puede tener el nombre de dos perfiles distintos), así
  // que no se agrupa por el orden de llegada. Primero los contactos con
  // LinkedIn: cada perfil es una persona y solo cuenta su handle. Después los
  // que solo tienen nombre, que no pueden juntar dos perfiles:
  //  - si el nombre es el de un solo perfil, van con él;
  //  - si es el de dos o más no se sabe de quién son, y se quedan aparte: ni con
  //    un perfil ni con otros sin perfil;
  //  - si no es el de ninguno, se juntan con los sin perfil del mismo nombre.
  // El orden de la lista solo decide cuál de los contactos de una persona hace
  // de clave, no quién va con quién.
  const persona = new Map<string, string>();
  const conPerfil = contactos.filter((c) => c.linkedin_handle);
  for (const c of conPerfil) {
    const igual = conPerfil.find((o) => persona.get(o.id) === o.id && mismaPersona(o, c));
    persona.set(c.id, igual ? igual.id : c.id);
  }
  // Las claves de los sin perfil que no coinciden con ningún perfil: una por nombre.
  const claves: ContactoMin[] = [];
  for (const c of contactos.filter((c) => !c.linkedin_handle)) {
    const perfiles = [...new Set(conPerfil.filter((o) => mismaPersona(o, c)).map((o) => persona.get(o.id) ?? o.id))];
    if (perfiles.length === 1) {
      persona.set(c.id, perfiles[0]);
    } else if (perfiles.length > 1) {
      persona.set(c.id, c.id);
    } else {
      const igual = claves.find((o) => mismaPersona(o, c));
      persona.set(c.id, igual ? igual.id : c.id);
      if (!igual) claves.push(c);
    }
  }
  const claveDe = (contactId: string) => persona.get(contactId) ?? contactId;
  const porId = new Map(contactos.map((c) => [c.id, c]));

  // Agrupar: cada persona con sus leads repetidos; los leads sin founder van
  // al mejor lead con founder (o, si ninguno tiene, al mejor de ellos).
  const grupos = new Map<string, Lead[]>();
  for (const l of conFounder) {
    const k = claveDe(l.contact_id!);
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
      const k = claveDe(destino.contact_id!);
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
    // De los contactos de la persona se queda el que tiene LinkedIn: es la
    // unidad de trabajo y por donde se le escribe.
    const ids = [...new Set(ls.map((l) => l.contact_id).filter((x): x is string => !!x))];
    const contactId =
      ids.find((id) => porId.get(id)?.linkedin_url || porId.get(id)?.linkedin_handle) ??
      queda.contact_id ??
      ids[0] ??
      null;
    planes.push({
      queda,
      sobran,
      stage: avance(top.stage) > avance(queda.stage) ? top.stage : queda.stage,
      scanId: queda.scan_id ?? sobran.find((l) => l.scan_id)?.scan_id ?? null,
      contactId,
      contactosSobran: ids.filter((id) => id !== contactId),
    });
  }
  return planes;
}
