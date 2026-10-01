// Subida en lote: leer una tabla pegada (CSV o tabuladores) o un CSV subido,
// y dejar cada fila lista para comprobar e importar.
//
// Es puro a propósito: lo usan el navegador (vista previa) y el servidor
// (que vuelve a validar todo antes de escribir), y se prueba sin red.
//
// Columnas: dominio (obligatoria), marca, LinkedIn de los fundadores (varias
// URLs separadas por ";"), nombre de los fundadores, sector, ronda (importe y
// fecha), fuente (URL), y opcionales país y ciudad. Con cabecera, en
// cualquier orden; sin cabecera, en ese orden.
import { normalizarDominio } from './dominio';

export interface FundadorLote {
  // Lo que venía en la celda, para poder enseñarlo si no cuadra.
  linkedinRaw: string;
  // Solo si es un perfil personal (linkedin.com/in/…). Nunca se busca ni se
  // adivina un perfil por el nombre.
  linkedinUrl: string | null;
  handle: string | null;
  nombre: string | null;
}

export interface FilaLote {
  n: number; // número de fila en la tabla original (1 = primera fila de datos)
  dominioRaw: string;
  dominio: string | null;
  marca: string | null; // tal cual viene
  fundadores: FundadorLote[];
  sector: string | null;
  ronda: { importe: string | null; fecha: string | null; tipo: string | null } | null;
  fuente: string | null;
  pais: string | null;
  ciudad: string | null;
  errores: string[]; // impiden el alta
  avisos: string[]; // el alta se hace igual
  // Si el mismo dominio ya apareció antes en el lote: es una duplicada, no
  // un error, y no se crea.
  repetidaDe: number | null;
}

export const AVISO_LINKEDIN = 'LinkedIn por verificar';
export const AVISO_NOMBRE = 'nombre por revisar';

type Campo = 'dominio' | 'marca' | 'linkedin' | 'fundador' | 'sector' | 'ronda' | 'fecha' | 'fuente' | 'pais' | 'ciudad';

// Orden sin cabecera: el del enunciado, y al final país y ciudad.
const ORDEN: Campo[] = ['dominio', 'marca', 'linkedin', 'fundador', 'sector', 'ronda', 'fuente', 'pais', 'ciudad'];

const ALIAS: Record<string, Campo> = {
  dominio: 'dominio', domain: 'dominio', web: 'dominio', url: 'dominio', website: 'dominio', 'sitio web': 'dominio',
  marca: 'marca', 'nombre de marca': 'marca', 'nombre marca': 'marca', nombre: 'marca', empresa: 'marca', brand: 'marca', company: 'marca', 'brand name': 'marca',
  linkedin: 'linkedin', linkedins: 'linkedin', 'linkedin del fundador': 'linkedin', 'linkedin fundador': 'linkedin', 'linkedin de los fundadores': 'linkedin', 'linkedin fundadores': 'linkedin', 'founder linkedin': 'linkedin',
  fundador: 'fundador', fundadores: 'fundador', 'nombre del fundador': 'fundador', 'nombre fundador': 'fundador', 'nombre de los fundadores': 'fundador', founder: 'fundador', founders: 'fundador',
  sector: 'sector', industria: 'sector', industry: 'sector',
  ronda: 'ronda', importe: 'ronda', 'ronda importe': 'ronda', 'ronda (importe y fecha)': 'ronda', amount: 'ronda', funding: 'ronda', round: 'ronda',
  fecha: 'fecha', 'fecha ronda': 'fecha', 'fecha de la ronda': 'fecha', date: 'fecha',
  fuente: 'fuente', 'url fuente': 'fuente', 'fuente (url)': 'fuente', source: 'fuente', enlace: 'fuente',
  pais: 'pais', país: 'pais', country: 'pais',
  ciudad: 'ciudad', city: 'ciudad',
};

const limpiaCabecera = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function campoDe(cabecera: string): Campo | null {
  const c = limpiaCabecera(cabecera);
  return ALIAS[c] ?? ALIAS[c.replace(/[()]/g, '').trim()] ?? null;
}

// CSV con comillas: "a, b" es una celda, "" es una comilla dentro.
function partir(linea: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (dentro) {
      if (ch === '"' && linea[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') dentro = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      dentro = true;
      cur = '';
    } else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Líneas lógicas: un salto de línea dentro de comillas no corta la fila.
function lineas(texto: string): string[] {
  const out: string[] = [];
  let cur = '';
  let dentro = false;
  for (const ch of texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')) {
    if (ch === '"') dentro = !dentro;
    if (ch === '\n' && !dentro) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.filter((l) => l.trim() !== '');
}

// El separador: tabulador si lo hay (pegar desde una hoja), y si no, el que
// reconozca más cabeceras o parta mejor la primera línea. El ";" también
// separa varios LinkedIn dentro de una celda, así que no se elige a ciegas.
function separador(primera: string): string {
  if (primera.includes('\t')) return '\t';
  const puntua = (sep: string) => {
    const celdas = partir(primera, sep);
    return celdas.filter((c) => campoDe(c)).length * 10 + celdas.length;
  };
  return puntua(';') > puntua(',') ? ';' : ',';
}

export function linkedinDePerfil(raw: string): { url: string; handle: string } | null {
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)\/?(?:[?#].*)?$/i);
  if (!m) return null;
  let handle: string;
  try {
    handle = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
  if (!/^[\p{L}\p{N}\-_%.]{2,100}$/u.test(handle)) return null;
  return { url: `https://www.linkedin.com/in/${handle}`, handle };
}

const FECHA_ISO = /\b(\d{4})-(\d{1,2})(?:-(\d{1,2}))?\b/;
const FECHA_ES = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;
const FECHA_MES = /\b(\d{1,2})[/.-](\d{4})\b/;
const TIPOS = /\b(pre[- ]?seed|seed|serie[s]? [a-e]|series [a-e]|ronda [a-e]|bridge|angel|crowdfunding)\b/i;

// "2M€ · 2026-09", "1,5 M€ 12/03/2026", "Seed 500K", o importe y fecha en
// columnas aparte. La fecha queda en ISO (aaaa-mm-dd); el importe, como venga.
export function leeRonda(ronda: string, fechaAparte = ''): FilaLote['ronda'] {
  let texto = ronda.trim();
  let fecha: string | null = null;
  const desde = (s: string) => {
    let m = s.match(FECHA_ISO);
    if (m) return { iso: `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] ?? '01').padStart(2, '0')}`, txt: m[0] };
    m = s.match(FECHA_ES);
    if (m) return { iso: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, txt: m[0] };
    m = s.match(FECHA_MES);
    if (m) return { iso: `${m[2]}-${m[1].padStart(2, '0')}-01`, txt: m[0] };
    return null;
  };
  const f1 = fechaAparte.trim() ? desde(fechaAparte) : null;
  const f2 = desde(texto);
  if (f1) fecha = f1.iso;
  else if (f2) fecha = f2.iso;
  if (f2) texto = texto.replace(f2.txt, '');
  if (fecha && Number.isNaN(Date.parse(fecha))) fecha = null;
  const tipo = texto.match(TIPOS)?.[0] ?? null;
  const importe = texto.replace(/[·|,;]+\s*$/g, '').replace(/^\s*[·|,;]+/g, '').replace(/\s{2,}/g, ' ').trim() || null;
  if (!importe && !fecha) return null;
  return { importe, fecha, tipo };
}

const vacio = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

export function leeTabla(texto: string): { filas: FilaLote[]; conCabecera: boolean; error: string | null } {
  const ls = lineas(texto);
  if (!ls.length) return { filas: [], conCabecera: false, error: 'No hay nada que importar.' };
  const sep = separador(ls[0]);
  const primera = partir(ls[0], sep);
  const reconocidas = primera.map(campoDe);
  const conCabecera = reconocidas.includes('dominio');
  if (!conCabecera && reconocidas.filter(Boolean).length >= 2) {
    return { filas: [], conCabecera: true, error: 'La cabecera no tiene columna «dominio». Es la única obligatoria.' };
  }
  const columnas: (Campo | null)[] = conCabecera ? reconocidas : ORDEN;
  const datos = conCabecera ? ls.slice(1) : ls;

  const filas = datos.map((linea, i): FilaLote => {
    const celdas = partir(linea, sep);
    const v: Partial<Record<Campo, string>> = {};
    columnas.forEach((c, j) => {
      if (c && celdas[j] !== undefined && v[c] === undefined) v[c] = celdas[j];
    });

    const errores: string[] = [];
    const avisos: string[] = [];
    const dominioRaw = (v.dominio ?? '').trim();
    const dominio = normalizarDominio(dominioRaw);
    if (!dominioRaw) errores.push('Falta el dominio.');
    else if (!dominio) errores.push(`«${dominioRaw}» no es un dominio (marca.com).`);

    const marca = vacio(v.marca);
    if (!marca) avisos.push(AVISO_NOMBRE);

    const urls = (v.linkedin ?? '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    const nombres = (v.fundador ?? '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    const fundadores: FundadorLote[] = [];
    for (let k = 0; k < Math.max(urls.length, nombres.length); k++) {
      const raw = urls[k] ?? '';
      const perfil = raw ? linkedinDePerfil(raw) : null;
      fundadores.push({ linkedinRaw: raw, linkedinUrl: perfil?.url ?? null, handle: perfil?.handle ?? null, nombre: nombres[k] ?? null });
    }
    if (!fundadores.some((f) => f.linkedinUrl) || fundadores.some((f) => f.linkedinRaw && !f.linkedinUrl)) {
      avisos.push(AVISO_LINKEDIN);
    }

    const fuente = vacio(v.fuente);
    if (fuente && !/^https?:\/\/\S+\.\S+/i.test(fuente)) avisos.push('la fuente no es una URL');

    return {
      n: i + 1,
      dominioRaw,
      dominio,
      marca,
      fundadores,
      sector: vacio(v.sector),
      ronda: v.ronda || v.fecha ? leeRonda(v.ronda ?? '', v.fecha ?? '') : null,
      fuente,
      pais: vacio(v.pais),
      ciudad: vacio(v.ciudad),
      errores,
      avisos,
      repetidaDe: null,
    };
  });

  // Repetidas dentro del propio lote: cuenta la primera.
  const vistos = new Map<string, number>();
  for (const f of filas) {
    if (!f.dominio) continue;
    const antes = vistos.get(f.dominio);
    if (antes) f.repetidaDe = antes;
    else vistos.set(f.dominio, f.n);
  }
  return { filas, conCabecera, error: null };
}
