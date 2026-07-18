// Temperatura del lead: 5 llamas + tendencia (calentando / manteniendo / enfriando).
// Las llamas toman el color de la tendencia, igual que la flecha:
//   sube → verde · se mantiene → gris · baja → azul puro (#0000ff, el frío).
// El número de llamas encendidas es la magnitud; el color, la dirección.

import type { Temperature } from '@/lib/scoring';

const FLAME =
  'M12 2c-1 4-4.4 5.9-5.4 9.1-.8 2.6.1 5.4 2.3 7 .3-1.5 1-2.8 2.1-3.8.9 1 1.5 2.3 1.6 3.9 2.6-1.3 4.1-4.2 3.5-7C15.4 8 12.9 6.4 12 2z';

const COOL = '#0000ff';

export function Heat({ temp, size = 13 }: { temp: Temperature; size?: number }) {
  const { level, trend, score, note } = temp;
  const color = trend === 'up' ? 'var(--cta)' : trend === 'down' ? COOL : 'var(--muted)';
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendTxt =
    trend === 'up' ? ' ↑ calentando' : trend === 'down' ? ' ↓ enfriándose' : ' → estable';

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Temperatura ${score}/100${trendTxt} — ${note}`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={FLAME}
            fill={i <= level ? color : 'none'}
            stroke={i <= level ? color : 'var(--soft)'}
            strokeWidth="1.6"
          />
        </svg>
      ))}
      <span className="ml-0.5 text-[10px]" style={{ color }}>
        {arrow}
      </span>
    </span>
  );
}
