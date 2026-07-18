// Temperatura del lead: 5 llamas + tendencia (calentando / enfriando).
// El nivel lo calcula lib/scoring.leadTemperature del estado ACTUAL del lead
// (etapa, respuesta, interacción, ronda, hueco de marca) y baja con la
// inactividad. Aquí solo se pinta.

import type { Temperature } from '@/lib/scoring';

const FLAME =
  'M12 2c-1 4-4.4 5.9-5.4 9.1-.8 2.6.1 5.4 2.3 7 .3-1.5 1-2.8 2.1-3.8.9 1 1.5 2.3 1.6 3.9 2.6-1.3 4.1-4.2 3.5-7C15.4 8 12.9 6.4 12 2z';

export function Heat({ temp }: { temp: Temperature }) {
  const { level, trend, score, note } = temp;
  const hot = level >= 4 ? 'var(--accent)' : level >= 3 ? 'var(--warning)' : 'var(--muted)';
  const trendTxt = trend === 'up' ? ' ↑ calentando' : trend === 'down' ? ' ↓ enfriándose' : '';

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Temperatura ${score}/100${trendTxt} — ${note}`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={FLAME}
            fill={i <= level ? hot : 'none'}
            stroke={i <= level ? hot : 'var(--soft)'}
            strokeWidth="1.6"
          />
        </svg>
      ))}
      {trend !== 'flat' && (
        <span
          className="ml-0.5 text-[10px]"
          style={{ color: trend === 'up' ? 'var(--cta)' : 'var(--linkedin-soft)' }}
        >
          {trend === 'up' ? '↑' : '↓'}
        </span>
      )}
    </span>
  );
}
