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
