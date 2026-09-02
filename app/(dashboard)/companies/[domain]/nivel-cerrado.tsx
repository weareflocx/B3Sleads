'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// El momento en que un lead deja de serlo. Suena a adorno y no lo es: cerrar
// un cliente es el único evento del embudo que merece celebrarse, y marcarlo
// separa dos modos de trabajo que hasta ahora vivían en la misma ficha.
// A partir de aquí la marca ya no se persigue, se trabaja.
function Confeti() {
  // Determinista por índice, no aleatorio: en un componente de cliente que
  // React puede volver a montar, Math.random daría saltos visibles.
  const piezas = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const s = (i * 2654435761) % 1000;
        return {
          left: (s % 100) + (i % 3) * 0.3,
          delay: ((s * 7) % 900) / 1000,
          dur: 2.4 + ((s * 13) % 1600) / 1000,
          giro: ((s * 17) % 720) - 360,
          ancho: 5 + (s % 5),
          alto: 8 + (s % 9),
          color: ['#ff0000', '#0000ff', '#00d554', '#ffffff'][i % 4],
        };
      }),
    [],
  );
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <style>{`
        @keyframes b3s-caer {
          from { transform: translateY(-8vh) rotate(0deg); opacity: 1 }
          to   { transform: translateY(104vh) rotate(var(--giro)); opacity: 0.9 }
        }
      `}</style>
      {piezas.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.ancho,
            height: p.alto,
            background: p.color,
            // @ts-expect-error variable CSS propia
            '--giro': `${p.giro}deg`,
            animation: `b3s-caer ${p.dur}s cubic-bezier(0.25, 0.6, 0.4, 1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function NivelCerrado({
  domain,
  company,
  reciente,
}: {
  domain: string;
  company: string;
  // Solo se celebra cuando el cierre acaba de ocurrir en esta sesión. Cada
  // recarga de una ficha ya cerrada no puede lanzar confeti: la fiesta se
  // gasta si se repite.
  reciente: boolean;
}) {
  const [celebrar, setCelebrar] = useState(false);
  useEffect(() => {
    if (!reciente) return;
    setCelebrar(true);
    const t = setTimeout(() => setCelebrar(false), 5200);
    return () => clearTimeout(t);
  }, [reciente]);

  return (
    <>
      {celebrar && <Confeti />}
      <div className="rounded-lg border border-[var(--cta)] bg-[var(--cta)]/[0.06] p-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--cta)]">
          Cliente · {company}
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-snug">
          Ya no hay que convencerles. Ahora hay que construirles la marca.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          El scan dice cómo está su marca hoy. Lo que falta es contra qué se mide: qué hace su
          categoría, qué territorio no ocupa nadie y qué palabras están quemadas. Eso es el estudio.
        </p>
        <Link
          href={`/marcas/${domain}`}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--cta)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Abrir el estudio de marca →
        </Link>
      </div>
    </>
  );
}
