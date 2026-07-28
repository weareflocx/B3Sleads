'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ScanDimension, ScanTile } from '@/lib/scan-report';
import {
  canonDimension,
  defaultVersion,
  detectionNote,
  type DimensionVersions,
} from '@/lib/scan-versions';

// Pestañas del análisis de la ficha: el Scanner esquemático primero (los
// componentes tal cual los mide B3S) y el argumentario después. El contenido
// llega renderizado del servidor; aquí solo se elige qué se ve.
export function AnalysisTabs({
  tabs,
  aside,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
  // A la derecha de los tabs: el registro del score automático, visible
  // siempre (no enterrado dentro de un tab).
  aside?: ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
      {aside}
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

// Misma lógica que el score general (rojo/azul/verde), pero por proporción
// para que funcione con cualquier máximo (/5, /10 y el /20 de Magnetismo y
// Coherencia). <50% rojo · 50-79% azul · ≥80% verde. El 0 va en neutro.
//  /10 → 4=0.4 rojo · 5-7 azul · 8-10 verde   /5 → 2 rojo · 3 azul · 4-5 verde
//  /20 → 14=0.7 azul · 16=0.8 verde
function scoreTone(d: ScanDimension): string {
  if (d.missing || d.score == null) return 'border-[var(--border)] text-[var(--soft)]';
  if (d.score === 0) return 'border-[var(--border)] text-[var(--text)]';
  const ratio = d.ratio ?? (d.max ? d.score / d.max : 0);
  const band = ratio < 0.5 ? 'rojo' : ratio < 0.8 ? 'azul' : 'verde';
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
// Normaliza el nombre del componente (viene en español del markdown o en
// inglés del contrato v1) a un identificador estable para ordenar y agrupar.
const CANON: Record<string, string> = {
  'misión': 'mission', mission: 'mission',
  'visión': 'vision', vision: 'vision',
  valores: 'values', values: 'values',
  atributos: 'attributes', attributes: 'attributes',
  'propuesta de valor': 'value-prop', 'value proposition': 'value-prop',
  'personalidad / arquetipo': 'personality', 'personality / archetype': 'personality',
  'idea de marca': 'brand-idea', 'brand idea': 'brand-idea',
  'propósito': 'purpose', 'proposito': 'purpose', purpose: 'purpose',
  magnetismo: 'magnetism', magnetism: 'magnetism',
  coherencia: 'coherence', coherence: 'coherence',
};
const canon = (name: string) => CANON[name.trim().toLowerCase()] ?? name.trim().toLowerCase();

// Rejilla del informe original: el trío de identidad a 3 columnas, la
// coherencia (síntesis) a una sola a lo ancho, el resto en parejas. Cada
// banda dibuja solo los componentes que existan en el scan.
const BANDS: { cols: 1 | 2 | 3; slugs: string[] }[] = [
  { cols: 2, slugs: ['purpose', 'magnetism'] },
  { cols: 3, slugs: ['value-prop', 'personality', 'brand-idea'] },
  { cols: 2, slugs: ['attributes', 'values'] },
  { cols: 2, slugs: ['mission', 'vision'] },
  { cols: 1, slugs: ['coherence'] },
];
const BAND_COLS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

// Selección de curación activa sobre una dimensión: qué versión se eligió a
// mano y quién la firmó. Llega del servidor (tabla component_selections).
export interface SelectionInfo {
  scanId: string;
  selectedBy: string | null;
  note: string | null;
}

export function ScanComponents({
  dimensions,
  versions = [],
  companyId,
  selections = {},
}: {
  dimensions: ScanDimension[];
  // Todas las pasadas de cada componente, derivadas del histórico de scans.
  versions?: DimensionVersions[];
  // Para guardar la curación; sin él el panel es solo lectura.
  companyId?: string;
  selections?: Record<string, SelectionInfo>;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const versionsByKey = new Map(versions.map((v) => [v.key, v]));

  if (!dimensions.length) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        Sin scan todavía. Lanza uno arriba y aquí verás sus componentes.
      </p>
    );
  }

  // Reparte las dimensiones en las bandas del original; lo que no encaje en
  // ninguna cae en una banda final de parejas, así ningún scan pierde nada.
  const bySlug = new Map(dimensions.map((d) => [canon(d.name), d]));
  const placed = new Set<string>();
  const bands = BANDS.map((band) => ({
    cols: band.cols,
    items: band.slugs.map((s) => bySlug.get(s)).filter((d): d is ScanDimension => !!d),
  })).filter((band) => {
    band.items.forEach((d) => placed.add(canon(d.name)));
    return band.items.length > 0;
  });
  const leftovers = dimensions.filter((d) => !placed.has(canon(d.name)));
  if (leftovers.length) bands.push({ cols: 2, items: leftovers });

  function Card({ d }: { d: ScanDimension }) {
    const name = ES_LABELS[d.name] ?? d.name;
    const isOpen = !!open[d.name];
    const tiles = d.tilesDetail ?? [];
    const key = canonDimension(d.name);
    const dimVersions = versionsByKey.get(key) ?? null;
    const selection = selections[key] ?? null;
    // La versión mostrada: la elegida a mano si la hay; si no, la del último
    // run válido. Nunca la más alta por defecto.
    const prov = dimVersions
      ? (selection
          ? (dimVersions.versions.find((v) => v.scanId === selection.scanId) ??
            defaultVersion(dimVersions))
          : defaultVersion(dimVersions))
      : null;
    return (
          <div
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
                  title={isOpen ? 'Ocultar versiones' : 'Ver todas las versiones de este componente'}
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

            {/* Lectura estratégica primero: qué sostiene hoy y qué tiene que
                demostrar en el ciclo siguiente. Es el bloque con el que abre
                el componente en el Scanner y que aquí no se estaba pintando. */}
            {d.reading && <p className="mt-2.5 text-sm leading-relaxed">{d.reading}</p>}

            {/* El análisis es otra cosa: la tensión presente. Van los dos. */}
            {d.analysis && d.analysis !== d.reading && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{d.analysis}</p>
            )}

            {!d.reading && !d.analysis && (
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
                {d.verdict || 'Sin rastro en superficies públicas.'}
              </p>
            )}

            {/* Extracto y cita. Toda cita lleva su fuente: si no la hay se
                dice, porque omitir el botón parece un descuido de UI cuando en
                realidad es un hueco de evidencia. */}
            {(d.terms?.length || d.quote) && (
              <div className="mt-3 border-t border-dashed border-[var(--border)] pt-2.5">
                {d.terms?.length ? (
                  <p className="font-mono text-xs text-[var(--muted)]">{d.terms.join(' · ')}</p>
                ) : null}
                {d.quote && (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    <span className="italic">{d.quote}</span>{' '}
                    {d.quoteUrl ? (
                      <a
                        href={d.quoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 inline-block rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] not-italic hover:border-[var(--muted)] hover:text-[var(--text)]"
                      >
                        fuente ↗
                      </a>
                    ) : (
                      <span
                        title="El escaneo no guardó de dónde salió esta cita"
                        className="ml-1 inline-block rounded border border-dashed border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] not-italic text-[var(--soft)]"
                      >
                        sin fuente
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Procedencia: de qué pasada salió este número. */}
            {prov && (
              <p className="mt-2 font-mono text-[10px] text-[var(--soft)]">
                {fmtDateShort(prov.runAt)}
                {prov.uiUrl ? (
                  <>
                    {' · '}
                    <a
                      href={prov.uiUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[var(--cta)] hover:underline"
                    >
                      Ver Scan ↗
                    </a>
                  </>
                ) : null}
                {selection && (
                  <span
                    title={selection.note ?? undefined}
                    className="ml-2 rounded border border-[var(--cta)]/50 px-1.5 py-0.5 text-[var(--cta)]"
                  >
                    curado{selection.selectedBy ? ` por ${selection.selectedBy.split('@')[0]}` : ''}
                  </span>
                )}
              </p>
            )}

            {isOpen && (
              <VersionPanel
                dim={dimVersions}
                tiles={tiles}
                todos={d.todos}
                companyId={companyId}
                selection={selection}
              />
            )}
          </div>
    );
  }

  return (
    <div className="space-y-3">
      {bands.map((band, i) => (
        <div key={i} className={`grid gap-3 ${BAND_COLS[band.cols]}`}>
          {band.items.map((d) => (
            <Card key={d.name} d={d} />
          ))}
        </div>
      ))}
    </div>
  );
}

function fmtRun(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// Para la línea de procedencia de la tarjeta cerrada: lo mínimo (la rúbrica y
// el detalle viven en el panel del ojo, aquí solo fecha y enlace).
function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

// Panel de versiones: todas las pasadas de un componente, en orden
// cronológico descendente. La cabecera resume su fiabilidad, que es lo que
// convierte esta pantalla en un instrumento de calibración y no solo en un
// visor. Las pasadas donde no se detectó también salen: ver que la visión
// apareció un día y desapareció al siguiente es lo que explica el score.
function VersionPanel({
  dim,
  tiles,
  todos,
  companyId,
  selection,
}: {
  dim: DimensionVersions | null;
  tiles: ScanTile[];
  todos: { label: string; desc: string }[];
  companyId?: string;
  selection?: SelectionInfo | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // scanId en curso
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(selection?.note ?? '');

  // Guardar la elección: apunta a la versión, nunca la edita. `null` como
  // scanId = volver al automático (borra la selección).
  async function choose(scanId: string | null, withNote?: string) {
    if (!dim || !companyId) return;
    setBusy(scanId ?? 'revert');
    setError(null);
    try {
      const res = await fetch('/api/components/select', {
        method: scanId ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          scanId
            ? { companyId, dimension: dim.key, scanId, note: withNote }
            : { companyId, dimension: dim.key },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError((json as { error?: string }).error ?? 'No se pudo guardar');
      else router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!dim) {
    return (
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--soft)]">
          Este scan no guarda el detalle por componente, así que no hay versiones que comparar.
        </p>
      </div>
    );
  }

  const { min, max, stdev, detectedIn, totalRuns } = dim.stats;
  const activeId = selection?.scanId ?? defaultVersion(dim)?.scanId;

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      {/* Fiabilidad del componente a lo largo de los escaneos. */}
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
        {min != null ? `Rango ${min}-${max}` : 'Nunca detectado'}
        {stdev != null ? ` · desviación ${stdev}` : ''}
        {` · detectado en ${detectedIn} de ${totalRuns} ${totalRuns === 1 ? 'escaneo' : 'escaneos'}`}
      </p>

      <ul className="mt-2 space-y-2">
        {dim.versions.map((v, i) => {
          const active = v.scanId === activeId;
          return (
            <li
              key={`${v.scanId}-${i}`}
              className={`rounded-md border p-2.5 ${
                active ? 'border-[var(--cta)]/50' : 'border-[var(--border)]'
              } ${v.detected ? '' : 'opacity-60'}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] ${
                    v.detected
                      ? 'border-[var(--border)] text-[var(--text)]'
                      : 'border-dashed border-[var(--border)] text-[var(--soft)]'
                  }`}
                >
                  {v.detected ? `${v.score}/${v.max ?? 10}` : 'No detectado'}
                </span>
                <span className="font-mono text-[10px] text-[var(--muted)]">{fmtRun(v.runAt)}</span>
                {v.rubricVersion && (
                  <span
                    title="Dos rúbricas distintas no son comparables"
                    className="font-mono text-[10px] text-[var(--soft)]"
                  >
                    {v.rubricVersion}
                  </span>
                )}
                {v.uiUrl && (
                  <a
                    href={v.uiUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-[var(--muted)] hover:text-[var(--cta)] hover:underline"
                  >
                    ver run ↗
                  </a>
                )}
                {active ? (
                  <span className="ml-auto font-mono text-[10px] text-[var(--cta)]">
                    en uso{selection ? ' · curada' : ''}
                  </span>
                ) : v.detected && companyId ? (
                  <button
                    onClick={() => choose(v.scanId, note)}
                    disabled={busy != null}
                    className="ml-auto rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
                  >
                    {busy === v.scanId ? 'guardando…' : 'usar esta versión'}
                  </button>
                ) : null}
              </div>

              {v.detected ? (
                <>
                  {v.reading && (
                    <p className="mt-1.5 text-xs leading-relaxed">{v.reading}</p>
                  )}
                  {v.analysis && v.analysis !== v.reading && (
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{v.analysis}</p>
                  )}
                  {v.quote && (
                    <p className="mt-1 text-[11px] italic leading-relaxed text-[var(--soft)]">
                      {v.quote}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-xs text-[var(--soft)]">
                  Este escaneo no llegó a esta baldosa.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {detectedIn > 0 && detectedIn < totalRuns && (
        <p className="mt-2 text-[10px] text-[var(--warning)]">
          Inestable entre pasadas: {detectionNote(dim)}
        </p>
      )}

      {/* La curación queda firmada y con su porqué; y siempre es reversible:
          sin "Volver al automático" una ficha mal curada sería irrecuperable. */}
      {selection && companyId && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && choose(selection.scanId, note)}
            onBlur={() => note.trim() !== (selection.note ?? '') && choose(selection.scanId, note)}
            placeholder="por qué esta versión (opcional)"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs outline-none focus:border-[var(--cta)]"
          />
          <button
            onClick={() => choose(null)}
            disabled={busy != null}
            className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
          >
            {busy === 'revert' ? 'volviendo…' : 'volver al automático'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p>}

      {/* Baldosas y plan de trabajo de la versión en uso. */}
      {tiles.length > 0 && (
        <div className="mt-3">
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
      {todos.length > 0 && (
        <ul className="mt-3 space-y-1">
          {todos.map((t) => (
            <li key={t.label} className="text-xs leading-relaxed text-[var(--muted)]">
              <span className="font-medium text-[var(--text)]">{t.label}</span> — {t.desc}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
