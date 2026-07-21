'use client';

import { useEffect, useState } from 'react';

// Avatar del founder. El monograma (iniciales sobre un tinte determinista
// del nombre) es SIEMPRE la base: no depende de nada externo. Encima, si
// hay una foto pegada a mano, se revela solo cuando carga de verdad, así
// que una URL caducada nunca deja un hueco roto.
//
// La foto se pega a mano; no se trae de LinkedIn de forma programática
// (spec §9).
function hueFromName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({
  name,
  size = 38,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
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
      className="relative inline-block shrink-0 overflow-hidden rounded-full border border-[var(--border)]"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-semibold leading-none"
        style={{
          background: `hsl(${h} 55% 50% / 0.16)`,
          color: 'var(--text)',
          fontSize: Math.round(size * 0.36),
        }}
      >
        {initials}
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Foto de ${name}`}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth > 1) setLoaded(true);
          }}
          className="absolute inset-0 h-full w-full object-cover transition-opacity"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </span>
  );
}
