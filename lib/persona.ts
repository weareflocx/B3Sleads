// ¿Es la misma persona? El LinkedIn manda. Sin él (un fundador que entró
// por nombre desde una noticia o un lote), el nombre normalizado dentro de
// la misma marca: "Catharina van Delden" y "Catharina Van Delden" son una.
export interface PersonaLike {
  linkedin_handle?: string | null;
  full_name?: string | null;
}

// Nombres de relleno que no identifican a nadie.
const GENERICOS = new Set(['fundador', 'fundadora', 'founder', 'ceo', 'cofundador', 'cofundadora', 'sin nombre']);

export function nombreNormalizado(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nombreUtil(p: PersonaLike): string | null {
  const n = nombreNormalizado(p.full_name);
  return n && !GENERICOS.has(n) ? n : null;
}

export function mismaPersona(a: PersonaLike, b: PersonaLike): boolean {
  const ha = a.linkedin_handle?.toLowerCase();
  const hb = b.linkedin_handle?.toLowerCase();
  if (ha && hb) return ha === hb; // dos perfiles distintos son dos personas
  const na = nombreUtil(a);
  return na != null && na === nombreUtil(b);
}

// El contacto de la ficha que es este fundador, o ninguno. Un contacto con
// otro perfil no es candidato: dos perfiles distintos son dos personas. Si el
// fundador viene sin LinkedIn y su nombre es el de dos o más perfiles
// distintos, no se sabe cuál de ellos es, y no es ninguno: entra como contacto
// nuevo, como en planDeUnion (lib/unir-leads.ts).
export function contactoDeLaFicha<T extends PersonaLike>(enFicha: readonly T[], fundador: PersonaLike): T | undefined {
  const candidatos = enFicha.filter((c) => (!c.linkedin_handle || !fundador.linkedin_handle) && mismaPersona(c, fundador));
  const perfiles = new Set(candidatos.flatMap((c) => (c.linkedin_handle ? [c.linkedin_handle.toLowerCase()] : [])));
  return perfiles.size > 1 ? undefined : candidatos[0];
}

// El perfil que un contacto de la ficha acaba de recibir en la base, puesto
// también en memoria: la ficha se lee una vez por fila. Sin esto, otro
// fundador homónimo de la misma fila, con otro perfil, volvería a encontrar el
// contacto sin LinkedIn y se lo machacaría.
export function completaPerfil(
  contacto: { linkedin_handle?: string | null; linkedin_url?: string | null },
  handle: string,
  url: string | null,
): void {
  contacto.linkedin_handle = handle;
  contacto.linkedin_url = url;
}
