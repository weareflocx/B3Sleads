// Temperatura del lead: 5 llamas en vez de un número suelto.
// Traduce el priority score (recencia de señal + ronda + gap de marca +
// fit ICP + engagement) a cuántas llamas están encendidas. Un lead se
// "calienta" cuando responde o interactúa y se "enfría" si la señal envejece.

import { heatLevel } from '@/lib/scoring';

const FLAME =
  'M12 2c-1 4-4.4 5.9-5.4 9.1-.8 2.6.1 5.4 2.3 7 .3-1.5 1-2.8 2.1-3.8.9 1 1.5 2.3 1.6 3.9 2.6-1.3 4.1-4.2 3.5-7C15.4 8 12.9 6.4 12 2z';

export function Heat({ priority }: { priority: number | null }) {
  const level = heatLevel(priority);
  const hot = level >= 4 ? 'var(--accent)' : level >= 3 ? 'var(--warning)' : 'var(--muted)';

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={
        priority == null
          ? 'Sin prioridad calculada'
          : `Prioridad ${Math.round(priority)}/100 — señal + ronda + gap de marca + fit + engagement`
      }
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
    </span>
  );
}
