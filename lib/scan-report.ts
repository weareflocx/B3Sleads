// Adaptador del resultado estructurado de B3S Scanner API v1. Conserva soporte
// para los informes Markdown históricos ya guardados en Supabase.
import type { B3SScanResult } from './brand3';

export interface ScanTodo {
  label: string; // "Propia", "Clara"…
  desc: string; // "La frase no vale para su competencia."
}

// Una baldosa del componente con su estado medido:
//  on = encendida · off = no detectada · blind = no se pudo medir.
export interface ScanTile {
  label: string;
  state: 'on' | 'off' | 'blind';
  reason: string | null;
}

export interface ScanDimension {
  name: string; // "Propuesta de valor"
  score: number | null;
  max: number | null;
  ratio: number | null; // score/max, o 0 si "no detectado"
  verdict: string | null; // el blockquote ">" de la sección
  // Lectura estratégica: el bloque prescriptivo que abre el componente en el
  // Scanner original (campo `message` de la API). Mira al ciclo siguiente:
  // qué sostiene hoy y qué tiene que demostrar después. No es el análisis.
  reading: string | null;
  analysis: string | null; // primera frase de análisis en prosa
  todos: ScanTodo[]; // baldosas apagadas (acciones concretas)
  missing: boolean; // "_No detectado._"
  // Solo en scans v1: la evidencia literal capturada (puede venir en el
  // idioma de la web) y su URL de origen.
  quote?: string | null;
  quoteUrl?: string | null;
  // Términos cortos extraídos por el escáner (Atributos/Valores): p. ej.
  // "Segura · Técnica · Exclusiva". Si vienen, se muestran en vez de la cita.
  terms?: string[] | null;
  // Solo en scans v1: todas las baldosas con su estado.
  tilesDetail?: ScanTile[];
}

export interface ScanReport {
  summary: string | null; // el blockquote de cabecera
  dimensions: ScanDimension[];
  strengths: ScanDimension[]; // lo que ya funciona (ratio alto)
  weaknesses: ScanDimension[]; // la oportunidad (bajo o no detectado)
}

function categorize(summary: string | null, dimensions: ScanDimension[]): ScanReport {
  const strengths = dimensions
    .filter((d) => !d.missing && (d.ratio ?? 0) >= 0.8)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const weaknesses = dimensions
    .filter((d) => d.missing || (d.ratio != null && d.ratio <= 0.6))
    .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
  return { summary, dimensions, strengths, weaknesses };
}

function firstSentence(text: string, max = 240): string {
  const clean = text.trim();
  const dot = clean.indexOf('. ');
  const cut = dot > 40 ? clean.slice(0, dot + 1) : clean;
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + '…' : cut;
}

export function parseScanReport(markdown: string): ScanReport {
  const parts = markdown.split(/\n## /);
  const head = parts[0] ?? '';
  const summaryMatch = head.match(/^>\s*(.+)$/m);
  const summary = summaryMatch ? summaryMatch[1].trim() : null;

  const dimensions: ScanDimension[] = [];
  for (const block of parts.slice(1)) {
    const name = block.split('\n')[0].replace(/[#*]/g, '').trim();
    if (!name) continue;

    const missing = /_No detectado\._/.test(block);
    // La nota que cuenta es la ponderada "(N/M pts)": Magnetismo y Coherencia
    // pesan ×2 y valen 20 (así el total cuadra a /100). El "**X/Y**" en
    // negrita es la nota sin ponderar (8/10), que engañaba a la parrilla.
    const ptsM = block.match(/\(\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*pts\)/);
    const boldM = block.match(/Nota:\s*\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
    const sc = ptsM ?? boldM;
    const score = sc ? parseFloat(sc[1]) : null;
    const max = sc ? parseFloat(sc[2]) : null;
    const ratio = score != null && max ? score / max : missing ? 0 : null;

    const verdictM = block.match(/^>\s*(.+)$/m);
    const verdict = verdictM ? verdictM[1].trim() : null;

    let analysis: string | null = null;
    // Línea de términos cortos si el informe la trae ("Segura · Técnica · …").
    let terms: string[] | null = null;
    for (const line of block.split('\n').slice(1)) {
      const l = line.trim();
      if (!l || /^[>\-#_]/.test(l) || /Nota:/.test(l)) continue;
      if (!terms && l.includes('·') && l.length <= 90 && !/[.!?]/.test(l.replace(/\.\s*$/, ''))) {
        const parts = l.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 4)) {
          terms = parts.slice(0, 6);
          continue;
        }
      }
      if (!analysis) analysis = l;
    }

    const todos: ScanTodo[] = [];
    const bald = block.split(/### Baldosas apagadas[^\n]*\n/)[1];
    if (bald) {
      const scope = bald.split(/\n### /)[0];
      for (const m of scope.matchAll(/- \*\*[^·*]*·\s*([^*]+?)\*\*\s*—\s*([^\n]+)/g)) {
        todos.push({ label: m[1].trim(), desc: m[2].trim() });
      }
    }

    dimensions.push({ name, score, max, ratio, verdict, reading: null, analysis, todos, missing, terms });
  }

  return categorize(summary, dimensions);
}

// Reconstruye un informe a partir de dimensiones ya resueltas. Es lo que
// permite que el argumentario y el brief consuman el Brand Seed CONSOLIDADO
// (la versión curada de cada componente) en vez del último run a secas.
export function reportFromDimensions(
  summary: string | null,
  dimensions: ScanDimension[],
): ScanReport {
  return categorize(summary, dimensions);
}

// Extrae el markdown del scan (si se importó por URL de informe).
export function reportMarkdown(resultRaw: Record<string, unknown> | null | undefined): string | null {
  const md = (resultRaw as { markdown?: unknown } | null)?.markdown;
  return typeof md === 'string' && md.length > 100 ? md : null;
}

// Las capturas vienen en markdown: imágenes fuera, enlaces reducidos a su
// texto, y sin URLs sueltas. Sin esto las citas arrastraban cosas como
// "![](https://…/badge objetivo 03 eng.png)".
function cleanQuote(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Términos cortos que el escáner extrae para Atributos y Valores
// ("Segura · Técnica · Exclusiva · Eficiente"). No viajan en todas las
// versiones del contrato: se buscan bajo los nombres de campo habituales y,
// en su defecto, en un detected_content que ya venga en formato lista corta.
// Devuelve null salvo que haya al menos dos términos de pocas palabras.
function shortTerms(component: Record<string, unknown>): string[] | null {
  const clean = (list: unknown[]): string[] =>
    list
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 32 && !/[.!?]$/.test(s) && s.split(/\s+/).length <= 4);

  for (const key of ['attributes', 'values', 'descriptors', 'traits', 'terms', 'tags', 'keywords']) {
    const value = component[key];
    if (Array.isArray(value)) {
      const terms = clean(value);
      if (terms.length >= 2) return terms.slice(0, 6);
    }
  }

  // detected_content ya en lista: "Segura · Técnica · Exclusiva" o con comas,
  // corto y sin puntuación de frase.
  const dc = typeof component.detected_content === 'string' ? component.detected_content.trim() : '';
  if (dc && dc.length <= 90 && /·|,/.test(dc) && !/[.!?]/.test(dc.replace(/\.\s*$/, ''))) {
    const parts = clean(dc.split(/\s*·\s*|\s*,\s*/));
    if (parts.length >= 2) return parts.slice(0, 6);
  }

  // Y el caso real: el Scanner los enumera dentro de una frase, no como lista.
  //   "Boxten destaca atributos clave como VELOCIDAD, MEMORÍA y EQUILIBRIO."
  // Se extraen solo si la enumeración CIERRA la frase, para no quedarse con un
  // trozo suelto de una explicación más larga.
  for (const source of [dc, typeof component.summary === 'string' ? component.summary : '']) {
    const terms = enumeratedTerms(source);
    if (terms) return terms;
  }

  // Último y mejor recurso: las baldosas. Ahí es donde el Scanner enumera de
  // verdad los atributos y los valores que ha encontrado, y hasta ahora no lo
  // miraba nadie. Se recorren en orden (la primera es la del hallazgo).
  //
  // Solo para atributos y valores: son las dos dimensiones que SON una lista.
  // Las demás son una idea, y trocear su lectura en etiquetas la empeora.
  const key = String(component.key ?? '').toLowerCase();
  if (!/^(attributes|values)$/.test(key)) return null;
  const tiles = Array.isArray(component.tiles) ? component.tiles : [];
  const textos = [
    ...tiles.map((t) => (t as Record<string, unknown>)?.evidencia),
    ...tiles.map((t) => (t as Record<string, unknown>)?.motivo),
    dc,
    component.summary,
  ].filter((t): t is string => typeof t === 'string' && t.length > 20);
  for (const texto of textos) {
    const terms = termsFromText(texto);
    if (terms) return terms;
  }
  return null;
}

// ---------- Extracción de términos cortos ----------
// El Scanner NO devuelve una lista de atributos ni de valores: los enumera
// dentro de la prosa de sus baldosas. Tres formas reales, vistas en scans:
//   A1  "destaca atributos clave como VELOCIDAD, MEMORIA, PUNTERÍA y EQUILIBRIO."
//   A2  "Los atributos listados (Velocidad, Memoria, Concentración) son…"
//   A1  "Verificación manual de cada propiedad antes de publicarla, soporte
//        24/7, atención multilingüe en español, y verificación de estudiantes…"
// El tercero es el caso difícil: cada item de la lista es una frase que
// empieza por el concepto y sigue con su matiz. Por eso de cada item se
// conserva la CABEZA (dos o tres palabras) y se tira el resto.

// Palabras que no pueden cerrar un término: si la cabeza acaba en preposición
// o artículo, es que hemos cortado a mitad de una idea.
const COLA_VACIA =
  /^(de|del|la|el|los|las|lo|en|con|para|por|y|e|o|a|al|un|una|unos|unas|que|su|sus|mediante|antes|desde|sobre|entre|como|más|of|the|and|to|for|in|with|on|by)$/i;

// Preposiciones que cortan el término: lo que va detrás es matiz, no concepto.
// "Empatía para entender al cliente" es "Empatía". Se deja fuera "de", que en
// español forma términos legítimos ("Control de fluidez").
const CORTE =
  /^(para|en|con|por|mediante|sin|sobre|desde|entre|hacia|tras|que|como|a|al|donde|cuando|si|y|e|o|u|es|son|está|están|fue|era|the|for|with|on|by|that|which|when|is|are)$/i;

// La cabeza de un item: el concepto, sin su matiz, en dos o tres palabras.
function cabezaTermino(raw: string): string | null {
  const limpio = raw
    .replace(/^[\s'"«»(\[¡¿-]+|[\s'"«»)\]!?.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return null;
  let palabras = limpio.split(' ');
  const corte = palabras.findIndex((w, i) => i > 0 && CORTE.test(w));
  if (corte > 0) palabras = palabras.slice(0, corte);
  if (palabras.length > 3) palabras = palabras.slice(0, 3);
  while (palabras.length && COLA_VACIA.test(palabras[palabras.length - 1])) palabras.pop();
  if (!palabras.length) return null;
  const termino = palabras.join(' ');
  if (termino.length < 3 || termino.length > 28) return null;
  if (/^[\d\W]+$/.test(termino)) return null;
  return normalizaTermino(termino);
}

// Un término no empieza por artículo ni por posesivo: si lo hace, estamos
// leyendo el análisis del Scanner sobre la marca ("El tono es resolutivo",
// "La marca define…"), no los atributos de la marca.
const ARRANQUE_PROSA =
  /^(el|la|los|las|lo|un|una|unos|unas|este|esta|estos|estas|ese|esa|su|sus|nuestro|nuestra|nuestros|nuestras|cada|todo|toda|todos|todas|sino|no|ni|aunque|pero|porque|mientras|además|también|tampoco|aun|así|cuando|donde|the|their|our|its|this|these|unlike|while|although|though|but|because|however)$/i;

// ¿Este trozo era ya un término, o es una frase que hemos amputado? Un item de
// más de cuatro palabras es prosa: el Scanner no escribe atributos así.
function pareceTermino(raw: string): boolean {
  const palabras = raw.trim().split(/\s+/).filter(Boolean);
  if (!palabras.length || palabras.length > 4) return false;
  return !ARRANQUE_PROSA.test(palabras[0]);
}

// El trozo de texto que contiene la enumeración, de más fiable a menos:
// entre paréntesis, tras un marcador ("como", "son", ":"), o el texto entero
// si al menos tiene tres comas.
function trozoEnumerado(text: string): string[] {
  const trozos: string[] = [];
  for (const m of text.matchAll(/\(([^()]{12,180})\)/g)) {
    if ((m[1].match(/,/g) ?? []).length >= 2) trozos.push(m[1]);
  }
  const marcado = text.split(/\b(?:clave como|como|son|incluyen|se define por)\b|:/i);
  if (marcado.length > 1) trozos.push(marcado[marcado.length - 1]);
  if ((text.match(/,/g) ?? []).length >= 3) trozos.push(text);
  return trozos;
}

// Términos cortos a partir de un texto en prosa.
//
// Es deliberadamente estricto: una píldora equivocada en algo que se le manda
// a un founder es peor que no poner ninguna. Tres filtros, y basta que falle
// uno para descartar la lista entera:
//  - el PRIMER item tiene que ser ya un término; si empieza en prosa, todo lo
//    es (por eso "Tennders provides an integrated platform, streamlining…" no
//    pasa, y "(Velocidad, Memoria, Concentración)" sí),
//  - al menos tres items,
//  - y dos de cada tres items del original tienen que parecer términos.
export function termsFromText(text: string | null | undefined, min = 3): string[] | null {
  const base = (text ?? '').replace(/\s+/g, ' ').trim();
  if (base.length < 20) return null;

  for (const trozo of trozoEnumerado(base)) {
    const crudos = trozo
      .replace(/[.;]+\s*$/, '')
      .split(/\s*[,;]\s*|\s+(?:y|e|and)\s+/i)
      .map((t) => t.trim())
      .filter(Boolean);
    if (crudos.length < min) continue;
    if (!pareceTermino(crudos[0])) continue;
    const buenos = crudos.filter(pareceTermino).length;
    if (buenos < min || buenos / crudos.length < 0.66) continue;

    // Sin duplicados y sin términos contenidos en otro ("Verificación" y
    // "Verificación manual" son el mismo hallazgo).
    const vistos = new Map<string, string>();
    for (const crudo of crudos) {
      if (!pareceTermino(crudo)) continue;
      const t = cabezaTermino(crudo);
      if (!t) continue;
      const k = t.toLowerCase();
      const solapado = [...vistos.keys()].find((v) => v.startsWith(k) || k.startsWith(v));
      if (solapado) {
        if (k.length > solapado.length) {
          vistos.delete(solapado);
          vistos.set(k, t);
        }
        continue;
      }
      vistos.set(k, t);
    }
    const salida = [...vistos.values()];
    if (salida.length >= min) return salida.slice(0, 4);
  }
  return null;
}

// Términos enumerados al final de la primera frase: "… como A, B, C y D."
// Devuelve null salvo que haya 3 o más, todos cortos: con menos, o con items
// largos, casi siempre es prosa y no una lista de atributos.
export function enumeratedTerms(text: string | null | undefined): string[] | null {
  if (!text) return null;
  const first = text.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  if (!first || first.length > 220) return null;

  // El arranque de la lista: tras "como", "son", ":" o el inicio de la frase.
  const afterMarker = first.split(/\b(?:como|son|incluyen|se define por)\b|:/i).pop() ?? first;
  const tail = afterMarker.replace(/[.!?]+\s*$/, '').trim();
  if (!/\s(?:y|e)\s/i.test(tail) || !tail.includes(',')) return null;

  const parts = tail
    .split(/\s*,\s*|\s+(?:y|e)\s+/i)
    .map((p) => p.trim().replace(/^["'«»]+|["'«»]+$/g, ''))
    .filter(Boolean);
  if (parts.length < 3) return null;
  // Todos los items tienen que ser cortos: si uno se va, era prosa.
  if (!parts.every((p) => p.length <= 28 && p.split(/\s+/).length <= 3)) return null;
  // Nada de verbos o conectores sueltos colándose como "atributo".
  if (parts.some((p) => /^(el|la|los|las|un|una|de|del|que|con|para|en)$/i.test(p))) return null;

  return parts.slice(0, 6).map(titleCase);
}

// Una palabra escrita entera en caja alta.
const CAJA_ALTA = /^[^a-záéíóúñü]*[A-ZÁÉÍÓÚÑÜ][^a-záéíóúñü]*$/;

// El texto capturado de una web viene con los titulares en caja alta, y en
// algo que se comparte eso es gritar. Se rebajan las TIRADAS de cuatro o más
// palabras en mayúsculas —una sigla suelta no es un grito—, y se exige que
// alguna pase de cuatro letras, para no tocar "NFT SDK CLI API".
export function sinGritos(text: string): string {
  const palabras = text.split(' ');
  const salida = [...palabras];
  let i = 0;
  while (i < palabras.length) {
    if (!CAJA_ALTA.test(palabras[i]) || !/[A-ZÁÉÍÓÚÑÜ]/.test(palabras[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < palabras.length && CAJA_ALTA.test(palabras[j]) && /[A-ZÁÉÍÓÚÑÜ]/.test(palabras[j])) j += 1;
    const tirada = palabras.slice(i, j);
    const larga = tirada.some((w) => w.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length >= 5);
    if (tirada.length >= 4 && larga) {
      for (let k = i; k < j; k++) salida[k] = palabras[k].toLowerCase();
    }
    i = j;
  }
  const frase = salida.join(' ');
  // Mayúscula solo al principio de cada frase.
  return frase.replace(/(^\s*|[.!?…]\s+)([a-záéíóúñü])/g, (_m, p, c) => p + c.toUpperCase());
}

// Un término se enseña con mayúscula solo en la primera letra. Las siglas
// cortas se respetan (GPS, ITDR, SDK): ahí la caja alta es el nombre.
function normalizaTermino(s: string): string {
  const palabras = s.split(/\s+/).map((w) => {
    const letras = w.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
    if (CAJA_ALTA.test(w) && letras.length > 5) return w.toLowerCase();
    return w;
  });
  const t = palabras.join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// VELOCIDAD → Velocidad, pero se respetan las siglas (ITDR, SaaS B2B).
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 4 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function tileText(tile: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tile[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

// Magnetismo y Coherencia pesan x2 en la rúbrica baldosas-v3: son las dos
// dimensiones que valen 20 puntos y no 10.
const COMPONENT_WEIGHT = /magnet|coheren/i;

function structuredScanReport(result: B3SScanResult): ScanReport {
  // El primer evidence_ref suele ser el mismo para casi todos los componentes
  // (el H1 de la home), así que asignarlo a ciegas repetía la misma frase en
  // media parrilla. Se recogen candidatos por componente y se reparten sin
  // repetir; si a uno no le queda ninguno propio, habla su detected_content,
  // que el Scanner sí escribe específico para él.
  const raw = result.components.map((component) => {
    const status = `${component.status} ${component.coverage_status}`.toLowerCase();
    const missing = /not.?detected|absent|missing/.test(status);
    // El payload manda Magnetismo y Coherencia SIN ponderar (x/10) aunque
    // valen el doble. Ponderados aquí, los diez componentes suman 100 y su
    // suma coincide exactamente con el score global del Scanner (verificado
    // contra los 37 escaneos con contrato v1). Así la ficha enseña la escala
    // real (Magnetismo y Coherencia sobre 20) y el consolidado es exacto.
    const weight = COMPONENT_WEIGHT.test(`${component.key} ${component.label}`) ? 2 : 1;
    const score = component.score != null ? component.score * weight : null;
    const max = component.max_score != null ? component.max_score * weight : null;
    const ratio = score != null && max ? score / max : missing ? 0 : null;

    const todos: ScanTodo[] = component.tiles.flatMap((tile) => {
      const state = tileText(tile, ['estado', 'state', 'status'])?.toLowerCase() ?? '';
      if (!['no', 'off', 'failed', 'missing', 'absent'].includes(state)) return [];
      const label = tileText(tile, ['id', 'label', 'name', 'nombre', 'key']) || 'Mejora';
      const desc = tileText(tile, ['motivo', 'description', 'desc', 'message', 'reason', 'summary']);
      return desc ? [{ label, desc }] : [];
    });

    const tilesDetail: ScanTile[] = component.tiles.map((tile) => {
      const label = tileText(tile, ['id', 'label', 'name', 'nombre', 'key']) || '·';
      const rawState = (tileText(tile, ['estado', 'state', 'status']) ?? '').toLowerCase();
      const state: ScanTile['state'] = /^(ok|s[ií]|yes|pass(ed)?|on)$/.test(rawState)
        ? 'on'
        : ['no', 'off', 'failed', 'missing', 'absent'].includes(rawState)
          ? 'off'
          : 'blind';
      const reason =
        tileText(tile, ['motivo', 'description', 'desc', 'message', 'reason']) ||
        tileText(tile, ['evidencia', 'evidence']);
      return { label, state, reason: reason ?? null };
    });

    // Candidatos de cita, de más específico a más genérico: primero lo que
    // capturó cada baldosa, luego las referencias del componente.
    const candidates: { text: string; url: string | null }[] = [];
    for (const tile of component.tiles) {
      const ev = tileText(tile, ['evidencia', 'evidence']);
      const clean = ev ? cleanQuote(ev) : '';
      if (clean.length >= 25) candidates.push({ text: clean, url: null });
    }
    for (const ref of component.evidence_refs ?? []) {
      const clean = cleanQuote(ref.snippet ?? '');
      if (clean.length >= 25) candidates.push({ text: clean, url: ref.url || null });
    }

    return {
      dimension: {
        name: component.label || component.key,
        score,
        max,
        ratio,
        verdict: component.verdict || null,
        // `message` es la lectura estratégica del Scanner. Antes se usaba solo
        // como recambio de `summary`, así que se perdía en cuanto había summary.
        reading: component.message || null,
        analysis: component.summary || null,
        todos,
        missing,
        quote: null as string | null,
        quoteUrl: null as string | null,
        terms: shortTerms(component as unknown as Record<string, unknown>),
        tilesDetail,
      } satisfies ScanDimension,
      candidates,
      detected: component.detected_content?.trim() || null,
      fallbackUrl: component.evidence_refs?.[0]?.url || null,
    };
  });

  // Reparto: cada componente se queda con la primera cita que nadie haya
  // usado. Los que tienen menos candidatos eligen antes, para que no se
  // queden sin nada por culpa de los que tienen de sobra.
  const used = new Set<string>();
  const order = [...raw].sort((a, b) => a.candidates.length - b.candidates.length);
  for (const item of order) {
    const pick = item.candidates.find((c) => !used.has(c.text));
    if (pick) {
      used.add(pick.text);
      item.dimension.quote = pick.text;
      item.dimension.quoteUrl = pick.url;
    } else if (item.detected) {
      // Sin cita propia: lo que el Scanner detectó para ESTE componente.
      item.dimension.quote = item.detected;
      item.dimension.quoteUrl = item.fallbackUrl;
    }
  }

  const dimensions = raw.map((r) => r.dimension);
  return categorize(result.summary || null, dimensions);
}

// Punto de entrada para consumidores actuales: primero usa el contrato v1 y
// sólo cae al parser Markdown para filas históricas.
export function storedScanReport(
  resultRaw: Record<string, unknown> | null | undefined,
): ScanReport | null {
  if (
    resultRaw?.object === 'scan_result' &&
    resultRaw.metadata &&
    Array.isArray(resultRaw.components)
  ) {
    return structuredScanReport(resultRaw as unknown as B3SScanResult);
  }
  const markdown = reportMarkdown(resultRaw);
  return markdown ? parseScanReport(markdown) : null;
}

// Digest compacto para el redactor con IA: lo esencial y por-marca, sin los
// 8000 chars crudos. Alimenta el prompt de generateDraft.
export function reportDigest(report: ScanReport): string {
  const lines: string[] = [];
  if (report.summary) lines.push(`Lectura global: ${report.summary}`);
  if (report.strengths.length) {
    lines.push('\nLo que ya funciona:');
    for (const d of report.strengths.slice(0, 2)) {
      lines.push(`- ${d.name} (${d.score}/${d.max}): ${firstSentence(d.verdict || d.analysis || '')}`);
    }
  }
  if (report.weaknesses.length) {
    lines.push('\nHuecos concretos (oportunidad de marca):');
    for (const d of report.weaknesses.slice(0, 3)) {
      const base = d.missing
        ? 'no detectado en superficies públicas'
        : firstSentence(d.verdict || d.analysis || '');
      lines.push(`- ${d.name}${d.score != null ? ` (${d.score}/${d.max})` : ''}: ${base}`);
      for (const t of d.todos.slice(0, 2)) lines.push(`    · ${t.label}: ${t.desc}`);
    }
  }
  return lines.join('\n');
}

// ---------- runs retenidos ----------
// El Scanner no siempre publica una puntuación. Cuando detecta que en esta
// pasada ha visto MENOS que en la anterior (una web tapada por un banner de
// cookies, un bloqueo, contenido que ya no reacquiere) marca el run como
// "shadow" y retiene el número, en vez de publicar uno peor que sabe que es
// fruto de haber leído menos, no de que la marca haya empeorado. Es una
// decisión sensata del Scanner, pero deja el run sin nada que enseñar.
export interface Retencion {
  motivo: string;
  detalle: string | null;
  // Lo que de verdad cambió entre las dos pasadas. El motivo del Scanner es
  // una etiqueta de política, no una descripción: "regresión de adquisición"
  // salta también cuando la pasada leyó MÁS pero no reencontró unas cuantas
  // páginas de la vez anterior. Sin este matiz la ficha decía que el Scanner
  // había leído menos cuando había leído más, que es peor que no decir nada.
  matiz: string | null;
}

const MOTIVOS: Record<string, string> = {
  acquisition_regression: 'esta pasada leyó menos de la web que la anterior',
  insufficient_evidence: 'no encontró evidencia suficiente',
};

const OBSTRUCCIONES: Record<string, string> = {
  cookie_banner: 'un banner de cookies le tapa la página',
  paywall: 'un muro de pago le corta el acceso',
  login: 'un login le corta el acceso',
  captcha: 'un captcha le corta el acceso',
};

// Devuelve por qué un scan se quedó sin puntuación, o null si sí la tiene.
export function retencionDeScan(raw: unknown): Retencion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const score = r.score as Record<string, unknown> | undefined;
  if (!score || score.value != null) return null;

  const clave = String(score.retention_reason ?? '').trim();
  const motivo = MOTIVOS[clave] ?? 'el Scanner no consideró publicable el resultado';

  // El detalle útil está en el gate de adquisición: es lo que se le puede
  // contar al founder, y suele ser algo que él puede arreglar.
  const avisos = (r.acquisition_gate?.warnings ?? []) as Array<{ detail?: string }>;
  const texto = avisos.map((a) => a?.detail ?? '').join(' ');
  const obstruccion = Object.keys(OBSTRUCCIONES).find((k) => texto.includes(k));

  const cmp = r.stability?.baseline_comparison ?? r.stability?.previous_comparison;
  const delta = cmp?.delta as Record<string, any> | undefined;
  const perdidas = typeof delta?.lost_locator_count === 'number' ? delta.lost_locator_count : null;
  const nuevas = typeof delta?.added_locator_count === 'number' ? delta.added_locator_count : 0;
  // El Scanner distingue entre una URL que comprobó que ya no existe y una que
  // simplemente no le tocó esta vez. Cuando la lista de bajas confirmadas está
  // vacía, "perdió evidencia" es una sospecha, no un hecho.
  const confirmadas = Array.isArray(delta?.verified_removed_urls)
    ? delta.verified_removed_urls.length
    : 0;

  let matiz: string | null = null;
  if (perdidas != null && nuevas > perdidas && confirmadas === 0) {
    // Aquí la obstrucción NO es la causa: el banner tapa la captura visual,
    // no el rastreo de páginas. Va como frase aparte para no encadenar una
    // relación de causa que los datos no dicen.
    matiz =
      `En realidad leyó más que la vez anterior: ${nuevas} páginas nuevas frente a ${perdidas} que ` +
      'dejó de ver, y ninguna de esas está confirmada como desaparecida. Retiene por prudencia, ' +
      'no porque la marca haya empeorado.' +
      (obstruccion ? ` Aparte, ${OBSTRUCCIONES[obstruccion]} y se quedó sin la parte visual.` : '');
    return {
      motivo: `no reencontró ${perdidas} páginas que sí leyó la vez anterior`,
      detalle: null,
      matiz,
    };
  }
  if (perdidas != null && perdidas > 0) {
    matiz = `Dejó de ver ${perdidas} páginas y encontró ${nuevas} nuevas.`;
  }
  return { motivo, detalle: obstruccion ? OBSTRUCCIONES[obstruccion] : null, matiz };
}
