// Benchmark de marca: comparar una marca cliente contra grupos de referencia.
//
// La unidad no es "la competencia" sino el GRUPO, porque grupos distintos
// responden a preguntas distintas. Las energéticas dicen contra qué narrativa
// compite el cliente; el multinivel dice cómo se cuenta una red de vendedores.
// Promediarlos juntos daría una media sin significado.
//
// El estudio vive en la URL y no en base de datos: así se comparte pegando un
// enlace, se prueba sin migración y no ensucia el pipeline. Cuando el formato
// se estabilice con uso real, mover esto a una tabla es mecánico.
import type { MarcaCorpus } from './data';
import { companyLabel } from './types';
import { storedScanReport } from './scan-report';
import { canonDimension, DIMENSION_LABELS } from './scan-versions';

// Los 9 componentes en el orden en que se leen: primero lo que la marca dice
// de sí misma, después lo que produce en quien la lee.
export const COMPONENTES = [
  'purpose',
  'mission',
  'vision',
  'values',
  'attributes',
  'value-prop',
  'personality',
  'brand-idea',
  'magnetism',
  'coherence',
] as const;

export type Componente = (typeof COMPONENTES)[number];

export interface PerfilMarca {
  domain: string;
  name: string;
  score: number | null;
  // Ratio 0-1 por componente. Se normaliza porque los máximos no son iguales
  // (Magnetismo y Coherencia valen 20, Misión 5): comparar puntos crudos
  // daría más peso a los componentes con más recorrido.
  ratios: Partial<Record<Componente, number>>;
  // Detectados sobre el total. Es el dato de fiabilidad: una marca leída a
  // medias no se puede comparar con una leída entera, y callarlo sería
  // vender una diferencia de marca que en realidad es de adquisición.
  detectados: number;
}

// El último scan con puntuación publicable. Un run retenido no sirve para
// comparar: no trae ni un componente con nota.
export function ultimoPublicable(m: MarcaCorpus) {
  const conNota = m.scans.filter((s) => s.score != null);
  return conNota[conNota.length - 1] ?? null;
}

export function perfilDeMarca(m: MarcaCorpus): PerfilMarca {
  const scan = ultimoPublicable(m);
  const rep = storedScanReport(scan?.result_raw ?? null);
  const ratios: Partial<Record<Componente, number>> = {};
  let detectados = 0;
  for (const d of rep?.dimensions ?? []) {
    const key = canonDimension(d.name) as Componente;
    if (!COMPONENTES.includes(key)) continue;
    if (d.score == null || !d.max) continue;
    ratios[key] = d.score / d.max;
    detectados++;
  }
  return {
    domain: m.company.domain,
    name: companyLabel(m.company.name, m.company.domain),
    score: scan?.score != null ? Number(scan.score) : null,
    ratios,
    detectados,
  };
}

export interface Grupo {
  nombre: string;
  dominios: string[];
}

// ---------- el estudio en la URL ----------
// Formato: Energéticas:a.com,b.com;Multinivel:c.com
export function parseGrupos(raw: string | undefined): Grupo[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((tramo) => {
      const i = tramo.indexOf(':');
      if (i < 1) return null;
      const nombre = decodeURIComponent(tramo.slice(0, i)).trim();
      const dominios = tramo
        .slice(i + 1)
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      // Un grupo vacio es valido: se crea antes de tener marcas dentro.
      return nombre ? { nombre, dominios } : null;
    })
    .filter(Boolean) as Grupo[];
}

export function serializeGrupos(grupos: Grupo[]): string {
  // Sin filtrar por vacio: descartar los grupos sin marcas hacia imposible
  // crear uno, porque nace vacio y desaparecia antes de poder llenarlo.
  return grupos
    .map((g) => `${encodeURIComponent(g.nombre)}:${g.dominios.join(',')}`)
    .join(';');
}

// ---------- agregación ----------
export interface FilaComponente {
  key: Componente;
  label: string;
  cliente: number | null;
  porGrupo: { nombre: string; media: number | null; n: number }[];
}

function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function compara(
  cliente: PerfilMarca | null,
  grupos: { nombre: string; perfiles: PerfilMarca[] }[],
): FilaComponente[] {
  return COMPONENTES.map((key) => ({
    key,
    label: DIMENSION_LABELS[key] ?? key,
    cliente: cliente?.ratios[key] ?? null,
    porGrupo: grupos.map((g) => ({
      nombre: g.nombre,
      media: media(g.perfiles.map((p) => p.ratios[key]).filter((x): x is number => x != null)),
      n: g.perfiles.filter((p) => p.ratios[key] != null).length,
    })),
  }));
}

// El hueco de categoría: componentes que NADIE del estudio domina. Es la
// conclusión que convierte una tabla en una recomendación de posicionamiento,
// porque un territorio que no ocupa nadie es barato de ocupar.
export interface Hueco {
  key: Componente;
  label: string;
  mediaGeneral: number;
}

export function huecosDeCategoria(filas: FilaComponente[], umbral = 0.5): Hueco[] {
  return filas
    .map((f) => {
      const vals = f.porGrupo.map((g) => g.media).filter((x): x is number => x != null);
      return { key: f.key, label: f.label, mediaGeneral: media(vals) ?? 1 };
    })
    .filter((h) => h.mediaGeneral < umbral)
    .sort((a, b) => a.mediaGeneral - b.mediaGeneral);
}
