// Lectura de categoría por dimensión: qué dice cada grupo, componente a
// componente, y dónde queda el cliente.
//
// La Matriz ya compara, pero marca a marca. Esto agrega: la pregunta no es
// "quién puntúa más en Propósito" sino "cuánto pesa el Propósito en esta
// categoría". Sale entero de lo que el estudio ya tiene; no se escanea nada.
//
// LO QUE HACE ESTE ARCHIVO Y NO HACE `compara()`
//
// `compara()` promedia `ratios`, y ahí un componente SIN RASTRO entra como 0
// porque así lo puntúa el Scanner al agregar. Para un score global es
// correcto. Para leer una categoría, no: mezcla "lo dice y lo dice mal" con
// "no encontramos nada". Medido en Multinivel, Misión pasa de 64 a 76 y
// Visión de 25 a 53 según cuál de las dos cuentes.
//
// Así que las dos lecturas se ofrecen, con nombre, y siempre acompañadas de
// cuántas marcas sostienen cada número.
import { COMPONENTES, type Componente, type PerfilMarca } from './benchmark';
import { DIMENSION_LABELS } from './scan-versions';

export interface PerfilDimensiones {
  dominio: string;
  nombre: string;
  grupo: string;
  ratios: Partial<Record<Componente, number>>;
  sinRastro: Componente[];
}

// Cómo tratar un componente que el Scanner no llegó a ver.
//   'excluir'    → no cuenta, y se dice cuántas eran. Qué dicen las que lo dicen.
//   'como-cero'  → cuenta como 0, igual que en el score. Cuántas lo dicen.
export type PoliticaNulos = 'excluir' | 'como-cero';

export interface CeldaDimension {
  // 0..1, o null si no queda ninguna marca que contar.
  media: number | null;
  // Marcas que entraron en la media.
  n: number;
  // Marcas que el Scanner no llegó a leer en este componente.
  sinRastro: number;
  // Marcas con un cero MEDIDO: se buscó y no había. Es lo que convierte un
  // cero del cliente en una anomalía o en la norma de la categoría.
  enCero: number;
}

export interface FilaDimension {
  key: Componente;
  label: string;
  cliente: { valor: number | null; sinRastro: boolean };
  porGrupo: { nombre: string; celda: CeldaDimension }[];
}

function celda(perfiles: PerfilDimensiones[], key: Componente, politica: PoliticaNulos): CeldaDimension {
  let suma = 0;
  let n = 0;
  let sinRastro = 0;
  let enCero = 0;

  for (const p of perfiles) {
    const ausente = p.sinRastro.includes(key);
    const r = p.ratios[key];
    if (ausente) {
      sinRastro++;
      if (politica === 'como-cero') {
        suma += 0;
        n++;
      }
      continue;
    }
    if (r == null) continue;
    if (r === 0) enCero++;
    suma += r;
    n++;
  }

  return { media: n ? suma / n : null, n, sinRastro, enCero };
}

export function mediasPorDimension({
  porGrupo,
  cliente,
  politica,
}: {
  porGrupo: { nombre: string; perfiles: PerfilDimensiones[] }[];
  cliente: PerfilMarca | PerfilDimensiones | null;
  politica: PoliticaNulos;
}): FilaDimension[] {
  const ausentesCliente = new Set(cliente?.sinRastro ?? []);
  return COMPONENTES.map((key) => ({
    key,
    label: DIMENSION_LABELS[key] ?? key,
    cliente: {
      valor: ausentesCliente.has(key) ? null : (cliente?.ratios[key] ?? null),
      sinRastro: ausentesCliente.has(key),
    },
    porGrupo: porGrupo.map((g) => ({ nombre: g.nombre, celda: celda(g.perfiles, key, politica) })),
  }));
}
