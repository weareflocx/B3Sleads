'use client';

import { useMemo, useRef, useState } from 'react';
import { Select } from '../../select';
import { logoUrl } from '../../company-logo';
import { anilloDeScore } from '../../score-ring';
import { useEstudio } from './estudio-estado';
import {
  CAPAS,
  CAPA_LABEL,
  PRIORIDADES,
  PRIORIDAD_LABEL,
  ROLES,
  ROL_LABEL,
  type Capa,
} from '@/lib/battle-cards';

// Los mapas del estudio. Dos lecturas del mismo conjunto de marcas:
//
//  ESTRATÉGICO  dos ejes tecleados a mano. Dice dónde está cada marca en las
//               tensiones que definen la categoría, y dónde quiere estar el
//               cliente. El cuadrante vacío es el argumento.
//
//  MADUREZ      calculado del scan, sin teclear nada. Cruza cuánto pesa el
//               significado frente a lo funcional con el Brand3 Score.
//
// Dibujado a mano en SVG, como el resto de lo visual de la casa. No es
// cabezonería: el SVG que se ve es el que se exporta a Figma, sin
// rasterizar y sin librería que meta su propio marcado por medio.

export interface PuntoMapa {
  dominio: string;
  nombre: string;
  score: number | null;
  // 0..1 en las dos dimensiones, ya normalizado por quien llama.
  x: number;
  y: number;
  capa: Capa | null;
  rol: string | null;
  nota: string | null;
  grupo?: string | null;
  logoUrl?: string | null;
  dimensiones?: Record<string, number | null>;
  informeUrl?: string | null;
  // Posición calculada sobre datos incompletos: se pinta hueca y no cuenta.
  flojo?: boolean;
  motivoFlojo?: string | null;
}

const COLOR_CAPA: Record<Capa, string> = {
  competitive: 'var(--accent)',
  register: 'var(--linkedin-soft)',
  anti_reference: 'var(--soft)',
};
const COLOR_SIN_CAPA = 'var(--muted)';

// 16:10, para que el SVG exportado salga a 1600x1000 exactos sin deformar.
const W = 800;
const H = 500;
// Abajo y a la izquierda caben tres cosas: números, extremos y nombre del
// eje. Antes los extremos de los dos ejes se apilaban en la misma esquina.
const M = { arriba: 30, derecha: 30, abajo: 62, izquierda: 62 };
const CAJA = { w: W - M.izquierda - M.derecha, h: H - M.arriba - M.abajo };

// El tamaño dice la CAPA, no el score: el score es el arco, que se lee de un
// vistazo sin comparar áreas. Son pequeños a propósito. Con cuarenta marcas,
// una insignia grande deja de ser un dato y pasa a ser un estorbo; para mirar
// de cerca está el zoom.
const DIAMETRO_CAPA: Record<Capa, number> = {
  competitive: 26,
  register: 22,
  anti_reference: 19,
};
const DIAMETRO_SIN_CAPA = 20;

// El lienzo mide 800 y se ve a 1600 o más: cada unidad son dos o tres píxeles
// reales. Un 11 se convertía en 27, casi tan alto como una marca entera, y el
// texto pesaba más que los datos.
const TIPO = { marca: 8.5, extremo: 9, numero: 8, cuadrante: 7.5, titulo: 7.5 };

// Cuánto del hueco ocupa el logo, dejando aire alrededor.
const AIRE_LOGO = 0.82;

const UNIDADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// El cliente se dibuja como cualquier otra marca —logo dentro, anillo de
// score alrededor— y se distingue por tamaño y por un aro exterior fino, no
// por una forma distinta. El rombo obligaba a recortar el logo en diagonal y
// no se parecía a nada del resto del producto.
const CLIENTE = { diametro: 34, hueco: 34 / 2 - 4.5 };
const ZOOM_MAX = 6;

function diametro(capa: Capa | null): number {
  return capa ? DIAMETRO_CAPA[capa] : DIAMETRO_SIN_CAPA;
}
function radio(p: { capa: Capa | null }): number {
  return diametro(p.capa) / 2;
}

// Las mismas fuentes que CompanyLogo: el logo pegado a mano y, si no, el
// que elige el servidor. Se repite aquí porque aquel es un componente con
// <img> y dentro de un SVG exportable hace falta <image>.
function fuentesDeLogo(dominio: string, manual?: string | null): string[] {
  return [manual?.trim() || null, logoUrl(dominio)].filter(Boolean) as string[];
}

function iniciales(nombre: string): string {
  return (
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') ||
    '?'
  );
}

const clipId = (dominio: string) => `logo-${dominio.replace(/[^a-z0-9]/gi, '-')}`;
const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Exporta el mapa que se está viendo como SVG para Figma.
//
// El SVG de la página usa variables CSS (var(--cta), var(--border)…), que
// fuera del documento no existen: el archivo llegaría a Figma con todo en
// negro. Se clona el dibujo y se sustituye cada color por el valor ya
// calculado por el navegador. Sin rasterizar y sin fondo.
// Una imagen como data URL, para que el archivo lleve los logos DENTRO. Un
// SVG con <image href="https://…"> se abre en Figma sin logos: no los va a
// buscar. Si una no se puede leer (CORS de un logo pegado a mano), se
// devuelve null y esa marca sale con sus iniciales.
async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function descargarSvg(svg: SVGSVGElement, nombre: string) {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  const origen = svg.querySelectorAll('*');
  const destino = copia.querySelectorAll('*');

  const PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray',
    'stroke-opacity', 'font-size', 'font-weight', 'text-anchor',
  ] as const;

  for (let i = 0; i < origen.length; i++) {
    const calculado = getComputedStyle(origen[i]);
    const el = destino[i] as SVGElement;
    for (const prop of PROPS) {
      const v = calculado.getPropertyValue(prop);
      if (v && v !== 'none' && !v.includes('var(')) el.setAttribute(prop, v.trim());
      else if (v === 'none') el.setAttribute(prop, 'none');
    }
    if (el.tagName === 'text') {
      el.setAttribute('font-family', 'Geist, Inter, Helvetica, Arial, sans-serif');
    }
    el.removeAttribute('style');
    el.removeAttribute('class');
  }

  // Lo que solo tiene sentido fuera de la app: el nombre de cada eje. Dentro
  // lo dicen los selectores; en el archivo no hay selectores.
  for (const el of copia.querySelectorAll('[data-solo-export]')) {
    el.setAttribute('opacity', '1');
    el.removeAttribute('data-solo-export');
  }

  // Los logos, embebidos. Los que no se puedan leer se quitan y quedan las
  // iniciales, que en el archivo se pintan siempre (data-iniciales).
  const imagenes = [...copia.querySelectorAll('image')];
  await Promise.all(
    imagenes.map(async (img) => {
      const href = img.getAttribute('href') ?? '';
      const data = href.startsWith('data:') ? href : await comoDataUrl(href);
      if (data) {
        img.setAttribute('href', data);
        img.removeAttribute('xlink:href');
      } else {
        img.remove();
      }
    }),
  );
  copia.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copia.setAttribute('width', '1600');
  copia.setAttribute('height', '1000');
  copia.removeAttribute('class');
  copia.removeAttribute('style');

  const texto = new XMLSerializer().serializeToString(copia);
  const url = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Mapa({
  madurez,
  clienteMadurez,
  clienteNombre,
  clienteScore,
  clienteLogo,
  clienteDominio,
}: {
  // Los puntos de madurez llegan calculados del servidor: salen del scan y no
  // cambian al teclear. Los del mapa estratégico se derivan aquí, del estado
  // del cliente, para que puntuar mueva el punto sin recargar.
  madurez: PuntoMapa[];
  clienteMadurez: { x: number; y: number } | null;
  clienteNombre: string;
  clienteScore: number | null;
  clienteLogo?: string | null;
  clienteDominio: string;
}) {
  const { ejes, posiciones, marcas } = useEstudio();
  const [tipo, setTipo] = useState<'estrategico' | 'madurez'>(
    ejes.length >= 2 ? 'estrategico' : 'madurez',
  );
  const [ejeX, setEjeX] = useState(ejes[0]?.axis_id ?? '');
  const [ejeY, setEjeY] = useState(ejes[1]?.axis_id ?? '');
  const [verEtiquetas, setVerEtiquetas] = useState(true);
  // El hover pasa a llevar su posición: la tarjeta se pinta AL LADO del punto
  // y no en un cajón debajo del mapa, donde había que apartar la vista del
  // dibujo para leer de qué marca hablaba.
  const [encima, setEncima] = useState<{ p: PuntoMapa; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cajaRef = useRef<HTMLDivElement | null>(null);

  // Los mismos filtros que la rejilla de Clasificación. Sin ellos, el mapa
  // enseña las cuarenta y cuatro marcas a la vez y no hay forma de mirar solo
  // el núcleo competitivo, que suele ser la pregunta.
  const [fGrupo, setFGrupo] = useState('');
  const [fRol, setFRol] = useState('');
  const [fCapa, setFCapa] = useState('');
  const [fPrioridad, setFPrioridad] = useState('');

  // Cascada de logos y qué imagen ha llegado a cargar. Las iniciales solo se
  // pintan mientras no haya logo: un PNG con transparencia dejaba ver la
  // letra por debajo y parecía un error de dibujo.
  const [logoIdx, setLogoIdx] = useState<Record<string, number>>({});
  const [logoOk, setLogoOk] = useState<Record<string, boolean>>({});

  // La ventana visible, en unidades de dato (0..1). Al acercar, los puntos se
  // separan pero las marcas NO crecen: si creciera todo a la vez el amontonamiento
  // sería el mismo y el zoom no serviría de nada.
  const [vista, setVista] = useState({ escala: 1, x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const x = ejes.find((e) => e.axis_id === ejeX) ?? ejes[0];
  const y = ejes.find((e) => e.axis_id === ejeY) ?? ejes[1];
  const esEstrategico = tipo === 'estrategico';

  const px = (v: number) => M.izquierda + (v - vista.x) * vista.escala * CAJA.w;
  const py = (v: number) => M.arriba + CAJA.h - (v - vista.y) * vista.escala * CAJA.h;

  const encuadrar = (escala: number, cx: number, cy: number) => {
    const e = acotar(escala, 1, ZOOM_MAX);
    const lado = 1 / e;
    return {
      escala: e,
      x: acotar(cx - lado / 2, 0, 1 - lado),
      y: acotar(cy - lado / 2, 0, 1 - lado),
    };
  };
  const centro = { x: vista.x + 0.5 / vista.escala, y: vista.y + 0.5 / vista.escala };
  const acercar = (f: number) => setVista(encuadrar(vista.escala * f, centro.x, centro.y));

  const estrategicos = useMemo<PuntoMapa[]>(() => {
    if (!x || !y) return [];
    return madurez
      .map((p): PuntoMapa | null => {
        const f = marcas[p.dominio];
        const a = f?.axis_scores?.[x.axis_id];
        const b = f?.axis_scores?.[y.axis_id];
        // Sin puntuación en los dos ejes no hay posición. No se pinta en el
        // centro por defecto: eso sería inventarse dónde está la marca.
        if (a == null || b == null) return null;
        return { ...p, x: a / 10, y: b / 10, flojo: false, motivoFlojo: null };
      })
      .filter((p): p is PuntoMapa => p !== null);
  }, [madurez, marcas, x, y]);

  const base = esEstrategico ? estrategicos : madurez;
  const visibles = base.filter((p) => {
    const f = marcas[p.dominio] ?? {};
    if (fGrupo && p.grupo !== fGrupo) return false;
    if (fRol && f.role !== fRol) return false;
    if (fCapa && f.layer !== fCapa) return false;
    if (fPrioridad ? f.priority !== fPrioridad : f.priority === 'out') return false;
    return true;
  });
  const hayFiltro = Boolean(fGrupo || fRol || fCapa || fPrioridad);
  const grupos = [...new Set(base.map((p) => p.grupo).filter(Boolean))] as string[];

  const etiquetas = {
    izquierda: esEstrategico ? (x?.label_left ?? '') : 'Funcional',
    derecha: esEstrategico ? (x?.label_right ?? '') : 'Significado',
    abajo: esEstrategico ? (y?.label_left ?? '') : 'Score bajo',
    arriba: esEstrategico ? (y?.label_right ?? '') : 'Score alto',
  };
  const tituloX = `${etiquetas.izquierda} → ${etiquetas.derecha}`;
  const tituloY = `${etiquetas.abajo} → ${etiquetas.arriba}`;

  // Solo las unidades que caen dentro de la ventana. Al acercar, la escala
  // que se lee es la de verdad y no un 0-10 que ya no se está viendo.
  const dentro = (v: number) => v / 10 >= vista.x - 1e-6 && v / 10 <= vista.x + 1 / vista.escala + 1e-6;
  const dentroY = (v: number) => v / 10 >= vista.y - 1e-6 && v / 10 <= vista.y + 1 / vista.escala + 1e-6;
  const valorY = (v: number) => (esEstrategico ? String(v) : String(v * 10));

  const CUADRANTES = [
    { clave: 'ai', ax: 0, ay: 1, anchor: 'start' as const, arriba: true, texto: `${etiquetas.izquierda} · ${etiquetas.arriba}` },
    { clave: 'ad', ax: 1, ay: 1, anchor: 'end' as const, arriba: true, texto: `${etiquetas.derecha} · ${etiquetas.arriba}` },
    { clave: 'bi', ax: 0, ay: 0, anchor: 'start' as const, arriba: false, texto: `${etiquetas.izquierda} · ${etiquetas.abajo}` },
    { clave: 'bd', ax: 1, ay: 0, anchor: 'end' as const, arriba: false, texto: `${etiquetas.derecha} · ${etiquetas.abajo}` },
  ];

  // Reparto de etiquetas. Los puntos NO se mueven: correr un punto para que
  // quepa su nombre es mentir sobre su posición, y la posición es lo único
  // que este dibujo afirma. Lo que se reparte son las etiquetas.
  const { etiquetadas, sinSitio } = useMemo(() => {
    const ordenados = [...visibles].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const ocupado: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const choca = (r: (typeof ocupado)[number]) =>
      ocupado.some((o) => !(r.x2 < o.x1 || r.x1 > o.x2 || r.y2 < o.y1 || r.y1 > o.y2));

    // Los puntos entran como obstáculo antes que ninguna etiqueta: un nombre
    // encima de otra marca se lee como si fuera suyo.
    for (const p of ordenados) {
      const r = radio(p) + 2;
      ocupado.push({ x1: px(p.x) - r, y1: py(p.y) - r, x2: px(p.x) + r, y2: py(p.y) + r });
    }

    const out: { punto: PuntoMapa; lx: number; ly: number; anchor: 'middle' | 'start' | 'end' }[] = [];
    let perdidas = 0;

    for (const p of ordenados) {
      const cx = px(p.x);
      const cy = py(p.y);
      const r = radio(p);
      const ancho = p.nombre.length * (TIPO.marca * 0.56) + 5;
      const alto = TIPO.marca + 3;
      const candidatos = [
        { lx: cx, ly: cy + r + 10, anchor: 'middle' as const, x1: cx - ancho / 2, y1: cy + r + 2 },
        { lx: cx, ly: cy - r - 5, anchor: 'middle' as const, x1: cx - ancho / 2, y1: cy - r - 5 - alto },
        { lx: cx + r + 4, ly: cy + 3, anchor: 'start' as const, x1: cx + r + 4, y1: cy - 5 },
        { lx: cx - r - 4, ly: cy + 3, anchor: 'end' as const, x1: cx - r - 4 - ancho, y1: cy - 5 },
      ];
      const hueco = candidatos.find((c) => {
        const rect = { x1: c.x1, y1: c.y1, x2: c.x1 + ancho, y2: c.y1 + alto };
        if (rect.x1 < 2 || rect.x2 > W - 2 || rect.y1 < 2 || rect.y2 > H - 2) return false;
        return !choca(rect);
      });
      if (!hueco) {
        perdidas++;
        continue;
      }
      ocupado.push({ x1: hueco.x1, y1: hueco.y1, x2: hueco.x1 + ancho, y2: hueco.y1 + alto });
      out.push({ punto: p, lx: hueco.lx, ly: hueco.ly, anchor: hueco.anchor });
    }
    return { etiquetadas: out, sinSitio: perdidas };
  }, [visibles, vista]);

  const cliente = esEstrategico && x && y ? {
    hoy: posiciones.current?.[x.axis_id] != null && posiciones.current?.[y.axis_id] != null
      ? { x: posiciones.current[x.axis_id]! / 10, y: posiciones.current[y.axis_id]! / 10 }
      : null,
    objetivo: posiciones.target?.[x.axis_id] != null && posiciones.target?.[y.axis_id] != null
      ? { x: posiciones.target[x.axis_id]! / 10, y: posiciones.target[y.axis_id]! / 10 }
      : null,
  } : {
    // En madurez no hay "objetivo": la posición sale del scan, y un scan
    // futuro no se puede teclear.
    hoy: clienteMadurez,
    objetivo: null,
  };

  const flojas = visibles.filter((p) => p.flojo).length;
  const MINI = 'font-mono text-[10px] uppercase tracking-wider';

  return (
    <section className="mt-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        {/* Arriba, qué se está mirando. Abajo a la izquierda, cómo se mira;
            a la derecha, qué marcas entran. Los filtros estaban pegados a los
            selectores de eje y se leían como parte de ellos. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tipo} onChange={(v) => setTipo(v as typeof tipo)} align="left" ariaLabel="Tipo de mapa"
            options={[
              { value: 'estrategico', label: 'Mapa estratégico' },
              { value: 'madurez', label: 'Mapa de madurez' },
            ]} />
          {esEstrategico && ejes.length >= 2 && (
            <>
              <span className={`${MINI} text-[var(--soft)]`}>X</span>
              <Select value={x?.axis_id ?? ''} onChange={setEjeX} align="left" ariaLabel="Eje horizontal"
                options={ejes.map((e) => ({ value: e.axis_id, label: `${e.label_left} → ${e.label_right}` }))} />
              <span className={`${MINI} text-[var(--soft)]`}>Y</span>
              <Select value={y?.axis_id ?? ''} onChange={setEjeY} align="left" ariaLabel="Eje vertical"
                options={ejes.map((e) => ({ value: e.axis_id, label: `${e.label_left} → ${e.label_right}` }))} />
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border)] pt-2">
          <label className={`${MINI} flex cursor-pointer items-center gap-1.5 text-[var(--soft)]`}>
            <input type="checkbox" checked={verEtiquetas} onChange={(e) => setVerEtiquetas(e.target.checked)} />
            nombres
          </label>
          {/* Acercar separa los puntos sin agrandar las marcas: es lo único
              que sirve cuando cuarenta caen en el mismo palmo. */}
          <span className="flex items-center gap-1">
            <button onClick={() => acercar(1 / 1.5)} disabled={vista.escala <= 1}
              className="h-6 w-6 rounded border border-[var(--border)] font-mono text-xs text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30">−</button>
            <span className={`${MINI} w-8 text-center text-[var(--soft)]`}>{vista.escala.toFixed(1)}×</span>
            <button onClick={() => acercar(1.5)} disabled={vista.escala >= ZOOM_MAX}
              className="h-6 w-6 rounded border border-[var(--border)] font-mono text-xs text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30">+</button>
            {vista.escala > 1 && (
              <button onClick={() => setVista({ escala: 1, x: 0, y: 0 })}
                className={`${MINI} ml-1 rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]`}>
                todo
              </button>
            )}
          </span>
          <button
            onClick={() => svgRef.current && descargarSvg(svgRef.current, `mapa-${esEstrategico ? 'estrategico' : 'madurez'}-${clienteNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)}
            disabled={visibles.length === 0}
            title="Descarga el mapa tal y como se ve, para abrirlo en Figma"
            className={`${MINI} rounded border border-[var(--border)] px-2 py-1 transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40`}>
            svg
          </button>

          {/* Los filtros, al otro extremo. Y el color de cada capa va DENTRO
              del selector: la clave vive donde se actúa sobre ella, en vez de
              en una leyenda aparte que había que relacionar a ojo. */}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {hayFiltro && (
              <button onClick={() => { setFGrupo(''); setFRol(''); setFCapa(''); setFPrioridad(''); }}
                className={`${MINI} rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]`}>
                quitar filtros
              </button>
            )}
            {grupos.length > 1 && (
              <Select value={fGrupo} onChange={setFGrupo} ariaLabel="Filtrar por grupo"
                options={[{ value: '', label: 'Todos los grupos' }, ...grupos.map((g) => ({ value: g, label: g }))]} />
            )}
            <Select value={fCapa} onChange={setFCapa} ariaLabel="Filtrar por capa"
              options={[
                { value: '', label: 'Todas las capas' },
                ...CAPAS.map((c) => ({ value: c, label: CAPA_LABEL[c], dot: COLOR_CAPA[c] })),
              ]} />
            <Select value={fPrioridad} onChange={setFPrioridad} ariaLabel="Filtrar por prioridad"
              options={[{ value: '', label: 'Sin las descartadas' }, ...PRIORIDADES.map((p) => ({ value: p, label: PRIORIDAD_LABEL[p] }))]} />
            <Select value={fRol} onChange={setFRol} ariaLabel="Filtrar por rol"
              options={[{ value: '', label: 'Cualquier rol' }, ...ROLES.map((r) => ({ value: r, label: ROL_LABEL[r] }))]} />
          </span>
        </div>

        {esEstrategico && ejes.length < 2 ? (
          <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            El mapa estratégico cruza dos ejes. Define al menos dos en Clasificación y puntúa las
            marcas que quieras situar.
          </p>
        ) : visibles.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            {hayFiltro ? 'Ningún punto cumple ese filtro.'
              : esEstrategico ? 'Ninguna marca puntuada todavía en esos dos ejes.'
              : 'Ninguna marca con scan publicable.'}
          </p>
        ) : (
          <div className="relative mt-3" ref={cajaRef}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full select-none"
              style={{ minWidth: 520, cursor: vista.escala > 1 ? 'grab' : 'default' }}
              role="img"
              aria-label={esEstrategico ? 'Mapa estratégico' : 'Mapa de madurez'}
              onPointerDown={(e) => {
                if (vista.escala <= 1) return;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
              }}
              onPointerMove={(e) => {
                const a = arrastre.current;
                if (!a || !svgRef.current) return;
                const caja = svgRef.current.getBoundingClientRect();
                const uX = (e.clientX - a.x) / caja.width * W / (vista.escala * CAJA.w);
                const uY = (e.clientY - a.y) / caja.height * H / (vista.escala * CAJA.h);
                const lado = 1 / vista.escala;
                setVista((v) => ({
                  ...v,
                  x: acotar(a.vx - uX, 0, 1 - lado),
                  y: acotar(a.vy + uY, 0, 1 - lado),
                }));
              }}
              onPointerUp={() => { arrastre.current = null; }}
              onPointerLeave={() => { arrastre.current = null; }}
            >
              <defs>
                {/* Nada se sale del plano al arrastrar. */}
                <clipPath id="area-mapa">
                  <rect x={M.izquierda} y={M.arriba} width={CAJA.w} height={CAJA.h} />
                </clipPath>
                {visibles.map((p) => (
                  <clipPath key={p.dominio} id={clipId(p.dominio)}>
                    <circle cx={px(p.x)} cy={py(p.y)} r={radio(p) - 3.5} />
                  </clipPath>
                ))}
                {cliente.hoy && (
                  <clipPath id="logo-cliente">
                    <circle cx={px(cliente.hoy.x)} cy={py(cliente.hoy.y)} r={CLIENTE.hueco} />
                  </clipPath>
                )}
                {cliente.objetivo && (
                  <clipPath id="logo-objetivo">
                    <circle cx={px(cliente.objetivo.x)} cy={py(cliente.objetivo.y)} r={CLIENTE.hueco} />
                  </clipPath>
                )}
              </defs>

              {/* Rejilla cada unidad, con la del 5 marcada: es la que parte
                  los cuadrantes, o sea la lectura. */}
              <g clipPath="url(#area-mapa)">
                {UNIDADES.filter(dentro).map((v) => (
                  <line key={`vx-${v}`} x1={px(v / 10)} y1={M.arriba} x2={px(v / 10)} y2={M.arriba + CAJA.h}
                    stroke="var(--border)" strokeWidth={v === 5 ? 1 : 0.5} strokeOpacity={v === 5 ? 0.9 : 0.45}
                    strokeDasharray={v === 5 ? '3 4' : undefined} />
                ))}
                {UNIDADES.filter(dentroY).map((v) => (
                  <line key={`vy-${v}`} x1={M.izquierda} y1={py(v / 10)} x2={M.izquierda + CAJA.w} y2={py(v / 10)}
                    stroke="var(--border)" strokeWidth={v === 5 ? 1 : 0.5} strokeOpacity={v === 5 ? 0.9 : 0.45}
                    strokeDasharray={v === 5 ? '3 4' : undefined} />
                ))}
              </g>
              <rect x={M.izquierda} y={M.arriba} width={CAJA.w} height={CAJA.h}
                fill="none" stroke="var(--border)" strokeWidth="1" />

              {/* Cada esquina nombrada por los dos extremos que la forman. */}
              {CUADRANTES.map((q) => (
                <text key={q.clave}
                  x={M.izquierda + (q.ax === 0 ? 8 : CAJA.w - 8)}
                  y={M.arriba + (q.arriba ? 14 : CAJA.h - 8)}
                  fontSize={TIPO.cuadrante} textAnchor={q.anchor} fill="var(--soft)"
                  fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                  {q.texto}
                </text>
              ))}

              {/* Valores en los bordes, solo los que se están viendo. */}
              {UNIDADES.filter((v) => dentro(v) && (vista.escala > 1 || v % 5 === 0)).map((v) => (
                <text key={`tx-${v}`} x={px(v / 10)} y={M.arriba + CAJA.h + 15}
                  fontSize={TIPO.numero} textAnchor="middle" fill="var(--soft)" fontFamily="monospace">
                  {v}
                </text>
              ))}
              {UNIDADES.filter((v) => dentroY(v) && (vista.escala > 1 || v % 5 === 0)).map((v) => (
                <text key={`ty-${v}`} x={M.izquierda - 8} y={py(v / 10)}
                  fontSize={TIPO.numero} textAnchor="end" dominantBaseline="central"
                  fill="var(--soft)" fontFamily="monospace">
                  {valorY(v)}
                </text>
              ))}

              {/* Cada extremo pegado al SUYO: el del eje X en su punta del
                  borde de abajo, el del eje Y girado en su punta del borde
                  izquierdo. */}
              <text x={M.izquierda} y={M.arriba + CAJA.h + 32} fontSize={TIPO.extremo} fill="var(--muted)">
                {etiquetas.izquierda}
              </text>
              <text x={M.izquierda + CAJA.w} y={M.arriba + CAJA.h + 32} fontSize={TIPO.extremo}
                fill="var(--muted)" textAnchor="end">
                {etiquetas.derecha}
              </text>
              <text x={M.izquierda - 26} y={M.arriba + CAJA.h} fontSize={TIPO.extremo} fill="var(--muted)"
                textAnchor="start" transform={`rotate(-90 ${M.izquierda - 26} ${M.arriba + CAJA.h})`}>
                {etiquetas.abajo}
              </text>
              <text x={M.izquierda - 26} y={M.arriba} fontSize={TIPO.extremo} fill="var(--muted)"
                textAnchor="end" transform={`rotate(-90 ${M.izquierda - 26} ${M.arriba})`}>
                {etiquetas.arriba}
              </text>

              {/* El nombre del eje, SOLO en el archivo exportado: en pantalla
                  lo dicen los selectores de arriba y repetirlo sacaba las
                  mismas cuatro palabras tres veces. */}
              <text data-solo-export="1" opacity="0" x={M.izquierda + CAJA.w / 2} y={M.arriba + CAJA.h + 50}
                fontSize={TIPO.titulo} textAnchor="middle" fill="var(--soft)" fontFamily="monospace" letterSpacing="1">
                {tituloX.toUpperCase()}
              </text>
              <text data-solo-export="1" opacity="0" x={M.izquierda - 44} y={M.arriba + CAJA.h / 2}
                fontSize={TIPO.titulo} textAnchor="middle" fill="var(--soft)" fontFamily="monospace" letterSpacing="1"
                transform={`rotate(-90 ${M.izquierda - 44} ${M.arriba + CAJA.h / 2})`}>
                {tituloY.toUpperCase()}
              </text>

              <g clipPath="url(#area-mapa)">
                {/* El camino del cliente. Punteado fino y al 45% en vez de
                    una raya gruesa: es un propósito, no un dato medido, y
                    tiene que pesar menos que las marcas. Se recorta contra el
                    borde de los dos círculos para no cruzarlos por encima. */}
                {cliente.hoy && cliente.objetivo && (() => {
                  const x1 = px(cliente.hoy.x), y1 = py(cliente.hoy.y);
                  const x2 = px(cliente.objetivo.x), y2 = py(cliente.objetivo.y);
                  const largo = Math.hypot(x2 - x1, y2 - y1) || 1;
                  const ux = (x2 - x1) / largo, uy = (y2 - y1) / largo;
                  const margen = CLIENTE.diametro / 2 + 4;
                  return (
                    <line x1={x1 + ux * margen} y1={y1 + uy * margen}
                      x2={x2 - ux * margen} y2={y2 - uy * margen}
                      stroke="var(--cta)" strokeOpacity={0.45} strokeWidth="1"
                      strokeDasharray="2 4" strokeLinecap="round" />
                  );
                })()}

                {visibles.map((p) => {
                  const color = p.capa ? COLOR_CAPA[p.capa] : COLOR_SIN_CAPA;
                  const cx = px(p.x);
                  const cy = py(p.y);
                  const anillo = anilloDeScore(p.score ?? 0, diametro(p.capa), 2.5);
                  const hueco = radio(p) - 3.5;
                  const fuentes = fuentesDeLogo(p.dominio, p.logoUrl);
                  const logo = fuentes[logoIdx[p.dominio] ?? 0] ?? null;
                  const lado = hueco * 2 * AIRE_LOGO;
                  return (
                    <g key={p.dominio}
                      role="img"
                      aria-label={`${p.nombre}, score ${p.score ?? 'sin puntuación'}`}
                      onMouseEnter={(e) => {
                        // El <title> de SVG pintaba ADEMÁS el globo del
                        // navegador, con la misma información y con su propio
                        // retardo. Se quita y la posición se calcula respecto
                        // a la caja del mapa.
                        const caja = cajaRef.current?.getBoundingClientRect();
                        if (!caja) return;
                        setEncima({ p, x: e.clientX - caja.left, y: e.clientY - caja.top });
                      }}
                      onMouseMove={(e) => {
                        const caja = cajaRef.current?.getBoundingClientRect();
                        if (!caja) return;
                        setEncima((v) => (v?.p.dominio === p.dominio ? { p, x: e.clientX - caja.left, y: e.clientY - caja.top } : v));
                      }}
                      onMouseLeave={() => setEncima(null)}
                      style={{ cursor: 'pointer' }}>

                      {/* Fondo blanco: la mayoría de favicons dan por hecho
                          un lienzo claro y con transparencia se mezclarían
                          con la rejilla. */}
                      <circle cx={cx} cy={cy} r={hueco} fill="#fff" />
                      {!logoOk[p.dominio] && (
                        <text x={cx} y={cy} fontSize={Math.round(hueco * 0.95)} textAnchor="middle"
                          dominantBaseline="central" fill="var(--muted)" fontWeight="600"
                          style={{ pointerEvents: 'none' }}>
                          {iniciales(p.nombre)}
                        </text>
                      )}
                      {logo && (
                        // `meet` y no `slice`: recortando para llenar, un
                        // logotipo ancho salía ampliadísimo y uno cuadrado a
                        // tamaño real, y parecía que unas marcas eran más
                        // grandes que otras. Así todos caben enteros y se
                        // leen a la misma escala.
                        <image href={logo} x={cx - lado / 2} y={cy - lado / 2}
                          width={lado} height={lado} preserveAspectRatio="xMidYMid meet"
                          clipPath={`url(#${clipId(p.dominio)})`}
                          onLoad={() => setLogoOk((m) => (m[p.dominio] ? m : { ...m, [p.dominio]: true }))}
                          onError={() => setLogoIdx((m) => ({ ...m, [p.dominio]: (m[p.dominio] ?? 0) + 1 }))}
                          style={{ pointerEvents: 'none' }} />
                      )}

                      {/* El aro de fondo dice la CAPA y el arco dice el score.
                          Antes la capa iba en un punto suelto al borde que
                          parecía un aviso. */}
                      <circle cx={cx} cy={cy} r={anillo.radio} fill="none"
                        stroke={color} strokeOpacity={0.35} strokeWidth={anillo.grosor}
                        strokeDasharray={p.flojo ? '3 3' : undefined} />
                      {p.score != null && !p.flojo && (
                        <circle cx={cx} cy={cy} r={anillo.radio} fill="none"
                          stroke={anillo.color} strokeWidth={anillo.grosor}
                          strokeDasharray={`${anillo.relleno} ${anillo.circunferencia - anillo.relleno}`}
                          strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cy})`} />
                      )}
                    </g>
                  );
                })}

                {verEtiquetas && etiquetadas.map(({ punto: p, lx, ly, anchor }) => (
                  <text key={`t-${p.dominio}`} x={lx} y={ly} fontSize={TIPO.marca} textAnchor={anchor}
                    fill={p.flojo ? 'var(--soft)' : 'var(--text)'} style={{ pointerEvents: 'none' }}>
                    {p.nombre}
                  </text>
                ))}

                {/* El cliente, dibujado como cualquier otra marca: su logo
                    dentro y su anillo de score alrededor. Lo que lo distingue
                    es el tamaño y un aro exterior fino, no una forma aparte.
                    "Objetivo" es el mismo círculo en voz baja: sin anillo,
                    porque una posición deseada no tiene score que enseñar. */}
                {cliente.objetivo && (() => {
                  const cx = px(cliente.objetivo.x), cy = py(cliente.objetivo.y);
                  const fuentes = fuentesDeLogo(clienteDominio, clienteLogo);
                  const logo = fuentes[logoIdx['__cliente__'] ?? 0] ?? null;
                  const lado = CLIENTE.hueco * 2 * AIRE_LOGO;
                  return (
                    <g opacity={0.42}>
                      <circle cx={cx} cy={cy} r={CLIENTE.hueco} fill="#fff" />
                      {logo && (
                        <image href={logo} x={cx - lado / 2} y={cy - lado / 2} width={lado} height={lado}
                          preserveAspectRatio="xMidYMid meet" clipPath="url(#logo-objetivo)"
                          style={{ pointerEvents: 'none' }} />
                      )}
                      <circle cx={cx} cy={cy} r={CLIENTE.diametro / 2 - 1} fill="none"
                        stroke="var(--cta)" strokeWidth="1" strokeDasharray="2 3" />
                      {verEtiquetas && (
                        <text x={cx} y={cy - CLIENTE.diametro / 2 - 5} fontSize={TIPO.marca}
                          textAnchor="middle" fill="var(--cta)">
                          objetivo
                        </text>
                      )}
                    </g>
                  );
                })()}

                {cliente.hoy && (() => {
                  const cx = px(cliente.hoy.x), cy = py(cliente.hoy.y);
                  const a = clienteScore != null ? anilloDeScore(clienteScore, CLIENTE.diametro, 2.5) : null;
                  const fuentes = fuentesDeLogo(clienteDominio, clienteLogo);
                  const logo = fuentes[logoIdx['__cliente__'] ?? 0] ?? null;
                  const lado = CLIENTE.hueco * 2 * AIRE_LOGO;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={CLIENTE.hueco} fill="#fff" />
                      {logo && (
                        <image href={logo} x={cx - lado / 2} y={cy - lado / 2} width={lado} height={lado}
                          preserveAspectRatio="xMidYMid meet" clipPath="url(#logo-cliente)"
                          onError={() => setLogoIdx((m) => ({ ...m, __cliente__: (m.__cliente__ ?? 0) + 1 }))}
                          style={{ pointerEvents: 'none' }} />
                      )}
                      {a && (
                        <>
                          <circle cx={cx} cy={cy} r={a.radio} fill="none" stroke="var(--cta)" strokeOpacity={0.3} strokeWidth={a.grosor} />
                          <circle cx={cx} cy={cy} r={a.radio} fill="none" stroke={a.color} strokeWidth={a.grosor}
                            strokeDasharray={`${a.relleno} ${a.circunferencia - a.relleno}`}
                            strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cy})`} />
                        </>
                      )}
                      {/* El aro exterior: lo único que lo separa del resto. */}
                      <circle cx={cx} cy={cy} r={CLIENTE.diametro / 2 + 3} fill="none"
                        stroke="var(--cta)" strokeOpacity={0.55} strokeWidth="1" />
                      {verEtiquetas && (
                        <text x={cx} y={cy - CLIENTE.diametro / 2 - 8} fontSize={TIPO.marca}
                          textAnchor="middle" fill="var(--cta)" fontWeight="600">
                          {clienteNombre}
                        </text>
                      )}
                    </g>
                  );
                })()}
              </g>
            </svg>

            {/* La tarjeta, junto al punto. Se voltea cerca de los bordes para
                no salirse de la caja, y no captura el ratón: si lo hiciera,
                aparecer debajo del cursor la haría parpadear. */}
            {encima && (
              <div
                className="pointer-events-none absolute z-20 w-60 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs shadow-lg"
                style={{
                  left: encima.x > (cajaRef.current?.clientWidth ?? 0) - 260 ? encima.x - 250 : encima.x + 14,
                  top: encima.y > (cajaRef.current?.clientHeight ?? 0) - 130 ? encima.y - 120 : encima.y + 14,
                }}
              >
                <p className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate font-medium">{encima.p.nombre}</span>
                  {encima.p.score != null && (
                    <span className="ml-auto shrink-0 font-mono" style={{ color: anilloDeScore(encima.p.score, 10).color }}>
                      {encima.p.score}
                    </span>
                  )}
                </p>
                <p className="font-mono text-[10px] text-[var(--soft)]">{encima.p.dominio}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {encima.p.capa && (
                    <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR_CAPA[encima.p.capa] }} />
                      {CAPA_LABEL[encima.p.capa]}
                    </span>
                  )}
                  {encima.p.rol && (
                    <span className="rounded border border-[var(--cta)]/40 px-1.5 py-0.5 text-[10px] text-[var(--cta)]">
                      {encima.p.rol}
                    </span>
                  )}
                  {marcas[encima.p.dominio]?.priority && (
                    <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {PRIORIDAD_LABEL[marcas[encima.p.dominio]!.priority!]}
                    </span>
                  )}
                </p>
                {/* Dónde está en los ejes que se están cruzando. Es la razón
                    de que el punto esté ahí y no en otro sitio. */}
                {esEstrategico && x && y && (
                  <p className="mt-1.5 font-mono text-[10px] text-[var(--muted)]">
                    {x.label_left}–{x.label_right}: {marcas[encima.p.dominio]?.axis_scores?.[x.axis_id] ?? '—'}
                    {' · '}
                    {y.label_left}–{y.label_right}: {marcas[encima.p.dominio]?.axis_scores?.[y.axis_id] ?? '—'}
                  </p>
                )}
                {encima.p.nota && (
                  <p className="mt-1.5 leading-relaxed text-[var(--muted)]">{encima.p.nota}</p>
                )}
                {encima.p.motivoFlojo && (
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--soft)]">{encima.p.motivoFlojo}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sin leyenda de colores: la clave de capas vive ahora dentro de su
            propio filtro. Aquí queda solo lo que ningún control explica. */}
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--soft)]">
          El aro dice de qué tipo es la marca y el arco, su score. {clienteNombre} lleva un aro
          exterior, y el punteado va hasta dónde quiere estar.
          {verEtiquetas && sinSitio > 0 && ` · ${sinSitio} ${sinSitio === 1 ? 'nombre oculto' : 'nombres ocultos'} por falta de sitio: pasa por encima o acerca el mapa.`}
          {flojas > 0 && ` · ${flojas} ${flojas === 1 ? 'marca con aro discontinuo' : 'marcas con aro discontinuo'}: lectura insuficiente, no cuentan para leer el cuadrante.`}
        </p>

      </div>
    </section>
  );
}
