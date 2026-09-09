'use client';

import { useMemo } from 'react';
import type { FilaDimension } from '@/lib/dimensiones';

// El decágono de las diez dimensiones. Una línea por grupo y otra por el
// cliente.
//
// La tabla dice los números; esto dice la FORMA. Un grupo que puntúa parejo
// en todo y otro que se dispara en dos componentes pueden tener la misma
// media y son categorías distintas, y eso solo se ve de un vistazo aquí.
//
// A mano en SVG, como el resto de lo visual de la casa.

export interface LineaRadar {
  clave: string;
  nombre: string;
  color: string;
  // 0..1 por dimensión, en el orden de `filas`. null es un hueco: la línea se
  // corta y no se inventa un punto.
  valores: (number | null)[];
  grueso?: boolean;
}

const TAM = 340;
const CENTRO = TAM / 2;
const RADIO = TAM / 2 - 54;
const ANILLOS = [0.25, 0.5, 0.75, 1];

export function Radar({ filas, lineas }: { filas: FilaDimension[]; lineas: LineaRadar[] }) {
  const n = filas.length;

  // Arriba el primero, y en el sentido de las agujas del reloj: es como se
  // lee una lista, y la tabla de al lado va en ese mismo orden.
  const punto = (i: number, v: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [CENTRO + Math.cos(a) * RADIO * v, CENTRO + Math.sin(a) * RADIO * v] as const;
  };

  const trazos = useMemo(
    () =>
      lineas.map((l) => {
        // Un hueco parte la línea en tramos en vez de saltarlo con una recta:
        // unir dos dimensiones separadas dibujaría un lado que no existe.
        const tramos: string[] = [];
        let actual: string[] = [];
        for (let i = 0; i < n; i++) {
          const v = l.valores[i];
          if (v == null) {
            if (actual.length > 1) tramos.push(actual.join(' '));
            actual = [];
            continue;
          }
          const [x, y] = punto(i, v);
          actual.push(`${actual.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
        }
        if (actual.length > 1) tramos.push(actual.join(' '));

        // Cerrado solo si están las diez: media línea cerrada es un polígono
        // que afirma un área que no se ha medido.
        const completa = l.valores.every((v) => v != null);
        return { linea: l, d: tramos.join(' ') + (completa ? ' Z' : '') };
      }),
    [lineas, filas, n],
  );

  return (
    <svg viewBox={`0 0 ${TAM} ${TAM}`} className="w-full" style={{ maxWidth: TAM }} role="img"
      aria-label="Radar de las diez dimensiones por grupo">
      {/* Telaraña. */}
      {ANILLOS.map((a) => (
        <polygon key={a}
          points={filas.map((_, i) => punto(i, a).join(',')).join(' ')}
          fill="none" stroke="var(--border)" strokeWidth={a === 1 ? 1 : 0.5}
          strokeOpacity={a === 1 ? 0.9 : 0.5} />
      ))}
      {filas.map((_, i) => {
        const [x, y] = punto(i, 1);
        return <line key={i} x1={CENTRO} y1={CENTRO} x2={x} y2={y}
          stroke="var(--border)" strokeWidth="0.5" strokeOpacity={0.5} />;
      })}

      {/* Las líneas. El relleno es muy tenue a propósito: con cinco
          superpuestas, cualquier opacidad seria las vuelve barro. */}
      {trazos.map(({ linea, d }) => (
        <g key={linea.clave}>
          <path d={d} fill={linea.color} fillOpacity={0.07} stroke={linea.color}
            strokeWidth={linea.grueso ? 2 : 1.25} strokeLinejoin="round" />
          {linea.valores.map((v, i) =>
            v == null ? null : (
              <circle key={i} cx={punto(i, v)[0]} cy={punto(i, v)[1]}
                r={linea.grueso ? 2.6 : 1.8} fill={linea.color} />
            ),
          )}
        </g>
      ))}

      {/* Las etiquetas, fuera del último anillo. */}
      {filas.map((f, i) => {
        const [x, y] = punto(i, 1.16);
        const izq = x < CENTRO - 6;
        const der = x > CENTRO + 6;
        return (
          <text key={f.key} x={x} y={y} fontSize="8.5"
            textAnchor={izq ? 'end' : der ? 'start' : 'middle'}
            dominantBaseline="central" fill="var(--muted)">
            {f.label.replace(' / Arquetipo', '')}
          </text>
        );
      })}
    </svg>
  );
}
