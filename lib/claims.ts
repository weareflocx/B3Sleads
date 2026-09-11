// Claims por marca: qué promete cada una, con sus palabras, y quién lo prueba.
//
// El cruce de vocabulario mira TÉRMINOS: expresiones sueltas que se repiten.
// Esto mira AFIRMACIONES enteras. Son dos preguntas distintas: "esta palabra
// la dice todo el mundo" y "esta promesa la hace todo el mundo y casi nadie
// la demuestra". La segunda es la que decide un territorio.
//
// LO QUE HAY Y LO QUE NO, MEDIDO SOBRE LAS 45 MARCAS DEL ESTUDIO
//
// El scan guarda dos materiales distintos, y ninguno es la web entera:
//
//   · `components[].tiles[].evidencia` — 1.653 citas literales, limpias y
//     completas. Es LO QUE PUNTÚA. No trae URL ni dice de dónde salió.
//   · `components[].evidence_refs[]` — 920 ventanas de 280 caracteres, con
//     su URL. Cortadas a bocado (empiezan y acaban a media palabra), pero
//     dentro se ven los titulares en markdown.
//
// De ahí sale todo lo que se puede decir con honestidad:
//
//   · El texto del claim, completo, sale de las baldosas.
//   · La URL sale de casar ese texto con las ventanas. Casa el 27%.
//   · La procedencia sale de esa misma casación: si la ventana es del
//     dominio de la marca, lo dijo ella; si es de un tercero, lo dijo la
//     prensa. Esto último importa: en el scan de Family entraban frases de
//     una reseña de iLounge que NO son claims de la marca.
//
// Lo que no se puede: dar URL de todos. No está en el scan, y leer las webs
// en vivo no lo arregla (la mitad del corpus es JavaScript o bloquea). Así
// que cada claim dice de dónde sale, incluido "sin rastro", y nunca se
// inventa una fuente.
import type { MarcaCorpus } from './data';
import { ultimoPublicable } from './benchmark';

// ---------- tipos de claim ----------

export interface TipoClaim {
  clave: string;
  nombre: string;
}

// El vocabulario de partida. Es editable por estudio: una categoría de
// telecos y una de multinivel no prometen lo mismo, y forzar las dos a la
// misma lista convierte la matriz en ruido.
export const TIPOS_POR_DEFECTO: TipoClaim[] = [
  { clave: 'beneficio_cliente', nombre: 'Beneficio de cliente' },
  { clave: 'beneficio_afiliado', nombre: 'Beneficio de afiliado' },
  { clave: 'ausencia_barrera', nombre: 'Ausencia de barrera' },
  { clave: 'facilidad', nombre: 'Facilidad' },
  { clave: 'relacion', nombre: 'Relación' },
  { clave: 'autonomia', nombre: 'Autonomía' },
  { clave: 'proposito', nombre: 'Propósito' },
  { clave: 'prueba', nombre: 'Prueba' },
];

export const SIN_CLASIFICAR = 'sin_clasificar';

// Pistas por tipo. El corpus es español, italiano e inglés, así que los tres
// idiomas van juntos: separarlos obligaría a detectar idioma por claim y a
// mantener tres listas que dicen lo mismo.
//
// El ORDEN manda: se devuelve el primero que encaja, y van de lo más
// específico a lo más general. "Ganar 400€ al mes sin inversión" es
// beneficio de afiliado, no ausencia de barrera, aunque contenga las dos.
const PISTAS: { clave: string; re: RegExp }[] = [
  {
    clave: 'beneficio_afiliado',
    re: /\b(distribuidor|distributor|afiliad|associate|consultant|emprendedor|entrepreneur|ingresos? (extra|adicional|pasiv|complementar)|extra income|passive income|comision|commission|provvigion|ganar dinero|earn (money|income|more)|guadagn|oportunidad de negocio|business opportunity|opportunita di business|tu propio negocio|your own business|il tuo business|downline|incaricat|rivenditore|unete a (nuestro|nuestra|la)|join our (team|network|community)|se parte de|diventa (un|partner)|plan de (compensacion|carrera)|compensation plan|career (plan|path)|construye tu (equipo|red)|become (an? )?(agent|successful)|our agents|nuestros agentes|reclut|recruit)/,
  },
  {
    clave: 'prueba',
    re: /\b(desde (19|200)\d{2}|since (19|200)\d{2}|dal (19|200)\d{2}|mas de [\d.,]+ (millones|clientes|usuarios|familias|anos)|more than [\d.,]+ (million|customers|users|years)|oltre [\d.,]+ (milioni|clienti|anni)|[\d.,]+ (millones|million|milioni) de? ?(clientes|customers|clienti|usuarios|users)?|lider (en|del|mundial|de)|leader (in|mondiale|di mercato)|premio|award|galardon|certificad|certified|certificat|iso\s?\d|auditad|audited|acreditad|ranking|n[o°]\s?1\b|#1\b|cotiza en|nyse|nasdaq|trustpilot|b\s?corp)/,
  },
  {
    clave: 'ausencia_barrera',
    re: /\b(sin (permanencia|compromiso|cuota|coste|costes|letra pequena|sorpresas|ataduras|penalizacion|matricula|inversion|riesgo|obligacion|intereses|comisiones|tarifas|trucos|cambiar)|no (fees|contract|commitment|hidden|catch|strings|risk)|senza (vincoli|costi|sorprese|permanenza|penali|rischi)|zero (vincoli|costi|penali)|gratis|gratuit|for free|free of charge|a coste cero|coste cero|nessun (costo|vincolo)|cancela cuando|cancel anytime|disdici quando|mismo precio (para )?siempre|stesso prezzo per sempre|precio fijo|prezzo fisso|fixed price)/,
  },
  {
    clave: 'autonomia',
    re: /\b(tu decides|tu eliges|decide tu|you (choose|decide|are in control)|sei tu a (scegliere|decidere)|libertad|freedom|liberta\b|a tu (ritmo|manera|medida|aire)|your own (pace|way|boss|terms)|se tu propio|be your own|independen|indipendent|cuando (quieras|tu quieras|y donde)|whenever you want|dove e quando (vuoi|preferisci)|sin horarios|no schedule|flexibilidad horaria)/,
  },
  {
    clave: 'facilidad',
    re: /\b(facil|simple|sencill|easy|easily|semplice|facilmente|en (un|dos|tres|pocos|solo) (clic|click|minuto|paso|segundo)|in (one|two|a few|just) (click|minute|step|second)|en [\d]+ (segundos|minutos|clics)|in [\d]+ (seconds|minutes|clicks)|rapido|quick|fast|veloce|rapidamente|sin complicaciones|hassle[ -]free|sin papeleo|no paperwork|todo en uno|all in one|tutto in uno|automatic|nos encargamos|we take care|ci pensiamo noi)/,
  },
  {
    clave: 'proposito',
    re: /\b(nuestra mision|our mission|la nostra missione|nuestra vision|our vision|nuestro proposito|our purpose|nostro scopo|creemos (que|en)|we believe|crediamo|sostenib|sustainab|el planeta|the planet|il pianeta|energia verde|green energy|100% verde|renovable|renewable|rinnovabil|futuro (mejor|sostenible)|better future|impacto (social|positivo|global)|positive impact|mundo mejor|better world|mondo migliore|transformar el|cambiar el mundo|change the world|nuestros valores|our values|i nostri valori|neutralidad (de )?carbono|carbon neutral|descarboniz|emisiones|emissions|nuestra ambicion|our ambition|nostro impegno|nuestro compromiso|our commitment|comprometid)/,
  },
  {
    clave: 'relacion',
    re: /\b(te acompan|contigo|a tu lado|junto a ti|by your side|al tuo fianco|insieme a te|comunidad|community|comunita|nuestra familia|our family|la nostra famiglia|cerca de ti|close to you|personaliz|personalis|su misura|apoyo|support team|te ayudamos|we help you|ti aiutiamo|cuidamos|we care|ci prendiamo cura|te escuchamos|we listen|confianza|trust|fiducia|asesor personal|personal advisor|atencion (personal|humana)|human touch|trato)/,
  },
  {
    clave: 'beneficio_cliente',
    re: /\b(ahorr|save (money|up to|on)|risparmi|reduce (tu|el|la)|reduce your|mejora tu|improve your|migliora|tu salud|your health|la tua salute|bienestar|wellness|benessere|protege|protect your|proteggi|tu seguridad|your security|tu factura|your bill|la bolletta|mejor (precio|tarifa|oferta)|best (price|rate|deal|offer)|miglior (prezzo|tariffa|offerta)|mas barato|cheaper|piu conveniente|calidad|quality|qualita|comodidad|convenience|tranquilidad|peace of mind)/,
  },
];

// El nombre de la marca no clasifica. Sin esto, "FamilyPro: One Smart
// Solution" salía como claim de RELACIÓN por la palabra "family", que es
// media marca, no una promesa de cercanía.
function sinLaMarca(texto: string, dominio: string): string {
  const raiz = dominio.split('.')[0].replace(/[^a-z0-9]/gi, '');
  const t = normaliza(texto);
  if (raiz.length < 4) return t;
  return t.replace(new RegExp(raiz, 'g'), ' ');
}

export function clasificaPorLexico(texto: string, dominio: string, tipos: TipoClaim[]): string {
  const limpio = sinLaMarca(texto, dominio);
  const permitidos = new Set(tipos.map((t) => t.clave));
  for (const p of PISTAS) {
    if (permitidos.has(p.clave) && p.re.test(limpio)) return p.clave;
  }
  return SIN_CLASIFICAR;
}

// ---------- ¿lo prueba? ----------

export type ClasePrueba = 'cifra' | 'fecha' | 'tercero';

export interface Prueba {
  clase: ClasePrueba;
  // El dato exacto que lo hace comprobable. Se enseña: decir "verificable"
  // sin decir por qué es pedir un acto de fe, que es justo lo que esta
  // pantalla existe para no hacer.
  dato: string;
}

// Una cifra con unidad. La unidad es lo que la hace comprobable: "3 claves
// para ahorrar" es un titular, "ahorra 400€" es una promesa que se puede ir
// a mirar. Ojo con \b detrás de € o %: no son caracteres de palabra y el
// límite nunca casa, así que la unidad va en un grupo sin \b final.
const CIFRA =
  /\b\d[\d.,]*\s*(%|€|\$|£|millones?|million|milioni|mil\b|k\b|años|anos|years|anni|clientes|customers|clienti|usuarios|users|utenti|familias|families|famiglie|pa[ií]ses|countries|paesi|kwh|mwh?|gw|segundos|seconds|secondi|minutos|minutes|minuti|horas|hours|ore|dias|days|giorni|meses|months|mesi)/i;
const FECHA = /\b(desde|since|dal|dal ?l'|fundad[ao]|fondat[ao]|founded|established|est\.)\s*(el\s*)?(a[nñ]o\s*)?((19|20)\d{2})\b/i;
const TERCERO =
  /\b(iso\s?\d+|aenor|aesa|cnmc|nyse|nasdaq|forbes|gartner|trustpilot|google reviews|b\s?corp|fsc|aemet|ocu|certificad[ao]|certified|certificat[ao]|acreditad[ao]|accredited|auditad[ao]|audited|premio|award|galardon|ranking|seg[uú]n (el|la|los)|according to|secondo (il|la))\b/i;

export function pruebaDe(texto: string): Prueba | null {
  const c = CIFRA.exec(texto);
  if (c) return { clase: 'cifra', dato: c[0].trim() };
  const f = FECHA.exec(texto);
  if (f) return { clase: 'fecha', dato: f[0].trim() };
  const t = TERCERO.exec(texto);
  if (t) return { clase: 'tercero', dato: t[0].trim() };
  return null;
}

// ---------- el claim ----------

// De dónde sale el texto, dicho sin adornos.
//   'propia'     — casa con una página del dominio de la marca. Lo dice ella.
//   'tercero'    — casa con una página ajena. Lo dice la prensa sobre ella,
//                  que no es lo mismo y no debe contar como promesa suya.
//   'sin-rastro' — el scan guarda la cita pero no de dónde la sacó.
export type Procedencia = 'propia' | 'tercero' | 'sin-rastro';

export interface Claim {
  // Estable entre recálculos: es lo que ancla la reclasificación a mano.
  // Sale del dominio y del texto, no de la posición en la lista.
  id: string;
  dominio: string;
  nombre: string;
  grupo: string | null;
  texto: string;
  url: string | null;
  procedencia: Procedencia;
  // El componente del Scanner que puntuó con esta cita, si viene de una
  // baldosa. Contexto útil: un claim de Propósito no pesa lo mismo si el
  // Scanner lo leyó como Misión.
  componente: string | null;
  tipo: string;
  // Quién decidió el tipo. El juicio humano manda y se queda.
  tipoOrigen: 'lexico' | 'humano';
  prueba: Prueba | null;
  oculto: boolean;
}

export function normaliza(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clave(s: string): string {
  return normaliza(s).replace(/[^a-z0-9]/g, '');
}

// Identificador corto y estable (FNV-1a). No hay crypto síncrono en el
// cliente y esto solo tiene que distinguir claims dentro de un estudio.
function idDe(dominio: string, texto: string): string {
  let h = 0x811c9dc5;
  const s = `${dominio}|${clave(texto)}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

// No todo lo que el Scanner cita es una promesa. En el corpus entran notas
// de prensa, direcciones de oficina, etimologías y trozos de menú, y meterlos
// en la matriz como si fueran claims la vuelve ilegible. Se van fuera aquí,
// no se "clasifican" a la fuerza.
const RUIDO = [
  // Restos de markdown: imágenes, enlaces y URLs sueltas.
  /!\[|\]\(https?:|^https?:\/\//i,
  // Notas de prensa y comunicados corporativos.
  /\b(press release|comunicado|nota de prensa|comunicato stampa|earnings|resultados del (primer|segundo|tercer|cuarto) trimestre|quarterly results|business ?wire|morningstar|reuters|decreto)\b/i,
  // Trozos de web que no afirman nada: menús, direcciones, migas.
  /\b(faqs?|cookies|politica de privacidad|privacy policy|aviso legal|terminos y condiciones|terms (and|&) conditions|mapa del sitio|sitemap|inicia sesion|log ?in|sign ?up|mi cuenta|my account)\b/i,
  /\b(calle|avenida|plaza|c\/|via|street|road)\s+[A-ZÁÉÍÓÚÑ]/,
];
function esRuido(t: string): boolean {
  return RUIDO.some((re) => re.test(t));
}

interface RefScan {
  url?: string;
  snippet?: string;
  component?: string;
}
interface BaldosaScan {
  estado?: string;
  evidencia?: string;
}

// Palabras de cuatro letras o más: las cortas ("de", "the", "e") aparecen en
// cualquier ventana y casarían cualquier cosa con cualquier página.
function significativas(s: string): string[] {
  return normaliza(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

// ¿De qué página salió esta cita? Se buscan tiradas de cuatro palabras
// seguidas dentro de las ventanas. Una coincidencia de cuatro palabras
// consecutivas no es casualidad; una de una sola palabra, sí.
function procedenciaDe(
  texto: string,
  refs: { ref: RefScan; propia: boolean }[],
): { url: string | null; procedencia: Procedencia } {
  const ws = significativas(texto);
  if (ws.length < 4) return { url: null, procedencia: 'sin-rastro' };
  const tiras: string[] = [];
  for (let i = 0; i + 4 <= ws.length; i++) tiras.push(ws.slice(i, i + 4).join(' '));

  let mejor: { url: string; propia: boolean; n: number } | null = null;
  for (const { ref, propia } of refs) {
    if (!ref.url || !ref.snippet) continue;
    const ventana = normaliza(ref.snippet).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    const n = tiras.filter((t) => ventana.includes(t)).length;
    // A igualdad, gana la página propia: si la marca lo dice en su web, que
    // además lo recoja un medio no convierte la frase en ajena.
    if (n > 0 && (!mejor || n > mejor.n || (n === mejor.n && propia && !mejor.propia))) {
      mejor = { url: ref.url, propia, n };
    }
  }
  if (!mejor) return { url: null, procedencia: 'sin-rastro' };
  return { url: mejor.url, procedencia: mejor.propia ? 'propia' : 'tercero' };
}

function esDelDominio(url: string, dominio: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const raiz = dominio.split('.')[0].toLowerCase();
    return host === dominio.toLowerCase() || host.endsWith(`.${dominio}`) || (raiz.length > 3 && host.includes(raiz));
  } catch {
    return false;
  }
}

export interface ParcheClaim {
  tipo?: string;
  oculto?: boolean;
}

export function extraeClaims(
  marcas: { marca: MarcaCorpus; nombre: string; grupo: string | null }[],
  tipos: TipoClaim[],
  overrides: Record<string, ParcheClaim>,
): Claim[] {
  const salida: Claim[] = [];

  for (const { marca, nombre, grupo } of marcas) {
    const scan = ultimoPublicable(marca);
    if (!scan) continue;
    const componentes =
      ((scan.result_raw as Record<string, unknown> | null)?.components as Record<string, unknown>[]) ?? [];

    const refs = componentes
      .flatMap((c) => (c.evidence_refs as RefScan[] | undefined) ?? [])
      .filter((r) => r.url && r.snippet)
      .map((r) => ({ ref: r, propia: esDelDominio(r.url!, marca.company.domain) }));

    // Una frase por marca, aunque el Scanner la use como evidencia de tres
    // componentes. Se guarda la más larga: las ventanas cortan la misma
    // frase por sitios distintos y la completa es la que se puede leer.
    const porClave = new Map<string, { texto: string; componente: string | null }>();
    const mete = (texto: string, componente: string | null) => {
      const t = texto
        .replace(/\s+/g, ' ')
        // Las ventanas empiezan a media palabra y a veces con restos de
        // markdown o de una URL de imagen.
        .replace(/^[^\p{L}\p{N}"“¿¡]+/u, '')
        .trim();
      if (significativas(t).length < 5) return;
      if (esRuido(t)) return;
      const k = clave(t);
      if (!k) return;
      // Contenida en otra que ya está, o al revés: es la misma frase.
      for (const [otra, v] of porClave) {
        if (otra.includes(k)) return;
        if (k.includes(otra)) {
          porClave.delete(otra);
          porClave.set(k, { texto: t, componente: componente ?? v.componente });
          return;
        }
      }
      porClave.set(k, { texto: t, componente });
    };

    // El material bueno: las citas que encendieron una baldosa. Son las
    // afirmaciones completas, y son las que puntúan.
    for (const c of componentes) {
      const etiqueta = (c.label as string) ?? (c.key as string) ?? null;
      for (const b of ((c.tiles as BaldosaScan[] | undefined) ?? []).filter((x) => x.estado === 'ok')) {
        mete(b.evidencia ?? '', etiqueta);
      }
    }
    // Y los titulares que asoman dentro de las ventanas de la propia web.
    // Estos traen URL por construcción.
    for (const { ref, propia } of refs) {
      if (!propia) continue;
      const ventana = ref.snippet ?? '';
      for (const h of ventana.matchAll(/#{1,3}\s+([^\n#]{12,180})/g)) {
        // La ventana son 280 caracteres cortados a bocado: si el titular
        // llega hasta el final, está partido. Se tira la última palabra y se
        // marca con puntos suspensivos, que es la verdad; dejarlo entero
        // haría creer que la marca escribió "en 30 segun".
        const acaba = (h.index ?? 0) + h[0].length;
        const partido = acaba >= ventana.length - 1;
        const texto = partido ? h[1].replace(/\s*\S*$/, '') + '…' : h[1];
        mete(texto, null);
      }
    }

    for (const { texto, componente } of porClave.values()) {
      const id = idDe(marca.company.domain, texto);
      const parche = overrides[id] ?? {};
      const { url, procedencia } = procedenciaDe(texto, refs);
      const auto = clasificaPorLexico(texto, marca.company.domain, tipos);
      salida.push({
        id,
        dominio: marca.company.domain,
        nombre,
        grupo,
        texto,
        url,
        procedencia,
        componente,
        tipo: parche.tipo ?? auto,
        tipoOrigen: parche.tipo ? 'humano' : 'lexico',
        prueba: pruebaDe(texto),
        oculto: parche.oculto ?? false,
      });
    }
  }

  return salida;
}

// ---------- la matriz ----------

export interface FilaTipo {
  clave: string;
  nombre: string;
  claims: number;
  // Marcas que hacen esta promesa.
  usan: number;
  // Marcas que además la acompañan de un dato comprobable. La resta entre
  // las dos es el titular de toda esta pantalla.
  prueban: number;
  clienteUsa: boolean;
  clientePrueba: boolean;
  // Cuántos claims de este tipo tiene cada marca, por dominio.
  porMarca: Record<string, number>;
  // Y cuántos de esos van con prueba.
  probadosPorMarca: Record<string, number>;
}

export interface MatrizClaims {
  filas: FilaTipo[];
  // Las marcas en el orden en que se pidieron, para las columnas.
  marcas: { dominio: string; nombre: string; grupo: string | null; claims: number; probados: number }[];
  total: number;
  sinRastro: number;
  deTerceros: number;
}

export function matrizDeClaims(
  claims: Claim[],
  tipos: TipoClaim[],
  cliente: string,
): MatrizClaims {
  const vivos = claims.filter((c) => !c.oculto);
  const conSinClasificar = [...tipos, { clave: SIN_CLASIFICAR, nombre: 'Sin clasificar' }];

  const filas = conSinClasificar
    .map((t) => {
      const suyos = vivos.filter((c) => c.tipo === t.clave);
      const porMarca: Record<string, number> = {};
      const probadosPorMarca: Record<string, number> = {};
      for (const c of suyos) {
        porMarca[c.dominio] = (porMarca[c.dominio] ?? 0) + 1;
        if (c.prueba) probadosPorMarca[c.dominio] = (probadosPorMarca[c.dominio] ?? 0) + 1;
      }
      return {
        clave: t.clave,
        nombre: t.nombre,
        claims: suyos.length,
        usan: Object.keys(porMarca).length,
        prueban: Object.keys(probadosPorMarca).length,
        clienteUsa: Boolean(porMarca[cliente]),
        clientePrueba: Boolean(probadosPorMarca[cliente]),
        porMarca,
        probadosPorMarca,
      };
    })
    .filter((f) => f.claims > 0);

  const porDominio = new Map<string, { dominio: string; nombre: string; grupo: string | null; claims: number; probados: number }>();
  for (const c of vivos) {
    const y = porDominio.get(c.dominio) ?? {
      dominio: c.dominio,
      nombre: c.nombre,
      grupo: c.grupo,
      claims: 0,
      probados: 0,
    };
    y.claims++;
    if (c.prueba) y.probados++;
    porDominio.set(c.dominio, y);
  }

  return {
    filas,
    marcas: [...porDominio.values()],
    total: vivos.length,
    sinRastro: vivos.filter((c) => c.procedencia === 'sin-rastro').length,
    deTerceros: vivos.filter((c) => c.procedencia === 'tercero').length,
  };
}
