'use client';

import { useState, type ReactNode } from 'react';

// Las cuatro caras del estudio. Nacen cuando la página pasa de tres bloques a
// siete: montar los grupos, decidir el criterio, mirar el mapa y comparar
// componente a componente son cuatro trabajos distintos, y hacerlos scroll
// abajo del anterior obliga a recorrer todo lo demás cada vez.
//
// El contenido de las cuatro se pinta en el servidor y aquí solo se elige
// cuál se enseña, así que cambiar de pestaña no pide nada a la red.
export function PestanasEstudio({
  pestanas,
}: {
  pestanas: { clave: string; etiqueta: string; contenido: ReactNode; nota?: string | null }[];
}) {
  const [activa, setActiva] = useState(pestanas[0]?.clave);
  const actual = pestanas.find((p) => p.clave === activa) ?? pestanas[0];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
        {pestanas.map((p) => (
          <button
            key={p.clave}
            onClick={() => setActiva(p.clave)}
            aria-current={p.clave === actual?.clave}
            className={`rounded-md border px-3.5 py-1.5 text-sm transition-colors ${
              p.clave === actual?.clave
                ? 'border-[var(--nav-active-border)] bg-[var(--nav-active-bg)] font-medium text-[var(--text)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {p.etiqueta}
            {p.nota && (
              <span className="ml-2 font-mono text-[10px] text-[var(--soft)]">{p.nota}</span>
            )}
          </button>
        ))}
      </div>
      <div>{actual?.contenido}</div>
    </div>
  );
}
