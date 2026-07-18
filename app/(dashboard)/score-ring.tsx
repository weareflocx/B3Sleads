// Anillo de score de B3S: círculo de línea que se rellena con el valor.
// Bandas de color con los canales del logo: rojo <50, azul 51-75, verde 76-100.
// Server-safe (SVG puro). Reutilizable en la card del founder y en la ficha.

export function scoreColor(score: number): string {
  if (score <= 50) return 'var(--accent)';
  if (score <= 75) return 'var(--linkedin-soft)';
  return 'var(--cta)';
}

export function ScoreRing({ score, size = 34 }: { score: number; size?: number }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = scoreColor(score);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Score B3S ${Math.round(score)} de 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${c - filled}`}
        strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--text)"
        style={{ font: `600 ${Math.round(size * 0.34)}px var(--font-jetbrains, monospace)` }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}
