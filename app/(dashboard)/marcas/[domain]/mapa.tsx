'use client';

import { useMemo, useState } from 'react';
import { Select } from '../../select';
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

const W = 720;
const H = 520;
const M = { arriba: 34, derecha: 30, abajo: 40, izquierda: 34 };
const CAJA = { w: W - M.izquierda - M.derecha, h: H - M.arriba - M.abajo };

// El radio dice el score, pero nunca desaparece: una marca con 16 sigue
// siendo una marca del estudio y tiene que poder señalarse.
function radio(score: number | null): number {
  if (score == null) return 5;
  return 5 + (Math.min(100, Math.max(0, score)) / 100) * 8;
}

export function Mapa({
  madurez,
  clienteMadurez,
  clienteNombre,
}: {
  // Los puntos de madurez llegan calculados del servidor: salen del scan y
  // no cambian al teclear. Los del mapa estratégico se derivan aquí, del
  // estado del cliente, para que puntuar mueva el punto sin recargar.
  madurez: PuntoMapa[];
  clienteMadurez: { x: number; y: number } | null;
  clienteNombre: string;
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
      const r = radio(p.score) + 2;
      ocupado.push({ x1: px(p.x) - r, y1: py(p.y) - r, x2: px(p.x) + r, y2: py(p.y) + r });
    }

    const out: { punto: PuntoMapa; lx: number; ly: number; anchor: 'middle' | 'start' | 'end' }[] = [];
    let perdidas = 0;

    for (const p of ordenados) {
      const cx = px(p.x);
      const cy = py(p.y);
      const r = radio(p.score);
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
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ minWidth: 560 }}
              role="img"
              aria-label={esEstrategico ? 'Mapa estratégico' : 'Mapa de madurez'}
            >
              {/* Los cuatro cuadrantes. La cruz central es lo que convierte
                  una nube de puntos en una lectura. */}
              <rect x={M.izquierda} y={M.arriba} width={CAJA.w} height={CAJA.h}
                fill="none" stroke="var(--border)" strokeWidth="1" />
              <line x1={M.izquierda + CAJA.w / 2} y1={M.arriba} x2={M.izquierda + CAJA.w / 2} y2={M.arriba + CAJA.h}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
              <line x1={M.izquierda} y1={M.arriba + CAJA.h / 2} x2={M.izquierda + CAJA.w} y2={M.arriba + CAJA.h / 2}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />

              {/* Los extremos, en los cuatro bordes. */}
              <text x={M.izquierda} y={M.arriba + CAJA.h + 26} fontSize="11" fill="var(--muted)" fontFamily="monospace">
                {etiquetas.izquierda}
              </text>
              <text x={M.izquierda + CAJA.w} y={M.arriba + CAJA.h + 26} fontSize="11" fill="var(--muted)"
                fontFamily="monospace" textAnchor="end">
                {etiquetas.derecha}
              </text>
              <text x={M.izquierda} y={M.arriba - 14} fontSize="11" fill="var(--muted)" fontFamily="monospace">
                {etiquetas.arriba}
              </text>
              <text x={M.izquierda} y={M.arriba + CAJA.h + 12} fontSize="11" fill="var(--soft)" fontFamily="monospace">
                {etiquetas.abajo}
              </text>

              {/* El camino del cliente: de donde está a donde quiere ir. */}
              {cliente.hoy && cliente.objetivo && (
                <line x1={px(cliente.hoy.x)} y1={py(cliente.hoy.y)}
                  x2={px(cliente.objetivo.x)} y2={py(cliente.objetivo.y)}
                  stroke="var(--cta)" strokeWidth="1.5" strokeDasharray="5 4" />
              )}

              {visibles.map((p) => {
                const color = p.capa ? COLOR_CAPA[p.capa] : COLOR_SIN_CAPA;
                return (
                  <circle key={p.dominio}
                    cx={px(p.x)} cy={py(p.y)} r={radio(p.score)}
                    fill={p.flojo ? 'none' : color}
                    fillOpacity={p.flojo ? 0 : 0.85}
                    stroke={color}
                    strokeWidth={p.flojo ? 1.5 : 0}
                    strokeDasharray={p.flojo ? '3 3' : undefined}
                    onMouseEnter={() => setEncima(p)}
                    onMouseLeave={() => setEncima(null)}
                    style={{ cursor: 'pointer' }}>
                    <title>{`${p.nombre} · ${p.score ?? '—'}/100`}</title>
                  </circle>
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

              {/* El cliente en rombo: no es una marca más del estudio. */}
              {cliente.hoy && (
                <g>
                  <rect x={px(cliente.hoy.x) - 8} y={py(cliente.hoy.y) - 8} width="16" height="16"
                    transform={`rotate(45 ${px(cliente.hoy.x)} ${py(cliente.hoy.y)})`}
                    fill="var(--cta)" />
                  {verEtiquetas && (
                    <text x={px(cliente.hoy.x)} y={py(cliente.hoy.y) - 16} fontSize="11"
                      textAnchor="middle" fill="var(--cta)" fontWeight="600">
                      {clienteNombre}
                    </text>
                  )}
                </g>
              )}
              {cliente.objetivo && (
                <g>
                  <rect x={px(cliente.objetivo.x) - 8} y={py(cliente.objetivo.y) - 8} width="16" height="16"
                    transform={`rotate(45 ${px(cliente.objetivo.x)} ${py(cliente.objetivo.y)})`}
                    fill="none" stroke="var(--cta)" strokeWidth="1.5" />
                  {verEtiquetas && (
                    <text x={px(cliente.objetivo.x)} y={py(cliente.objetivo.y) - 16} fontSize="11"
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

