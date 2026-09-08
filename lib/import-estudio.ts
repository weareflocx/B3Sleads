// Importación del estudio: la operación inversa de la exportación JSON.
//
// Sirve para traer de vuelta el criterio trabajado fuera —en Notion, en un
// workshop, a mano— sin teclear cuarenta y cuatro marcas una a una.
//
// Regla que gobierna todo lo demás: SOLO entra lo que es juicio humano.
// El score, las dimensiones, la madurez, la URL del informe y la fecha del
// scan viajan en el archivo porque quien lo lee los necesita, pero son del
// Scanner. Dejar que un archivo los sobrescriba convertiría el export en una
// forma de falsear una medición, y con ella el mapa de madurez y la matriz.
// Aquí se ignoran a propósito.
//
// La composición tampoco se toca: qué marcas hay, en qué grupo y en qué
// orden se decide en la pantalla y viaja en la URL. Un archivo de hace tres
// días no puede borrar la marca que alguien añadió esta mañana. Lo que no
// cuadre se informa, no se aplica en silencio.
import {
  CAPAS,
  PRIORIDADES,
  ROLES,
  VERIFICACIONES,
  NOTA_MAX,
  saneaEjes,
  saneaPosicionesCliente,
  saneaPuntuacionEje,
  type Eje,
  type MarcaEstudio,
  type PosicionesCliente,
} from './battle-cards';
import type { Grupo } from './benchmark';

export interface ResumenImport {
  cliente: string;
  exportadoEl: string | null;
  marcasAplicadas: number;
  // En el archivo pero no en el estudio. No se crean: dar de alta una marca
  // lanza un scan y cuesta, y hacerlo desde un archivo sería invisible.
  fueraDelEstudio: string[];
  // En el estudio pero no en el archivo. Su ficha se queda como está.
  noVienenEnElArchivo: string[];
  ejes: number;
  terminosExcluidos: number;
  ocultasPorGrupo: Record<string, number>;
  gruposDesconocidos: string[];
  avisos: string[];
}

export interface PlanImport {
  marcas: Record<string, MarcaEstudio>;
  axes: Eje[];
  clientPositions: PosicionesCliente;
  excludedTerms: string[];
  grupos: Grupo[];
  resumen: ResumenImport;
}

function enLista<T extends string>(lista: readonly T[], v: unknown): T | undefined {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : undefined;
}

function texto(v: unknown, max: number): string | undefined {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
}

export class ImportInvalido extends Error {}

export function preparaImport({
  json,
  clienteDominio,
  grupos,
  marcasActuales,
}: {
  json: unknown;
  clienteDominio: string;
  grupos: Grupo[];
  marcasActuales: Record<string, MarcaEstudio>;
}): PlanImport {
  if (!json || typeof json !== 'object') throw new ImportInvalido('El archivo no es un JSON válido.');
  const j = json as Record<string, any>;
  if (j.object !== 'brand_study') {
    throw new ImportInvalido(
      'Ese archivo no es un estudio de marca. Usa el que sale del botón JSON de esta misma página.',
    );
  }
  const suyo = String(j.client_domain ?? '').toLowerCase();
  if (suyo && suyo !== clienteDominio.toLowerCase()) {
    throw new ImportInvalido(
      `El archivo es del estudio de ${suyo}, no de ${clienteDominio}. Importarlo mezclaría dos clientes.`,
    );
  }

  const avisos: string[] = [];
  const enElEstudio = new Set(grupos.flatMap((g) => g.dominios));
  const nombresDeGrupo = new Set(grupos.map((g) => g.nombre));

  // ---- ejes primero: una puntuación de un eje que no existe no se guarda ----
  const axes = saneaEjes(j.axes);
  if (Array.isArray(j.axes) && axes.length < j.axes.length) {
    avisos.push(`${j.axes.length - axes.length} ejes del archivo se descartaron por venir incompletos.`);
  }
  const ejesValidos = new Set(axes.map((e) => e.axis_id));
  const clientPositions = saneaPosicionesCliente(j.client_positions, axes);

  // ---- fichas ----
  const marcas: Record<string, MarcaEstudio> = { ...marcasActuales };
  const fueraDelEstudio: string[] = [];
  const vistas = new Set<string>();
  let aplicadas = 0;

  const gruposArchivo = Array.isArray(j.groups) ? j.groups : [];
  const gruposDesconocidos: string[] = [];
  const ocultasPorGrupo: Record<string, number> = {};

  for (const g of gruposArchivo) {
    const nombre = String(g?.name ?? '').trim();
    if (nombre && !nombresDeGrupo.has(nombre)) gruposDesconocidos.push(nombre);

    for (const b of Array.isArray(g?.brands) ? g.brands : []) {
      const dominio = String(b?.brand_domain ?? '').trim().toLowerCase();
      if (!dominio) continue;
      if (!enElEstudio.has(dominio)) {
        fueraDelEstudio.push(dominio);
        continue;
      }
      vistas.add(dominio);

      const c = (b?.classification ?? {}) as Record<string, unknown>;
      const ficha: MarcaEstudio = { ...(marcas[dominio] ?? {}) };

      // Presente en el archivo manda, incluso a null: el export escribe todos
      // los campos, así que un null es una decisión de vaciarlo y no un hueco.
      if ('role' in c) {
        const v = enLista(ROLES, c.role);
        if (v) ficha.role = v;
        else delete ficha.role;
      }
      if ('layer' in c) {
        const v = enLista(CAPAS, c.layer);
        if (v) ficha.layer = v;
        else delete ficha.layer;
      }
      if ('priority' in c) {
        const v = enLista(PRIORIDADES, c.priority);
        if (v) ficha.priority = v;
        else delete ficha.priority;
      }
      if ('note' in c) {
        const v = texto(c.note, NOTA_MAX);
        if (v) ficha.note = v;
        else delete ficha.note;
      }
      if ('legacy_note' in c) {
        const v = texto(c.legacy_note, 4000);
        if (v) ficha.legacy_note = v;
        else delete ficha.legacy_note;
      }
      if ('verification' in b) {
        const v = enLista(VERIFICACIONES, b.verification);
        if (v) ficha.verification = v;
        else delete ficha.verification;
      }

      // Las puntuaciones se REEMPLAZAN, no se mezclan: el archivo dice cuáles
      // son las de esta marca, y mezclar dejaría vivas las de un eje que el
      // archivo ya no tiene.
      if (b?.axis_scores && typeof b.axis_scores === 'object') {
        const scores: Record<string, number> = {};
        for (const [eje, valor] of Object.entries(b.axis_scores as Record<string, unknown>)) {
          if (!ejesValidos.has(eje)) continue;
          const n = saneaPuntuacionEje(valor);
          if (n != null) scores[eje] = n;
        }
        if (Object.keys(scores).length) ficha.axis_scores = scores;
        else delete ficha.axis_scores;
      }

      marcas[dominio] = ficha;
      aplicadas++;
    }
  }

  // ---- ocultas: por nombre de grupo, sin tocar pertenencia ni orden ----
  const gruposNuevos: Grupo[] = grupos.map((g) => {
    const enArchivo = gruposArchivo.find((x: any) => String(x?.name ?? '').trim() === g.nombre);
    if (!enArchivo || !Array.isArray(enArchivo.hidden)) return g;
    const dentro = new Set(g.dominios);
    const ocultas = [
      ...new Set(
        enArchivo.hidden
          .map((d: unknown) => String(d).trim().toLowerCase())
          .filter((d: string) => dentro.has(d)),
      ),
    ] as string[];
    ocultasPorGrupo[g.nombre] = ocultas.length;
    return ocultas.length ? { ...g, ocultas } : { ...g, ocultas: undefined };
  });

  // ---- términos excluidos ----
  const excludedTerms = Array.isArray(j.excluded_terms)
    ? [
        ...new Set(
          j.excluded_terms
            .map((t: unknown) => String(t ?? '').trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
    : [];

  if (fueraDelEstudio.length) {
    avisos.push(
      `${fueraDelEstudio.length} marcas del archivo no están en el estudio y NO se han creado: ${fueraDelEstudio.slice(0, 5).join(', ')}${fueraDelEstudio.length > 5 ? '…' : ''}. Añádelas desde Montaje para que se escaneen.`,
    );
  }
  if (gruposDesconocidos.length) {
    avisos.push(
      `Grupos del archivo que no existen aquí: ${gruposDesconocidos.join(', ')}. Sus marcas se han clasificado igual, pero sus ocultas no se han aplicado.`,
    );
  }

  const noVienenEnElArchivo = [...enElEstudio].filter((d) => !vistas.has(d));

  return {
    marcas,
    axes,
    clientPositions,
    excludedTerms,
    grupos: gruposNuevos,
    resumen: {
      cliente: clienteDominio,
      exportadoEl: typeof j.exported_at === 'string' ? j.exported_at : null,
      marcasAplicadas: aplicadas,
      fueraDelEstudio,
      noVienenEnElArchivo,
      ejes: axes.length,
      terminosExcluidos: excludedTerms.length,
      ocultasPorGrupo,
      gruposDesconocidos,
      avisos,
    },
  };
}
