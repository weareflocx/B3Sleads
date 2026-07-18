'use client';

import { useState } from 'react';

// Logo de la empresa: el monograma (iniciales, sin datos externos) SIEMPRE va
// debajo como base fiable. Encima se intenta el logo público de Clearbit por
// dominio, que solo se muestra si carga de verdad (onLoad + naturalWidth). Así
// nunca se ve una imagen rota: si Clearbit no tiene logo, queda el monograma.
function hueFromName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function CompanyLogo({
  domain,
  name,
  size = 52,
}: {
  domain: string;
  name: string;
  size?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-md border border-[var(--border)]"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{
          background: `hsl(${hueFromName(name || domain)} 55% 50% / 0.16)`,
          color: 'var(--text)',
          fontSize: Math.round(size * 0.34),
        }}
      >
        {initials}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={`Logo de ${name}`}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth > 1) setLoaded(true);
        }}
        className="absolute inset-0 h-full w-full bg-white object-contain transition-opacity"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  );
}
