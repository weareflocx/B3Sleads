'use client';

import { useMemo, useRef, useState } from 'react';
import { Select } from '../../select';
import { anilloDeScore } from '../../score-ring';
import { useEstudio } from './estudio-estado';
import { CAPA_LABEL, type Capa } from '@/lib/battle-cards';

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
  // Logo pegado a mano, si lo hay. Manda sobre las fuentes automáticas.
  logoUrl?: string | null;
  // Las diez del Scanner en porcentaje, para las barras del panel.
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

// 16:10, para que el SVG exportado salga a 1600x1000 exactos sin deformar
// nada. La spec pide ese tamaño y estirar un dibujo para cuadrarlo mueve
// todos los puntos de sitio.
const W = 800;
const H = 500;
// Los márgenes crecen abajo y a la izquierda: ahí van los números, los
// extremos de cada eje y el nombre del eje, en tres alturas distintas. Antes
// los extremos del eje Y y los del X caían los dos en la esquina inferior
// izquierda, uno encima de otro, y no se sabía cuál era de qué eje.
const M = { arriba: 30, derecha: 30, abajo: 62, izquierda: 62 };
const CAJA = { w: W - M.izquierda - M.derecha, h: H - M.arriba - M.abajo };

// El tamaño dice la CAPA, no el score. Antes el radio codificaba el score y
// eso obligaba a comparar áreas para leer un número; ahora el score es el
// arco del anillo, que se lee de un vistazo, y el tamaño queda libre para
// decir de qué tipo de marca estamos hablando.
const DIAMETRO_CAPA: Record<Capa, number> = {
  competitive: 38,
  register: 30,
  anti_reference: 26,
};
const DIAMETRO_SIN_CAPA = 28;

// Las once líneas de la rejilla. La del 5 se dibuja distinta: es la que
// parte los cuadrantes.
const UNIDADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function diametro(capa: Capa | null): number {
  return capa ? DIAMETRO_CAPA[capa] : DIAMETRO_SIN_CAPA;
}
function radio(p: { capa: Capa | null }): number {
  return diametro(p.capa) / 2;
}

// Las mismas fuentes y el mismo orden que CompanyLogo. Repetirlas aquí es
// deliberado: aquel es un componente de React con <img>, y dentro de un SVG
// que además hay que exportar hace falta <image>. Lo que se comparte es el
// criterio, no el marcado.
function fuentesDeLogo(dominio: string, manual?: string | null): string[] {
  return [
    manual?.trim() || null,
    `https://icons.duckduckgo.com/ip3/${dominio}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain=${dominio}`,
  ].filter(Boolean) as string[];
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

// Un identificador de clip válido y estable por marca.
const clipId = (dominio: string) => `logo-${dominio.replace(/[^a-z0-9]/gi, '-')}`;

// Exporta el mapa que se está viendo como SVG para Figma.
//
// El SVG de la página usa variables CSS (var(--cta), var(--border)…), que
// fuera del documento no existen: el archivo llegaría a Figma con todo en
// negro. Así que se clona el dibujo y se sustituye cada color por el valor
// ya calculado por el navegador. Sin rasterizar, sin librería y sin fondo.
function descargarSvg(svg: SVGSVGElement, nombre: string) {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  const origen = svg.querySelectorAll('*');
  const destino = copia.querySelectorAll('*');

  const PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray',
    'font-size', 'font-weight', 'text-anchor',
  ] as const;

  for (let i = 0; i < origen.length; i++) {
    const calculado = getComputedStyle(origen[i]);
    const el = destino[i] as SVGElement;
    for (const prop of PROPS) {
      const v = calculado.getPropertyValue(prop);
      if (v && v !== 'none' && !v.includes('var(')) el.setAttribute(prop, v.trim());
      else if (v === 'none') el.setAttribute(prop, 'none');
    }
    // La fuente se deja por nombre, no en trazos: en Figma el texto sigue
    // siendo texto y se puede corregir. Si no está Geist, Figma avisa y
    // sustituye, que es preferible a una curva que nadie puede editar.
    if (el.tagName === 'text') el.setAttribute('font-family', 'Geist, Inter, Helvetica, Arial, sans-serif');
    el.removeAttribute('style');
    el.removeAttribute('class');
  }

  // Lo que solo tiene sentido fuera de la app: el nombre de cada eje. Dentro
  // lo dicen los selectores; en el archivo no hay selectores.
  for (const el of copia.querySelectorAll('[data-solo-export]')) {
    el.setAttribute('opacity', '1');
    el.removeAttribute('data-solo-export');
  }

  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // La spec pide 1600x1000 y el lienzo es 16:10, así que cuadra sin estirar.
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
}: {
  // Los puntos de madurez llegan calculados del servidor: salen del scan y
  // no cambian al teclear. Los del mapa estratégico se derivan aquí, del
  // estado del cliente, para que puntuar mueva el punto sin recargar.
  madurez: PuntoMapa[];
  clienteMadurez: { x: number; y: number } | null;
  clienteNombre: string;
  clienteScore: number | null;
}) {
  const { ejes, posiciones, marcas } = useEstudio();
  const [tipo, setTipo] = useState<'estrategico' | 'madurez'>(
    ejes.length >= 2 ? 'estrategico' : 'madurez',
  );
  const [ejeX, setEjeX] = useState(ejes[0]?.axis_id ?? '');
  const [ejeY, setEjeY] = useState(ejes[1]?.axis_id ?? '');
  const [verEtiquetas, setVerEtiquetas] = useState(true);
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [encima, setEncima] = useState<PuntoMapa | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Índice de la fuente de logo que se está probando por marca. Sube al
  // fallar una y se queda ahí; agotadas, mandan las iniciales.
  const [logoFallido, setLogoFallido] = useState<Record<string, number>>({});

  const x = ejes.find((e) => e.axis_id === ejeX) ?? ejes[0];
  const y = ejes.find((e) => e.axis_id === ejeY) ?? ejes[1];

  // Los puntos del mapa estratégico salen del estado del cliente, así que
  // teclear una puntuación mueve el punto sin recargar.
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

  const esEstrategico = tipo === 'estrategico';
  const base = esEstrategico ? estrategicos : madurez;
  const visibles = base.filter(
    (p) => verDescartadas || marcas[p.dominio]?.priority !== 'out',
  );

  const etiquetas = {
    izquierda: esEstrategico ? (x?.label_left ?? '') : 'Funcional',
    derecha: esEstrategico ? (x?.label_right ?? '') : 'Significado',
    abajo: esEstrategico ? (y?.label_left ?? '') : 'Score bajo',
    arriba: esEstrategico ? (y?.label_right ?? '') : 'Score alto',
  };

  const tituloX = `${etiquetas.izquierda} → ${etiquetas.derecha}`;
  const tituloY = `${etiquetas.abajo} → ${etiquetas.arriba}`;

  // En el mapa de madurez el eje vertical NO es un 0-10: es el Brand3 Score.
  // Poner ahí un 5 sería mentir sobre la escala.
  const marcas0510 = [0, 5, 10].map((v) => ({
    v,
    x: String(v),
    y: esEstrategico ? String(v) : String(v * 10),
  }));

  // Cada esquina, nombrada por los dos extremos que la forman. Es la lectura
  // que antes había que reconstruir mirando los cuatro bordes.
  const CUADRANTES = [
    { clave: 'ai', ax: 0, ay: 1, anchor: 'start' as const, arriba: true, texto: `${etiquetas.izquierda} · ${etiquetas.arriba}` },
    { clave: 'ad', ax: 1, ay: 1, anchor: 'end' as const, arriba: true, texto: `${etiquetas.derecha} · ${etiquetas.arriba}` },
    { clave: 'bi', ax: 0, ay: 0, anchor: 'start' as const, arriba: false, texto: `${etiquetas.izquierda} · ${etiquetas.abajo}` },
    { clave: 'bd', ax: 1, ay: 0, anchor: 'end' as const, arriba: false, texto: `${etiquetas.derecha} · ${etiquetas.abajo}` },
  ];

  const px = (v: number) => M.izquierda + v * CAJA.w;
  const py = (v: number) => M.arriba + (1 - v) * CAJA.h;

  // Reparto de etiquetas.
  //
  // Los puntos NO se mueven: correr un punto para que quepa su nombre es
  // mentir sobre su posición, y la posición es lo único que este dibujo
  // afirma. Lo que se reparte son las etiquetas, probando cuatro huecos
  // alrededor del punto y quedándose con el primero libre.
  //
  // Cuando no queda ninguno, la etiqueta NO se pinta. Con treinta y cinco
  // marcas apiñadas en el centro, encajarlas todas significa superponer
  // texto, que es peor que no ponerlo: el nombre sigue estando al pasar el
  // ratón, y abajo se dice cuántas se quedaron sin sitio.
  const { etiquetadas, sinSitio } = useMemo(() => {
    // Las de más score eligen antes: si algo se queda sin nombre, que sea lo
    // que menos pesa en la lectura.
    const ordenados = [...visibles].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const ocupado: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const choca = (r: (typeof ocupado)[number]) =>
      ocupado.some((o) => !(r.x2 < o.x1 || r.x1 > o.x2 || r.y2 < o.y1 || r.y1 > o.y2));

    // Los puntos entran como obstáculo antes que ninguna etiqueta: un nombre
    // encima de otra marca se lee como si fuera suyo, que es peor que no
    // verlo. Reservar el círculo entero es lo que evita esa confusión.
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
      // Ancho estimado del texto. Medirlo de verdad exigiría pintarlo antes,
      // y a 11px de una sans el carácter medio anda por 6,3 contando
      // mayúsculas. Los 6 de más son aire: dos etiquetas que se rozan se leen
      // como una sola palabra larga.
      const ancho = p.nombre.length * 6.3 + 6;
      const alto = 14;
      const candidatos = [
        { lx: cx, ly: cy - r - 6, anchor: 'middle' as const, x1: cx - ancho / 2, y1: cy - r - 6 - alto },
        { lx: cx, ly: cy + r + 13, anchor: 'middle' as const, x1: cx - ancho / 2, y1: cy + r + 3 },
        { lx: cx + r + 5, ly: cy + 4, anchor: 'start' as const, x1: cx + r + 5, y1: cy - 5 },
        { lx: cx - r - 5, ly: cy + 4, anchor: 'end' as const, x1: cx - r - 5 - ancho, y1: cy - 5 },
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
  }, [visibles]);

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

  return (
    <section className="mt-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={tipo}
            onChange={(v) => setTipo(v as typeof tipo)}
            align="left"
            ariaLabel="Tipo de mapa"
            options={[
              { value: 'estrategico', label: 'Mapa estratégico' },
              { value: 'madurez', label: 'Mapa de madurez' },
            ]}
          />
          {esEstrategico && ejes.length >= 2 && (
            <>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                X
              </span>
              <Select value={x?.axis_id ?? ''} onChange={setEjeX} align="left" ariaLabel="Eje horizontal"
                options={ejes.map((e) => ({ value: e.axis_id, label: `${e.label_left} → ${e.label_right}` }))} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                Y
              </span>
              <Select value={y?.axis_id ?? ''} onChange={setEjeY} align="left" ariaLabel="Eje vertical"
                options={ejes.map((e) => ({ value: e.axis_id, label: `${e.label_left} → ${e.label_right}` }))} />
            </>
          )}
          <span className="ml-auto flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={verEtiquetas} onChange={(e) => setVerEtiquetas(e.target.checked)} />
              etiquetas
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={verDescartadas} onChange={(e) => setVerDescartadas(e.target.checked)} />
              descartadas
            </label>
            <button
              onClick={() =>
                svgRef.current &&
                descargarSvg(
                  svgRef.current,
                  `mapa-${esEstrategico ? 'estrategico' : 'madurez'}-${clienteNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                )
              }
              disabled={visibles.length === 0}
              title="Descarga el mapa tal y como se ve, para abrirlo en Figma"
              className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
            >
              svg
            </button>
          </span>
        </div>

        {esEstrategico && ejes.length < 2 ? (
          <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            El mapa estratégico cruza dos ejes. Define al menos dos en la sección de arriba y
            puntúa las marcas que quieras situar.
          </p>
        ) : visibles.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            {esEstrategico
              ? 'Ninguna marca puntuada todavía en esos dos ejes.'
              : 'Ninguna marca con scan publicable.'}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ minWidth: 560 }}
              role="img"
              aria-label={esEstrategico ? 'Mapa estratégico' : 'Mapa de madurez'}
            >
              {/* Rejilla cada unidad. Sin ella, "Herbalife está en el 2" es un
                  dato que hay que creerse; con ella se cuenta. Las líneas del
                  5 van más marcadas porque son las que parten los cuadrantes:
                  son la lectura, no una división más. */}
              {UNIDADES.map((v) => (
                <line key={`vx-${v}`} x1={px(v / 10)} y1={M.arriba} x2={px(v / 10)} y2={M.arriba + CAJA.h}
                  stroke="var(--border)" strokeWidth={v === 5 ? 1 : 0.5}
                  strokeOpacity={v === 5 ? 1 : 0.5}
                  strokeDasharray={v === 5 ? '3 4' : undefined} />
              ))}
              {UNIDADES.map((v) => (
                <line key={`vy-${v}`} x1={M.izquierda} y1={py(v / 10)} x2={M.izquierda + CAJA.w} y2={py(v / 10)}
                  stroke="var(--border)" strokeWidth={v === 5 ? 1 : 0.5}
                  strokeOpacity={v === 5 ? 1 : 0.5}
                  strokeDasharray={v === 5 ? '3 4' : undefined} />
              ))}
              <rect x={M.izquierda} y={M.arriba} width={CAJA.w} height={CAJA.h}
                fill="none" stroke="var(--border)" strokeWidth="1" />

              {/* Los cuadrantes, dichos en voz baja dentro de su esquina. El
                  cuadrante vacío es el argumento del estudio, y hasta ahora
                  había que deducir de qué cuadrante se hablaba. */}
              {CUADRANTES.map((q) => (
                <text key={q.clave}
                  x={px(q.ax) + (q.anchor === 'start' ? 8 : -8)}
                  y={py(q.ay) + (q.arriba ? 16 : -10)}
                  fontSize="9" textAnchor={q.anchor} fill="var(--soft)"
                  fontFamily="monospace" letterSpacing="0.5"
                  style={{ pointerEvents: 'none' }}>
                  {q.texto}
                </text>
              ))}

              {/* Valores. Solo 0, mitad y tope: una escala se entiende con
                  tres números y se ensucia con once. */}
              {marcas0510.map((t) => (
                <text key={`tx-${t.v}`} x={px(t.v / 10)} y={M.arriba + CAJA.h + 15}
                  fontSize="10" textAnchor="middle" fill="var(--soft)" fontFamily="monospace">
                  {t.x}
                </text>
              ))}
              {marcas0510.map((t) => (
                <text key={`ty-${t.v}`} x={M.izquierda - 8} y={py(t.v / 10)}
                  fontSize="10" textAnchor="end" dominantBaseline="central"
                  fill="var(--soft)" fontFamily="monospace">
                  {t.y}
                </text>
              ))}

              {/* Cada extremo pegado al SUYO: el del eje X en su punta del
                  borde de abajo, el del eje Y girado en su punta del borde
                  izquierdo. Es lo que evita que "Habla de red" y "Modelo
                  oculto" acaben uno encima del otro en la misma esquina. */}
              <text x={M.izquierda} y={M.arriba + CAJA.h + 31} fontSize="11" fill="var(--muted)">
                {etiquetas.izquierda}
              </text>
              <text x={M.izquierda + CAJA.w} y={M.arriba + CAJA.h + 31} fontSize="11"
                fill="var(--muted)" textAnchor="end">
                {etiquetas.derecha}
              </text>
              <text x={M.izquierda - 26} y={M.arriba + CAJA.h} fontSize="11" fill="var(--muted)"
                textAnchor="start" transform={`rotate(-90 ${M.izquierda - 26} ${M.arriba + CAJA.h})`}>
                {etiquetas.abajo}
              </text>
              <text x={M.izquierda - 26} y={M.arriba} fontSize="11" fill="var(--muted)"
                textAnchor="end" transform={`rotate(-90 ${M.izquierda - 26} ${M.arriba})`}>
                {etiquetas.arriba}
              </text>

              {/* El nombre del eje, SOLO en el archivo exportado.
                  En pantalla sobra: los selectores de arriba ya dicen qué eje
                  es cada uno, y con los extremos pegados y las esquinas
                  nombradas las mismas cuatro palabras salían tres veces.
                  Fuera de la app no hay selectores, y sin esto el mapa llega
                  a Figma sin decir qué mide. Se dibuja invisible y el
                  exportador lo enciende al clonar. */}
              <text data-solo-export="1" opacity="0"
                x={M.izquierda + CAJA.w / 2} y={M.arriba + CAJA.h + 50} fontSize="9"
                textAnchor="middle" fill="var(--soft)" fontFamily="monospace" letterSpacing="1">
                {tituloX.toUpperCase()}
              </text>
              <text data-solo-export="1" opacity="0"
                x={M.izquierda - 44} y={M.arriba + CAJA.h / 2} fontSize="9"
                textAnchor="middle" fill="var(--soft)" fontFamily="monospace" letterSpacing="1"
                transform={`rotate(-90 ${M.izquierda - 44} ${M.arriba + CAJA.h / 2})`}>
                {tituloY.toUpperCase()}
              </text>

              {/* El camino del cliente: de donde está a donde quiere ir. */}
              {cliente.hoy && cliente.objetivo && (
                <line x1={px(cliente.hoy.x)} y1={py(cliente.hoy.y)}
                  x2={px(cliente.objetivo.x)} y2={py(cliente.objetivo.y)}
                  stroke="var(--cta)" strokeWidth="1.5" strokeDasharray="5 4" />
              )}

              {/* Las marcas: logo dentro, anillo de score alrededor. El anillo
                  es el MISMO que el de las listas, geometría incluida, así que
                  el arco significa lo mismo en las dos pantallas. */}
              <defs>
                {visibles.map((p) => (
                  <clipPath key={p.dominio} id={clipId(p.dominio)}>
                    <circle cx={px(p.x)} cy={py(p.y)} r={radio(p) - 5} />
                  </clipPath>
                ))}
              </defs>

              {visibles.map((p) => {
                const color = p.capa ? COLOR_CAPA[p.capa] : COLOR_SIN_CAPA;
                const cx = px(p.x);
                const cy = py(p.y);
                const d = diametro(p.capa);
                const anillo = anilloDeScore(p.score ?? 0, d, 3);
                const hueco = d / 2 - 5;
                const fuentes = fuentesDeLogo(p.dominio, p.logoUrl);
                const idx = logoFallido[p.dominio] ?? 0;
                const logo = fuentes[idx] ?? null;
                return (
                  <g key={p.dominio}
                    onMouseEnter={() => setEncima(p)}
                    onMouseLeave={() => setEncima(null)}
                    style={{ cursor: 'pointer' }}>
                    <title>{`${p.nombre} · ${p.score ?? '—'}/100`}</title>

                    {/* Fondo del hueco: sin él, el logo se mezcla con la
                        rejilla y con los puntos que tenga debajo. */}
                    <circle cx={cx} cy={cy} r={hueco} fill="var(--surface)" />

                    {/* Iniciales SIEMPRE debajo, como en CompanyLogo: si la
                        imagen no llega nunca se ve un hueco roto. */}
                    <text x={cx} y={cy} fontSize={Math.round(hueco * 0.9)} textAnchor="middle"
                      dominantBaseline="central" fill="var(--muted)" fontWeight="600"
                      style={{ pointerEvents: 'none' }}>
                      {iniciales(p.nombre)}
                    </text>
                    {logo && (
                      <image href={logo} x={cx - hueco} y={cy - hueco}
                        width={hueco * 2} height={hueco * 2}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#${clipId(p.dominio)})`}
                        // Misma cascada que en las listas: si una fuente falla
                        // se prueba la siguiente y, agotadas, quedan las
                        // iniciales.
                        onError={() =>
                          setLogoFallido((m) => ({ ...m, [p.dominio]: (m[p.dominio] ?? 0) + 1 }))
                        }
                        style={{ pointerEvents: 'none' }} />
                    )}

                    {/* El aro de fondo y el arco del score. Una marca sin
                        lectura suficiente lleva el aro discontinuo y sin arco:
                        el hueco es el mensaje. */}
                    <circle cx={cx} cy={cy} r={anillo.radio} fill="none"
                      stroke="var(--border)" strokeWidth={anillo.grosor}
                      strokeDasharray={p.flojo ? '3 3' : undefined} />
                    {p.score != null && !p.flojo && (
                      <circle cx={cx} cy={cy} r={anillo.radio} fill="none"
                        stroke={anillo.color} strokeWidth={anillo.grosor}
                        strokeDasharray={`${anillo.relleno} ${anillo.circunferencia - anillo.relleno}`}
                        strokeLinecap="butt"
                        transform={`rotate(-90 ${cx} ${cy})`} />
                    )}
                    {/* La capa se dice con un punto pequeño al borde: el color
                        del anillo ya está ocupado por el score. */}
                    <circle cx={cx + anillo.radio * 0.72} cy={cy - anillo.radio * 0.72} r={3.5}
                      fill={color} stroke="var(--surface)" strokeWidth="1.5" />
                  </g>
                );
              })}

              {verEtiquetas &&
                etiquetadas.map(({ punto: p, lx, ly, anchor }) => (
                  <text key={`t-${p.dominio}`} x={lx} y={ly}
                    fontSize="11" textAnchor={anchor}
                    fill={p.flojo ? 'var(--soft)' : 'var(--text)'}
                    style={{ pointerEvents: 'none' }}>
                    {p.nombre}
                  </text>
                ))}

              {/* El cliente en rombo: no es una marca más del estudio, y la
                  forma lo dice antes que cualquier leyenda. "Hoy" lleva su
                  anillo de score real, porque es una marca medida como las
                  demás; "objetivo" no lleva ninguno, porque una posición
                  deseada no tiene score que enseñar. */}
              {cliente.hoy && (() => {
                const cx = px(cliente.hoy.x);
                const cy = py(cliente.hoy.y);
                const a = clienteScore != null ? anilloDeScore(clienteScore, 40, 3) : null;
                return (
                  <g>
                    {a && (
                      <>
                        <circle cx={cx} cy={cy} r={a.radio} fill="none" stroke="var(--border)" strokeWidth={a.grosor} />
                        <circle cx={cx} cy={cy} r={a.radio} fill="none" stroke={a.color} strokeWidth={a.grosor}
                          strokeDasharray={`${a.relleno} ${a.circunferencia - a.relleno}`}
                          strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cy})`} />
                      </>
                    )}
                    <rect x={cx - 9} y={cy - 9} width="18" height="18"
                      transform={`rotate(45 ${cx} ${cy})`} fill="var(--cta)" />
                    {verEtiquetas && (
                      <text x={cx} y={cy - (a ? a.radio + 8 : 18)} fontSize="11"
                        textAnchor="middle" fill="var(--cta)" fontWeight="600">
                        {clienteNombre}
                      </text>
                    )}
                  </g>
                );
              })()}
              {cliente.objetivo && (
                <g>
                  <rect x={px(cliente.objetivo.x) - 9} y={py(cliente.objetivo.y) - 9} width="18" height="18"
                    transform={`rotate(45 ${px(cliente.objetivo.x)} ${py(cliente.objetivo.y)})`}
                    fill="none" stroke="var(--cta)" strokeWidth="1.5" strokeDasharray="4 3" />
                  {verEtiquetas && (
                    <text x={px(cliente.objetivo.x)} y={py(cliente.objetivo.y) - 18} fontSize="11"
                      textAnchor="middle" fill="var(--cta)">
                      objetivo
                    </text>
                  )}
                </g>
              )}
            </svg>
          </div>
        )}

        {/* Leyenda y lo que el mapa NO está diciendo. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
          {(['competitive', 'register', 'anti_reference'] as Capa[]).map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_CAPA[c] }} />
              {CAPA_LABEL[c]}
            </span>
          ))}
          <span className="text-[var(--soft)]">· el tamaño es el score</span>
          {verEtiquetas && sinSitio > 0 && (
            <span className="text-[var(--soft)]">
              · {sinSitio} sin etiqueta por falta de sitio, el nombre sale al pasar por encima
            </span>
          )}
          {flojas > 0 && (
            <span className="text-[var(--soft)]">
              · {flojas} {flojas === 1 ? 'marca hueca' : 'marcas huecas'}: lectura insuficiente, no
              cuentan para leer el cuadrante
            </span>
          )}
        </div>

        {encima && (
          <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
            <span className="font-medium">{encima.nombre}</span>
            <span className="ml-2 font-mono text-[var(--soft)]">{encima.dominio}</span>
            {encima.score != null && <span className="ml-2 font-mono">{encima.score}/100</span>}
            {encima.rol && <span className="ml-2 text-[var(--cta)]">{encima.rol}</span>}
            {encima.motivoFlojo && (
              <span className="ml-2 text-[var(--soft)]">· {encima.motivoFlojo}</span>
            )}
            {encima.nota && <p className="mt-1 text-[var(--muted)]">{encima.nota}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

