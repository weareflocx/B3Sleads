'use client';

import { useState } from 'react';
import type { FilaComponente, MarcaEnFila, PerfilMarca } from '@/lib/benchmark';
import { scoreColor } from '../../score-ring';
import { CompanyLogo } from '../../company-logo';

// La matriz ya no es solo un marcador. Cada fila se abre y enseña lo que el
// Scanner ENTENDIÓ de cada marca en ese componente, con la cita literal
// cuando la hay. Ese texto estaba guardado en el 100% de los componentes y no
// se leía en ningún sitio: la tabla daba el número y escondía el porqué, que
// es justamente el material con el que se escribe la narrativa.

// Misma escala que el resto del producto (rojo ≤50, azul ≤75, verde encima),
// para que un 40% signifique lo mismo aquí que en un score de ficha.
function color(v: number | null): string {
  return v == null ? 'var(--soft)' : scoreColor(v * 100);
}

function Barra({ v, ancho = 96 }: { v: number | null; ancho?: number }) {
  if (v == null) {
    return <span className="font-mono text-[11px] text-[var(--soft)]">sin dato</span>;
  }
  const pct = Math.round(v * 100);
  const c = color(v);
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-1.5 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)]"
        style={{ width: ancho }}
      >
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[11px]" style={{ color: c }}>
        {pct}%
      </span>
    </span>
  );
}

function Marca({ m }: { m: MarcaEnFila }) {
  return (
    <li className="flex gap-3 py-2.5">
      <CompanyLogo domain={m.domain} name={m.name} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{m.name}</span>
          <span
            className="shrink-0 font-mono text-[11px]"
            style={{ color: color(m.ratio) }}
          >
            {m.ratio == null ? 'sin rastro' : `${Math.round(m.ratio * 100)}%`}
          </span>
        </div>
        {m.analisis && (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{m.analisis}</p>
        )}
        {m.cita && (
          <p className="mt-1.5 border-l-2 border-[var(--border)] pl-2.5 text-[13px] italic leading-relaxed text-[var(--soft)]">
            {m.cita}
          </p>
        )}
      </div>
    </li>
  );
}

export function Matriz({
  filas,
  cliente,
  clienteDominio,
  grupos,
}: {
  filas: FilaComponente[];
  cliente: string;
  clienteDominio: string;
  grupos: { nombre: string; perfiles: PerfilMarca[] }[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {/* Cabecera con anchos fijos por columna: repartir a partes iguales
          dejaba los grupos pegados a la derecha y muy lejos del cliente, que
          es justo la comparación que hay que leer de un vistazo. */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider">
        <span className="w-6 shrink-0" />
        <span className="min-w-0 flex-1 text-[var(--soft)]">Componente</span>
        <span className="w-[150px] shrink-0 text-[var(--cta)]">{cliente}</span>
        {grupos.map((g) => (
          <span key={g.nombre} className="w-[150px] shrink-0 text-[var(--soft)]">
            {g.nombre} <span className="opacity-60">({g.perfiles.length})</span>
          </span>
        ))}
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {filas.map((f) => {
          const abierto = abierta === f.key;
          const hayQueLeer =
            Boolean(f.clienteTexto?.analisis) ||
            f.porGrupo.some((g) => g.marcas.some((m) => m.analisis));
          return (
            <li key={f.key}>
              <button
                onClick={() => setAbierta(abierto ? null : f.key)}
                disabled={!hayQueLeer}
                className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  className={`w-6 shrink-0 font-mono text-[11px] text-[var(--soft)] transition-transform ${abierto ? 'rotate-90' : ''}`}
                >
                  {hayQueLeer ? '›' : ''}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{f.label}</span>
                <span className="w-[150px] shrink-0">
                  <Barra v={f.cliente} />
                </span>
                {f.porGrupo.map((g) => (
                  <span key={g.nombre} className="w-[150px] shrink-0">
                    <Barra v={g.media} />
                  </span>
                ))}
              </button>

              {abierto && (
                <div className="grid gap-6 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-4 lg:grid-cols-[1fr_2fr]">
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--cta)]">
                      {cliente}
                    </p>
                    <ul className="divide-y divide-[var(--border)]">
                      <Marca
                        m={{
                          name: cliente,
                          domain: clienteDominio,
                          ratio: f.cliente,
                          analisis: f.clienteTexto?.analisis ?? null,
                          cita: f.clienteTexto?.cita ?? null,
                        }}
                      />
                    </ul>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {f.porGrupo.map((g) => (
                      <div key={g.nombre}>
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                          {g.nombre}
                        </p>
                        {g.marcas.length === 0 ? (
                          <p className="py-2 text-[13px] text-[var(--soft)]">Sin marcas medidas.</p>
                        ) : (
                          <ul className="divide-y divide-[var(--border)]">
                            {g.marcas.map((m) => (
                              <Marca key={m.domain} m={m} />
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
