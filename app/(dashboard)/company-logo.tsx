'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Logo de la empresa. El monograma (iniciales, sin datos externos) SIEMPRE va
// debajo como base fiable; encima se intentan las fuentes externas por orden y
// solo se enseña la que carga de verdad. Así nunca se ve una imagen rota.
//
// Antes había una sola fuente, logo.clearbit.com, y Clearbit cerró su API
// pública de logos: hoy el dominio ni siquiera resuelve. Por eso desaparecieron
// de golpe todos los logos salvo los subidos a mano. La lección es que una
// única fuente externa es un punto de fallo, así que ahora son varias y se
// prueban en cascada: ninguna cubre el catálogo entera por sí sola.
function hueFromName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function CompanyLogo({
  domain,
  name,
  size = 52,
  src,
}: {
  domain: string;
  name: string;
  size?: number;
  // Logo pegado a mano. Manda sobre todo lo demás: si está puesto, es porque
  // lo automático no servía.
  src?: string | null;
}) {
  const fuentes = useMemo(() => {
    const manual = src?.trim();
    const d = domain?.trim();
    return [
      manual || null,
      d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : null,
      d ? `https://www.google.com/s2/favicons?sz=128&domain=${d}` : null,
    ].filter(Boolean) as string[];
  }, [src, domain]);

  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const source = fuentes[i] ?? null;

  // Al cambiar la lista de fuentes se vuelve a empezar por la primera.
  useEffect(() => {
    setI(0);
    setLoaded(false);
  }, [fuentes]);

  // El `complete` no es un adorno: con SSR el navegador empieza a descargar la
  // imagen al parsear el HTML, y si termina antes de que React hidrate, el
  // onLoad ya ha pasado y no vuelve a dispararse. Sin esto la imagen se
  // quedaba invisible para siempre.
  useEffect(() => {
    setLoaded(false);
    const el = imgRef.current;
    if (!el || !source) return;
    if (el.complete) {
      if (el.naturalWidth > 1) setLoaded(true);
      else setI((n) => n + 1);
    }
  }, [source]);

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
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={source}
          ref={imgRef}
          src={source}
          referrerPolicy="no-referrer"
          alt={`Logo de ${name}`}
          onLoad={(e) => {
            // Un favicon de 1x1 es el "no tengo" de algunos proveedores.
            if (e.currentTarget.naturalWidth > 1) setLoaded(true);
            else setI((n) => n + 1);
          }}
          onError={() => setI((n) => n + 1)}
          className="absolute inset-0 h-full w-full bg-white object-contain transition-opacity"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </span>
  );
}
