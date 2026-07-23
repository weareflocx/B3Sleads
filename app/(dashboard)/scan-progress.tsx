'use client';

// Barra de progreso del scan, en el lenguaje del propio B3S Scanner: una
// hilera de tics verticales que se van encendiendo. El recorrido cruza los
// tres canales del logo (rojo → azul → verde), así que el color dice por sí
// solo cuánto queda sin necesidad de un número.
//
// Cada tic lleva el color de SU posición en la pista, no el del progreso
// actual: al llenarse, la barra revela el degradado completo.
const TICKS = 72;

function tickColor(t: number): string {
  // t en 0..1. Primera mitad rojo→azul, segunda azul→verde, por canales
  // puros: en el centro es azul limpio, al final verde limpio.
  if (t < 0.5) {
    const u = t / 0.5;
    return `rgb(${Math.round(255 * (1 - u))}, 0, ${Math.round(255 * u)})`;
  }
  const u = (t - 0.5) / 0.5;
  return `rgb(0, ${Math.round(255 * u)}, ${Math.round(255 * (1 - u))})`;
}

export function ScanProgress({ value, label }: { value: number; label?: string | null }) {
  const pct = Math.max(0, Math.min(100, value));
  const filled = Math.round((pct / 100) * TICKS);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ? `Scan en curso: ${label}` : 'Scan en curso'}
      className="flex h-6 w-full items-stretch gap-[4px]"
    >
      {Array.from({ length: TICKS }, (_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            className="flex-1 rounded-[1px] transition-[background-color,opacity] duration-500"
            style={{
              backgroundColor: on ? tickColor(i / (TICKS - 1)) : 'currentColor',
              opacity: on ? 1 : 0.14,
              // Escalonado leve: al saltar el progreso, los tics se encienden
              // en cascada en vez de todos a la vez.
              transitionDelay: on ? `${Math.min(i, 20) * 12}ms` : '0ms',
            }}
          />
        );
      })}
    </div>
  );
}
