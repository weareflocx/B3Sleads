// Battle Cards: la capa de criterio humano sobre el corpus de marcas.
//
// El Scanner dice cómo es una marca. Esto dice QUÉ PINTA tiene en un estudio
// concreto: si es un competidor al que le disputas el mismo cliente, un
// modelo del que copiar la mecánica, o una marca que solo comparte nombre.
// Son juicios, no medidas, y por eso viven aquí y no en el scan.
//
// Todo cuelga del par (estudio, marca): la misma marca puede ser competidor
// directo para un cliente y arquetipo de categoría para otro.

// ---------- vocabulario ----------
// El valor guardado va en inglés (estable, sobrevive a cambios de copy) y la
// etiqueta en español (es lo que se lee en pantalla).

export const ROLES = [
  'direct_competitor',
  'model_analogy',
  'category_archetype',
  'future_reference',
  'risk_case',
  'name_conflict',
  'register_reference',
] as const;
export type Rol = (typeof ROLES)[number];

export const CAPAS = ['competitive', 'register', 'anti_reference'] as const;
export type Capa = (typeof CAPAS)[number];

export const PRIORIDADES = ['core', 'solid', 'provisional', 'out'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const VERIFICACIONES = ['verified', 'pending', 'no_source'] as const;
export type Verificacion = (typeof VERIFICACIONES)[number];

export const ROL_LABEL: Record<Rol, string> = {
  direct_competitor: 'Competidor directo',
  model_analogy: 'Analogía de modelo',
  category_archetype: 'Arquetipo de categoría',
  future_reference: 'Referencia de futuro',
  risk_case: 'Caso de riesgo',
  name_conflict: 'Conflicto de nombre',
  register_reference: 'Referencia de registro',
};

export const CAPA_LABEL: Record<Capa, string> = {
  competitive: 'Competitivo',
  register: 'Registro',
  anti_reference: 'Anti-referencia',
};

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  core: 'Núcleo',
  solid: 'Sólida',
  provisional: 'Provisional',
  out: 'Fuera',
};

export const VERIFICACION_LABEL: Record<Verificacion, string> = {
  verified: 'Verificada',
  pending: 'Pendiente',
  no_source: 'Sin fuente',
};

// ---------- la ficha de una marca en un estudio ----------

export interface MarcaEstudio {
  role?: Rol;
  layer?: Capa;
  priority?: Prioridad;
  // Por qué está en el estudio, en una línea. El tope existe para que la
  // lista siga siendo una lista y no un documento.
  note?: string;
  // Lo que había escrito antes del tope, si excedía. No se enseña por
  // defecto, pero no se tira: son frases que alguien pensó.
  legacy_note?: string;
  // Puntuación 0-10 por eje del estudio. Criterio humano, nunca calculado.
  axis_scores?: Record<string, number>;
  // Solo si alguien la ha fijado a mano. Si falta, se deriva del scan
  // (ver verificacionDe).
  verification?: Verificacion;
}

export const NOTA_MAX = 140;

// ---------- ejes de posicionamiento ----------

export interface Eje {
  axis_id: string;
  label_left: string;
  label_right: string;
  description?: string;
}

export interface PosicionesCliente {
  current?: Record<string, number>;
  target?: Record<string, number>;
}

export const MAX_EJES = 4;
export const EJE_MIN = 0;
export const EJE_MAX = 10;

// Identificador estable e independiente de la etiqueta: renombrar un eje no
// puede invalidar las puntuaciones que ya se le dieron.
export function nuevoEjeId(existentes: Eje[]): string {
  const usados = new Set(existentes.map((e) => e.axis_id));
  for (let i = 1; i <= MAX_EJES + 4; i++) {
    const id = `eje_${i}`;
    if (!usados.has(id)) return id;
  }
  return `eje_${Date.now()}`;
}

// ---------- orden y filtro ----------

// Núcleo primero, Fuera al final. Es el orden en que se lee un estudio:
// lo que sostiene el argumento antes que lo que se descartó.
const PESO_PRIORIDAD: Record<Prioridad, number> = {
  core: 0,
  solid: 1,
  provisional: 2,
  out: 3,
};

// Sin prioridad puesta se ordena entre "provisional" y "fuera": todavía no se
// ha decidido, así que no puede colarse por delante de lo decidido.
export function pesoPrioridad(p: Prioridad | undefined): number {
  return p ? PESO_PRIORIDAD[p] : 2.5;
}

export function esDescartada(m: MarcaEstudio | undefined): boolean {
  return m?.priority === 'out';
}

// ---------- verificación ----------

// El valor por defecto se DERIVA del estado del scan en vez de guardarse en
// la migración: así una marca añadida mañana nace con un valor con sentido
// sin que nadie la toque, y lo que se guarda es solo la corrección humana.
export function verificacionDerivada(estado: {
  conScanPublicable: boolean;
  conScanRetenido: boolean;
}): Verificacion {
  if (estado.conScanPublicable) return 'verified';
  if (estado.conScanRetenido) return 'pending';
  return 'no_source';
}

export function verificacionDe(
  m: MarcaEstudio | undefined,
  estado: { conScanPublicable: boolean; conScanRetenido: boolean },
): Verificacion {
  return m?.verification ?? verificacionDerivada(estado);
}

// ---------- saneado ----------
// Lo que entra por la API se acota aquí, en un solo sitio, para que ni un
// rol inventado ni una nota de mil caracteres lleguen a la base.

function enLista<T extends string>(lista: readonly T[], v: unknown): T | undefined {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : undefined;
}

// Devuelve el parche a mezclar. `null` en una clave significa BORRAR ese
// campo: es lo que manda el selector cuando se vuelve a "sin asignar".
export function saneaParcheMarca(entrada: unknown): Record<string, unknown> | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  const parche: Record<string, unknown> = {};

  if ('role' in e) parche.role = e.role === null ? null : (enLista(ROLES, e.role) ?? null);
  if ('layer' in e) parche.layer = e.layer === null ? null : (enLista(CAPAS, e.layer) ?? null);
  if ('priority' in e)
    parche.priority = e.priority === null ? null : (enLista(PRIORIDADES, e.priority) ?? null);
  if ('verification' in e)
    parche.verification =
      e.verification === null ? null : (enLista(VERIFICACIONES, e.verification) ?? null);
  if ('note' in e) {
    const t = String(e.note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX);
    parche.note = t || null;
  }

  return Object.keys(parche).length ? parche : null;
}

export function saneaPuntuacionEje(v: unknown): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(EJE_MAX, Math.max(EJE_MIN, n));
}

export function saneaEjes(entrada: unknown): Eje[] {
  if (!Array.isArray(entrada)) return [];
  const vistos = new Set<string>();
  const out: Eje[] = [];
  for (const raw of entrada) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const id = String(e.axis_id ?? '').trim().slice(0, 40);
    const izq = String(e.label_left ?? '').trim().slice(0, 40);
    const der = String(e.label_right ?? '').trim().slice(0, 40);
    // Un eje sin sus dos extremos no se puede dibujar ni leer.
    if (!id || !izq || !der || vistos.has(id)) continue;
    vistos.add(id);
    const desc = String(e.description ?? '').trim().slice(0, 200);
    out.push({ axis_id: id, label_left: izq, label_right: der, ...(desc ? { description: desc } : {}) });
    if (out.length >= MAX_EJES) break;
  }
  return out;
}

export function saneaPosicionesCliente(entrada: unknown, ejes: Eje[]): PosicionesCliente {
  const validos = new Set(ejes.map((e) => e.axis_id));
  const lado = (v: unknown): Record<string, number> | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const out: Record<string, number> = {};
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      if (!validos.has(k)) continue; // un eje borrado no deja posición huérfana
      const n = saneaPuntuacionEje(raw);
      if (n != null) out[k] = n;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const e = (entrada ?? {}) as Record<string, unknown>;
  const current = lado(e.current);
  const target = lado(e.target);
  return { ...(current ? { current } : {}), ...(target ? { target } : {}) };
}
