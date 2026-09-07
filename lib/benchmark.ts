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
import { consolidateReport, consolidatedScore } from './consolidated';

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
  // Lo que el Scanner ENTENDIÓ de cada componente, en frases, y la cita de la
  // propia marca cuando la hay. Está en el 100% y el 74% de los componentes
  // respectivamente, y hasta ahora no se leía en ningún sitio: la tabla
  // enseñaba el número y escondía el porqué.
  textos: Partial<Record<Componente, { analisis: string | null; cita: string | null }>>;
}

// El último scan con puntuación publicable. Un run retenido no sirve para
// comparar: no trae ni un componente con nota.
export function ultimoPublicable(m: MarcaCorpus) {
  const conNota = m.scans.filter((s) => s.score != null);
  return conNota[conNota.length - 1] ?? null;
}

// El perfil es el CONSOLIDADO, el mismo que enseña la ficha: si alguien curó
// un componente (o adoptó una pasada retenida), el estudio lo ve. Sin
// curación es idéntico al automático, así que nada cambia para quien no toca.
export function perfilDeMarca(m: MarcaCorpus): PerfilMarca {
  const scan = ultimoPublicable(m);
  const rep = storedScanReport(scan?.result_raw ?? null);
  const auto = rep?.dimensions ?? [];
  const cons = consolidateReport(auto, m.selections ?? [], m.scans, scan?.id ?? null);
  const ratios: Partial<Record<Componente, number>> = {};
  const textos: PerfilMarca['textos'] = {};
  let detectados = 0;
  for (const d of cons.dimensions) {
    const key = canonDimension(d.name) as Componente;
    if (!COMPONENTES.includes(key)) continue;
    // El texto se guarda aunque el componente no puntúe: "no se detectó nada"
    // también se explica, y esa explicación es útil.
    textos[key] = {
      analisis: recorta(d.analysis ?? d.verdict ?? d.reading, 420),
      cita: recorta(d.quote, 260),
    };
    if (d.score == null || !d.max) continue;
    ratios[key] = d.score / d.max;
    detectados++;
  }
  return {
    domain: m.company.domain,
    name: companyLabel(m.company.name, m.company.domain),
    score:
      scan?.score != null ? consolidatedScore(Number(scan.score), auto, cons.dimensions) : null,
    ratios,
    detectados,
    textos,
  };
}

// Un párrafo entero por marca y componente haría ilegible el desplegable con
// siete marcas en un grupo. Se corta por frase para no dejar la idea a medias.
function recorta(raw: string | null | undefined, max: number): string | null {
  const limpio = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length < 12) return null;
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const punto = corte.lastIndexOf('. ');
  if (punto > max * 0.5) return corte.slice(0, punto + 1);
  const espacio = corte.lastIndexOf(' ');
  return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd() + '…';
}

export interface Grupo {
  nombre: string;
  // El orden de la lista ES el orden del estudio: quien lo monta decide qué
  // se lee primero, y la matriz lo respeta.
  dominios: string[];
  // Marcas que siguen en el grupo pero no entran en la comparación. Con
  // catorce marcas en un grupo no todas merecen la matriz; ocultar no es
  // quitar: la marca, su scan y su porqué siguen ahí para volver a entrar.
  ocultas?: string[];
  // Por qué está cada marca en el estudio, en una frase. Es lo que no se
  // deduce del scan y lo primero que se olvida a la tercera semana.
  notas?: Record<string, string>;
}

// Las marcas de un grupo que ENTRAN en la comparación.
//
// Dos formas de quedarse fuera, y no son lo mismo:
//  - `ocultas`: apartada un rato. Es un gesto de foco, sin juicio.
//  - prioridad "out": descartada del estudio. Es una decisión.
// Descartar implica no comparar, así que "out" se deriva aquí en vez de
// duplicarse en `ocultas`: si no, cambiar la prioridad dejaría el otro campo
// desincronizado y habría marcas descartadas contando en las medias.
export function visibles(g: Grupo, marcas?: Record<string, { priority?: string }>): string[] {
  const ocultas = new Set(g.ocultas ?? []);
  return g.dominios.filter((d) => !ocultas.has(d) && marcas?.[d]?.priority !== 'out');
}

// Fuera de la comparación, y por qué. Lo usa la lista para plegarlas juntas
// diciendo cuál es cuál.
export function fueraDeComparacion(
  g: Grupo,
  marcas?: Record<string, { priority?: string }>,
): { dominio: string; motivo: 'descartada' | 'oculta' }[] {
  const ocultas = new Set(g.ocultas ?? []);
  return g.dominios
    .filter((d) => ocultas.has(d) || marcas?.[d]?.priority === 'out')
    .map((d) => ({
      dominio: d,
      motivo: marcas?.[d]?.priority === 'out' ? ('descartada' as const) : ('oculta' as const),
    }));
}

// ---------- el estudio en la URL ----------
// Formato: Energéticas:a.com,!b.com;Multinivel:c.com
// El '!' delante marca una oculta. Las notas NO van en la URL: viven en el
// estudio guardado y la página las funde al cargar (ver fusionaNotas).
export function parseGrupos(raw: string | undefined): Grupo[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((tramo) => {
      const i = tramo.indexOf(':');
      if (i < 1) return null;
      const nombre = decodeURIComponent(tramo.slice(0, i)).trim();
      const crudos = tramo
        .slice(i + 1)
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const dominios = crudos.map((d) => d.replace(/^!/, ''));
      const ocultas = crudos.filter((d) => d.startsWith('!')).map((d) => d.slice(1));
      // Un grupo vacio es valido: se crea antes de tener marcas dentro.
      return nombre ? { nombre, dominios, ...(ocultas.length ? { ocultas } : {}) } : null;
    })
    .filter(Boolean) as Grupo[];
}

export function serializeGrupos(grupos: Grupo[]): string {
  // Sin filtrar por vacio: descartar los grupos sin marcas hacia imposible
  // crear uno, porque nace vacio y desaparecia antes de poder llenarlo.
  return grupos
    .map((g) => {
      const ocultas = new Set(g.ocultas ?? []);
      const lista = g.dominios.map((d) => (ocultas.has(d) ? `!${d}` : d)).join(',');
      return `${encodeURIComponent(g.nombre)}:${lista}`;
    })
    .join(';');
}

// Las notas se fusionan por dominio, no por grupo: si una marca se mueve de
// grupo por la URL, su porqué la sigue. La URL manda en pertenencia, orden y
// ocultas; el estudio guardado manda en las notas.
export function fusionaNotas(grupos: Grupo[], guardados: Grupo[] | null | undefined): Grupo[] {
  const porDominio = new Map<string, string>();
  for (const g of guardados ?? []) {
    for (const [d, n] of Object.entries(g.notas ?? {})) if (n?.trim()) porDominio.set(d, n.trim());
  }
  for (const g of grupos) {
    for (const [d, n] of Object.entries(g.notas ?? {})) if (n?.trim()) porDominio.set(d, n.trim());
  }
  return grupos.map((g) => {
    const notas: Record<string, string> = {};
    for (const d of g.dominios) {
      const n = porDominio.get(d);
      if (n) notas[d] = n;
    }
    return Object.keys(notas).length ? { ...g, notas } : { ...g, notas: undefined };
  });
}

// ---------- agregación ----------
export interface MarcaEnFila {
  name: string;
  domain: string;
  ratio: number | null;
  analisis: string | null;
  cita: string | null;
}

export interface FilaComponente {
  key: Componente;
  label: string;
  cliente: number | null;
  porGrupo: { nombre: string; media: number | null; n: number; marcas: MarcaEnFila[] }[];
  // El cliente también se despliega: su propio texto es la otra mitad de la
  // comparación.
  clienteTexto: { analisis: string | null; cita: string | null } | null;
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
    clienteTexto: cliente?.textos[key] ?? null,
    porGrupo: grupos.map((g) => ({
      nombre: g.nombre,
      media: media(g.perfiles.map((p) => p.ratios[key]).filter((x): x is number => x != null)),
      n: g.perfiles.filter((p) => p.ratios[key] != null).length,
      // Ordenadas por nota: al desplegar, arriba quien mejor lo cuenta. Es a
      // quien hay que mirar.
      marcas: [...g.perfiles]
        .sort((a, b) => (b.ratios[key] ?? -1) - (a.ratios[key] ?? -1))
        .map((p) => ({
          name: p.name,
          domain: p.domain,
          ratio: p.ratios[key] ?? null,
          analisis: p.textos[key]?.analisis ?? null,
          cita: p.textos[key]?.cita ?? null,
        })),
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
