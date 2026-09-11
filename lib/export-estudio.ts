// Exportación del estudio. B3S es la fuente de verdad de los datos y la
// clasificación; Notion y Figma importan de aquí. Nunca al revés.
import type { MarcaCorpus } from './data';
import type { Grupo, PerfilMarca } from './benchmark';
import { COMPONENTES, perfilDeMarca, ultimoPublicable } from './benchmark';

import type { TerminoCompartido as VocabTermino } from './vocabulario';
import { SIN_CLASIFICAR, type Claim, type TipoClaim } from './claims';
import {
  CAPA_LABEL,
  PRIORIDAD_LABEL,
  ROL_LABEL,
  VERIFICACION_LABEL,
  verificacionDe,
  type Eje,
  type MarcaEstudio,
} from './battle-cards';

// Nombre de columna por componente: sin espacios, sin barras y sin tildes.
// La etiqueta de pantalla ("Personalidad / Arquetipo") hace ilegible una
// cabecera de hoja de cálculo y rompe cualquier fórmula que la referencie.
const COLUMNA: Record<string, string> = {
  purpose: 'proposito',
  mission: 'mision',
  vision: 'vision',
  values: 'valores',
  attributes: 'atributos',
  'value-prop': 'propuesta_valor',
  personality: 'personalidad',
  'brand-idea': 'idea_marca',
  magnetism: 'magnetismo',
  coherence: 'coherencia',
};

// Una celda de CSV. Se entrecomilla solo lo que lo necesita, y las comillas
// de dentro se duplican, que es lo único que entienden igual Excel, Numbers
// y Google Sheets.
function celda(v: unknown): string {
  const t = v == null ? '' : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function fila(vs: unknown[]): string {
  return vs.map(celda).join(',');
}

// Sin nombre de eje utilizable se cae al identificador: una columna sin
// cabecera legible es peor que una fea.
function cabeceraEje(e: Eje): string {
  const t = `${e.label_left}-${e.label_right}`.trim();
  return t === '-' ? e.axis_id : t;
}

// El cruce de vocabulario en CSV: término, cuántas marcas, cuáles y la cita
// de cada una. Es el material para escribir el apartado de códigos de
// categoría sin volver a mirar la pantalla.
export function csvDelVocabulario(
  grupos: { nombre: string; marcasConTexto: number; terminos: VocabTermino[] }[],
): string {
  const filas: string[] = [
    fila(['grupo', 'termino', 'marcas', 'de_marcas', 'fuera_pct', 'concentracion', 'usa_el_cliente', 'marca', 'cita']),
  ];
  for (const g of grupos) {
    for (const t of g.terminos) {
      // Una fila por marca y término: así la cita cabe en su celda en vez de
      // amontonar cinco en una, que es lo que hace ilegible un CSV.
      for (const m of t.marcas) {
        filas.push(
          fila([
            g.nombre,
            t.termino,
            t.marcas.length,
            g.marcasConTexto,
            t.fuera,
            t.concentracion,
            t.clienteTambien ? 'si' : 'no',
            m.nombre,
            m.cita,
          ]),
        );
      }
    }
  }
  return '\ufeff' + filas.join('\r\n') + '\r\n';
}

// Los claims, uno por fila. Se exporta TODO lo que se ve en pantalla,
// incluida la procedencia y el dato que hace comprobable una promesa: un CSV
// que solo dijera "verificable: sí" obligaría a volver a la app para saber
// por qué.
export function csvDeClaims(claims: Claim[], tipos: TipoClaim[]): string {
  const nombreTipo = new Map([
    ...tipos.map((t) => [t.clave, t.nombre] as const),
    [SIN_CLASIFICAR, 'Sin clasificar'] as const,
  ]);
  const filas: string[] = [
    fila([
      'marca', 'dominio', 'grupo', 'tipo', 'tipo_decidido_por',
      'prueba', 'clase_de_prueba', 'dato', 'procedencia', 'url',
      'componente_del_scan', 'claim',
    ]),
  ];
  for (const c of claims) {
    if (c.oculto) continue;
    filas.push(
      fila([
        c.nombre,
        c.dominio,
        c.grupo ?? '',
        nombreTipo.get(c.tipo) ?? c.tipo,
        c.tipoOrigen === 'humano' ? 'persona' : 'lexico',
        c.prueba ? 'si' : 'no',
        c.prueba?.clase ?? '',
        c.prueba?.dato ?? '',
        c.procedencia,
        c.url ?? '',
        c.componente ?? '',
        c.texto,
      ]),
    );
  }
  return '\ufeff' + filas.join('\r\n') + '\r\n';
}

export function csvDelEstudio({
  grupos,
  marcas,
  ejes,
  corpus,
}: {
  grupos: Grupo[];
  marcas: Record<string, MarcaEstudio>;
  ejes: Eje[];
  corpus: Map<string, MarcaCorpus>;
}): string {
  const cabecera = [
    'dominio',
    'nombre',
    'grupo',
    'score',
    'componentes_detectados',
    // Las diez del Scanner, en porcentaje sobre su propio máximo: los topes
    // no son iguales (Magnetismo y Coherencia valen 20, Misión 5) y comparar
    // puntos crudos daría más peso a los componentes con más recorrido.
    ...COMPONENTES.map((c) => `${COLUMNA[c] ?? c}_pct`),
    'rol',
    'capa',
    'prioridad',
    'nota',
    'verificacion',
    ...ejes.map(cabeceraEje),
    'url_informe',
  ];

  const filas: string[] = [fila(cabecera)];

  for (const g of grupos) {
    for (const d of g.dominios) {
      const m = corpus.get(d);
      const f = marcas[d];
      const perfil: PerfilMarca | null = m ? perfilDeMarca(m) : null;
      const sinRastro = new Set(perfil?.sinRastro ?? []);
      const scan = m ? ultimoPublicable(m) : null;

      filas.push(
        fila([
          d,
          perfil?.name ?? d,
          g.nombre,
          perfil?.score ?? '',
          perfil ? `${perfil.detectados}/10` : '',
          // Un componente sin rastro va VACÍO, no a 0. Para comparar, "no hay
          // nada" vale cero y así lo puntúa el Scanner; en una hoja de
          // cálculo, un 0 se promedia con los demás y hunde la media por algo
          // que en realidad no se leyó.
          ...COMPONENTES.map((c) => {
            if (!perfil || sinRastro.has(c)) return '';
            const r = perfil.ratios[c];
            return r == null ? '' : Math.round(r * 100);
          }),
          f?.role ? ROL_LABEL[f.role] : '',
          f?.layer ? CAPA_LABEL[f.layer] : '',
          f?.priority ? PRIORIDAD_LABEL[f.priority] : '',
          f?.note ?? g.notas?.[d] ?? '',
          VERIFICACION_LABEL[
            verificacionDe(f, {
              conScanPublicable: scan != null,
              conScanRetenido: (m?.scans.length ?? 0) > 0 && scan == null,
            })
          ],
          ...ejes.map((e) => f?.axis_scores?.[e.axis_id] ?? ''),
          scan?.ui_url ?? '',
        ]),
      );
    }
  }

  // BOM por delante. Sin él, Excel abre el archivo en su codificación local y
  // "Energía" llega como "EnergÃ­a".
  return '﻿' + filas.join('\r\n') + '\r\n';
}
