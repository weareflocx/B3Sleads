// Vocabulario de sectores. Tags limitados y reutilizables para poder filtrar
// marcas más adelante: una lista curada base (config/sectors.json, editable) a
// la que se suman los sectores que ya se han usado, para que "añadir uno nuevo"
// pase a formar parte del vocabulario sin tocar el config.
import fs from 'node:fs';
import path from 'node:path';

export function curatedSectors(): string[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'config', 'sectors.json'), 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

// Sectores guardados en un campo `sector` (unidos por " · " o comas antiguas).
export function parseSectorList(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/\s*·\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Une curados + en uso sin duplicar (case-insensitive); la primera aparición
// gana el casing, así que los curados imponen su forma canónica.
export function mergeSectorVocabulary(inUse: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...curatedSectors(), ...inUse]) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

// Sectores recomendados a partir de lo que ya sabemos de la marca (bio +
// texto del scan). No usa IA: cruza el vocabulario contra el texto, así que
// funciona siempre y es explicable. Los que ya están puestos no se sugieren.
//
// Sinónimos para lo que el vocabulario llama de otra forma que la web.
const HINTS: Record<string, string[]> = {
  'SaaS B2B': ['saas', 'b2b', 'software as a service', 'suscripción'],
  Fintech: ['fintech', 'pagos', 'banca', 'finanzas', 'payments'],
  Insurtech: ['seguros', 'insurance', 'insurtech', 'póliza'],
  Proptech: ['inmobiliari', 'proptech', 'real estate'],
  Legaltech: ['legal', 'abogad', 'jurídic'],
  'HR Tech': ['rrhh', 'recruit', 'talento', 'contratación', 'hiring', 'empleo'],
  Edtech: ['educaci', 'edtech', 'formación', 'aprendizaje'],
  'Salud Digital': ['salud', 'health', 'clínic', 'paciente', 'médic'],
  Biotech: ['biotech', 'biotecnolog', 'molecul', 'genóm'],
  Ciberseguridad: ['ciberseguridad', 'security', 'ciberataque', 'amenaza', 'threat', 'phishing'],
  IA: [' ia ', 'inteligencia artificial', ' ai ', 'machine learning', 'agentes'],
  'Analítica de Datos': ['analítica', 'analytics', 'dashboard', 'business intelligence'],
  Devtools: ['developer', 'devtool', 'sdk', 'desarrollador'],
  'Cloud e Infraestructura': ['cloud', 'infraestructura', 'infrastructure', 'servidor'],
  Ecommerce: ['ecommerce', 'e-commerce', 'tienda online', 'checkout'],
  Marketplace: ['marketplace', 'compradores y vendedores'],
  Retail: ['retail', 'tienda', 'punto de venta'],
  'Alimentación y Bebidas': ['alimentaci', 'bebida', 'food', 'restaurante'],
  Foodtech: ['foodtech'],
  Agtech: ['agtech', 'agricultura', 'agro', 'cultivo'],
  Cleantech: ['cleantech', 'residuo', 'circular', 'descarboniz', 'emisiones'],
  Energía: ['energía', 'energy', 'solar', 'renovable'],
  Movilidad: ['movilidad', 'mobility', 'transporte', 'vehícul'],
  Logística: ['logístic', 'logistics', 'envío', 'flota', 'transportist'],
  'Software Industrial': ['industrial', 'fábrica', 'manufactur'],
  Hardware: ['hardware', 'dispositivo', 'sensor'],
  Robótica: ['robót', 'robot'],
  IoT: ['iot', 'conectado'],
  Gaming: ['gaming', 'videojuego', 'jugador', 'gamer'],
  'Media y Entretenimiento': ['entretenimiento', 'streaming', 'audiovisual'],
  'Marketing y AdTech': ['marketing', 'publicidad', 'adtech', 'campaña'],
  'Turismo y Viajes': ['turismo', 'viaje', 'travel', 'hotel'],
  Inmobiliario: ['inmobiliario', 'vivienda', 'alquiler'],
  'Web3 y Cripto': ['web3', 'blockchain', 'cripto', 'nft', 'token'],
  'Deep Tech': ['deep tech', 'cuántic', 'quantum'],
  Sostenibilidad: ['sostenib', 'sustainab', 'impacto ambiental'],
  Telecomunicaciones: ['telecom', 'red móvil', '5g'],
};

export function suggestSectors(
  text: string | null | undefined,
  vocabulary: string[],
  already: string[] = [],
  max = 4,
): string[] {
  if (!text || text.trim().length < 20) return [];
  const haystack = ` ${text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')} `;
  const taken = new Set(already.map((s) => s.toLowerCase()));

  const scored: { term: string; hits: number }[] = [];
  for (const term of vocabulary) {
    if (taken.has(term.toLowerCase())) continue;
    const needles = [term, ...(HINTS[term] ?? [])].map((n) =>
      n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    // Cuántas de sus pistas aparecen: más coincidencias, más confianza. El
    // emparejado es por INICIO DE PALABRA (las pistas son raíces): por
    // subcadena, "soc" casaba dentro de "socio" y sugería Ciberseguridad.
    const hits = needles.filter((n) => {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}`).test(haystack);
    }).length;
    if (hits > 0) scored.push({ term, hits });
  }
  return scored
    .sort((a, b) => b.hits - a.hits || a.term.localeCompare(b.term, 'es'))
    .slice(0, max)
    .map((s) => s.term);
}
