// Anillo de score de B3S: círculo de línea que se rellena con el valor.
// Bandas de color con los canales del logo: rojo <50, azul 51-75, verde 76-100.
// Server-safe (SVG puro). Reutilizable en la card del founder y en la ficha.

export function scoreColor(score: number): string {
  if (score <= 50) return 'var(--accent)';
  if (score <= 75) return 'var(--linkedin-soft)';
  return 'var(--cta)';
}

// La geometría del anillo, aparte del componente.
//
// El mapa del estudio dibuja el mismo anillo pero DENTRO de su propio SVG, y
// un <svg> anidado complica la exportación a Figma. Sacando los números aquí,
// el arco del mapa y el de las listas no pueden desviarse el uno del otro: si
// alguien cambia el grosor o la escala, cambian los dos.
export interface AnilloDeScore {
  radio: number;
  circunferencia: number;
  // Longitud del arco que corresponde al score.
  relleno: number;
  color: string;
  grosor: number;
}

export function anilloDeScore(score: number, size: number, grosor = 2.5): AnilloDeScore {
  const radio = (size - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  return {
    radio,
    circunferencia,
    relleno: (Math.max(0, Math.min(100, score)) / 100) * circunferencia,
    color: scoreColor(score),
    grosor,
  };
}

export function ScoreRing({ score, size = 34 }: { score: number; size?: number }) {
  const { radio: r, circunferencia: c, relleno: filled, color, grosor: stroke } = anilloDeScore(
    score,
    size,
  );

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
