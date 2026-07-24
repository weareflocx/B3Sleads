'use client';

import { useState, type ReactNode } from 'react';
import type { ScanDimension, ScanTile } from '@/lib/scan-report';

// Pestañas del análisis de la ficha: el Scanner esquemático primero (los
// componentes tal cual los mide B3S) y el argumentario después. El contenido
// llega renderizado del servidor; aquí solo se elige qué se ve.
export function AnalysisTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`rounded-md border px-3.5 py-1.5 text-sm transition-colors ${
              t.key === active
                ? 'border-[var(--nav-active-border)] bg-[var(--nav-active-bg)] font-medium text-[var(--text)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3">{current?.content}</div>
    </div>
  );
}

// El Scanner tiene componentes con etiqueta en inglés; aquí se habla español.
const ES_LABELS: Record<string, string> = {
  Magnetism: 'Magnetismo',
  Purpose: 'Propósito',
  Mission: 'Misión',
  Vision: 'Visión',
  Values: 'Valores',
  Attributes: 'Atributos',
  Coherence: 'Coherencia',
  'Value Proposition': 'Propuesta de valor',
  'Brand Idea': 'Idea de marca',
  'Personality / Archetype': 'Personalidad / Arquetipo',
};

function IconEye({ open }: { open: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
      {open && <path d="M4 20 20 4" />}
    </svg>
  );
}

// Misma lógica que el score general (rojo/azul/verde), adaptada al máximo
// de cada componente. El 0 va en neutro: aún no hay nada que colorear.
//  /10 → 1-4 rojo · 5-7 azul · 8-10 verde
//  /5  → 1-2 rojo · 3 azul · 4-5 verde
function scoreTone(d: ScanDimension): string {
  if (d.missing || d.score == null) return 'border-[var(--border)] text-[var(--soft)]';
  const s = d.score;
  if (s === 0) return 'border-[var(--border)] text-[var(--text)]';
  const max = d.max ?? 10;
  const band =
    max <= 5
      ? s <= 2 ? 'rojo' : s === 3 ? 'azul' : 'verde'
      : s <= 4 ? 'rojo' : s <= 7 ? 'azul' : 'verde';
  if (band === 'rojo') return 'border-[var(--accent)]/50 text-[var(--accent)]';
  if (band === 'azul') return 'border-[var(--linkedin-soft)]/60 text-[var(--linkedin-soft)]';
  return 'border-[var(--cta)]/50 text-[var(--cta)]';
}

const TILE_TONE: Record<ScanTile['state'], string> = {
  on: 'border-[var(--cta)]/50 text-[var(--cta)]',
  off: 'border-[var(--linkedin-soft)]/60 text-[var(--linkedin-soft)]',
  blind: 'border-[var(--accent)]/50 text-[var(--accent)]',
};

// La parrilla esquemática: cada componente del Brand3 Scanner con su nota y
// su veredicto (que el Scanner ya escribe en español). El ojo abre el
// razonamiento, la evidencia literal con su fuente y las baldosas apagadas.
// La cita es evidencia capturada de las superficies: se muestra tal cual
// (traducirla sería falsificarla), en cursiva y con su enlace.
export function ScanComponents({ dimensions }: { dimensions: ScanDimension[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!dimensions.length) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        Sin scan todavía. Lanza uno arriba y aquí verás sus componentes.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {dimensions.map((d) => {
        const name = ES_LABELS[d.name] ?? d.name;
        const isOpen = !!open[d.name];
        const tiles = d.tilesDetail ?? [];
        return (
          <div
            key={d.name}
            className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                {name}
              </h3>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`inline-flex h-6 items-center rounded border px-1.5 font-mono text-xs ${scoreTone(d)}`}
                >
                  {d.missing || d.score == null ? 'sin rastro' : `${d.score}/${d.max ?? 10}`}
                </span>
                <button
                  onClick={() => setOpen((o) => ({ ...o, [d.name]: !o[d.name] }))}
                  title={isOpen ? 'Ocultar análisis' : 'Ver análisis, evidencia y baldosas'}
                  aria-label={`${isOpen ? 'Ocultar' : 'Ver'} detalle de ${name}`}
                  aria-expanded={isOpen}
                  className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                    isOpen
                      ? 'border-[var(--muted)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <IconEye open={isOpen} />
                </button>
              </span>
            </div>

            {/* Lo visible es la frase literal capturada, en su idioma, en
                texto normal (aquí no se entrecomilla ni se pone en cursiva).
                Sin cita, el veredicto. */}
            {d.quote ? (
              <p className="mt-2.5 text-sm leading-relaxed">{d.quote}</p>
            ) : (
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
                {d.verdict || d.analysis || 'Sin rastro en superficies públicas.'}
              </p>
            )}

            {isOpen && (
              <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
                {d.verdict && (
                  <p className="text-sm leading-relaxed">{d.verdict}</p>
                )}
                {d.analysis && d.analysis !== d.verdict && (
                  <p className="text-xs leading-relaxed text-[var(--muted)]">{d.analysis}</p>
                )}
                {d.quoteUrl && (
                  <a
                    href={d.quoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]"
                  >
                    fuente ↗
                  </a>
                )}
                {tiles.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                      Baldosas · encendida verde · no detectada azul · sin medir rojo
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tiles.map((t) => (
                        <span
                          key={t.label}
                          title={t.reason ?? undefined}
                          className={`inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] ${TILE_TONE[t.state]}`}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {d.todos.length > 0 && (
                  <ul className="space-y-1">
                    {d.todos.map((t) => (
                      <li key={t.label} className="text-xs leading-relaxed text-[var(--muted)]">
                        <span className="font-medium text-[var(--text)]">{t.label}</span> — {t.desc}
                      </li>
                    ))}
                  </ul>
                )}
                {!d.verdict && !tiles.length && !d.todos.length && (
                  <p className="text-xs text-[var(--soft)]">
                    Este scan no guarda evidencia detallada para este componente.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
