// Los inversores como entidad, no como texto suelto. Hoy sirven para hacer
// clicable cada nombre; mañana son la base del radar de VC (página por fondo
// y ranking en el leaderboard), y por eso el slug se calcula ya de forma
// estable: "GoHub Ventures" y "gohub ventures" son el mismo fondo.

export interface InvestorRef {
  name: string; // como lo escribió Sergio, respetando mayúsculas
  slug: string; // identidad canónica
  href: string; // a dónde lleva el chip
}

// Ruido habitual al final del nombre de un fondo. Se quita solo para el slug:
// el nombre visible nunca se toca.
const SUFFIXES = /\s+(ventures?|capital|partners?|vc|fund|invest(?:ments?)?)$/i;

export function investorSlug(name: string): string {
  let base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // tildes fuera
  // Se recorta un solo sufijo: "Adara Ventures" y "Adara" convergen, pero
  // "Nauta Capital Partners" no se queda en "nauta".
  base = base.replace(SUFFIXES, '');
  return base
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Buscar el fondo en internet queda como acción secundaria dentro de su
// ficha. El chip lleva a la ficha interna, que es donde vive su cartera.
export function investorSearchUrl(name: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${name} venture capital`)}`;
}

export function investorPath(slug: string): string {
  return `/investors/${slug}`;
}

export function resolveInvestor(name: string): InvestorRef {
  const slug = investorSlug(name);
  return { name: name.trim(), slug, href: investorPath(slug) };
}

export function resolveInvestors(names: unknown): InvestorRef[] {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const out: InvestorRef[] = [];
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    const ref = resolveInvestor(name);
    if (seen.has(ref.slug)) continue; // el mismo fondo repetido en dos rondas
    seen.add(ref.slug);
    out.push(ref);
  }
  return out;
}
