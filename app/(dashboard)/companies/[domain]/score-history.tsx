import type { Scan } from '@/lib/types';

// Histórico de scans con un sparkline minimalista de la evolución del score.
// Server component: SVG estático, sin librería. Coherente con el estilo B3S.
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

export function ScoreHistory({ scans }: { scans: Scan[] }) {
  const withScore = scans.filter((s) => s.score != null);
  if (withScore.length === 0) return null;

  const W = 320;
  const H = 56;
  const padX = 6;
  const padY = 8;
  const n = withScore.length;

  const x = (i: number) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX));
  const y = (score: number) => H - padY - (score / 100) * (H - 2 * padY);

  const pts = withScore.map((s, i) => ({ px: x(i), py: y(Number(s.score)), scan: s }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].px.toFixed(1)},${H} L${pts[0].px.toFixed(1)},${H} Z`;

  const first = Number(withScore[0].score);
  const last = Number(withScore[withScore.length - 1].score);
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        Histórico de scans ({n})
        {n > 1 && (
          <span
            className={`font-mono ${delta > 0 ? 'text-[var(--success)]' : delta < 0 ? 'text-[var(--danger)]' : ''}`}
          >
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        {n > 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Evolución del score">
            <path d={area} fill="var(--accent)" fillOpacity="0.07" />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.px}
                cy={p.py}
                r={i === n - 1 ? 3 : 2.2}
                fill={i === n - 1 ? 'var(--accent)' : 'var(--surface)'}
                stroke="var(--accent)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
        <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
          {[...withScore].reverse().map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="font-mono text-[var(--muted)]">{fmtDate(s.created_at)}</span>
              <span className="font-mono">{Number(s.score)}/100</span>
              {s.ui_url ? (
                <a
                  href={s.ui_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  informe ↗
                </a>
              ) : (
                <span className="w-14" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
