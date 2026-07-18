// Avatar monograma: iniciales sobre un tinte determinista del nombre.
// NO es la foto de LinkedIn (traerla sería scraping, spec §9): es un ancla
// visual generada localmente, sin datos externos. Da color y hace la lista
// más escaneable sin tocar LinkedIn.

function hueFromName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const h = hueFromName(name || '?');

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] font-semibold leading-none"
      style={{
        width: size,
        height: size,
        background: `hsl(${h} 55% 50% / 0.16)`,
        color: 'var(--text)',
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initials}
    </span>
  );
}
