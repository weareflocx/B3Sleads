'use client';

import { useState } from 'react';
import Link from 'next/link';
import { companyLabel, displayName, stageLabel } from '@/lib/types';
import type { BriefingLead } from '@/lib/types';
import { ScoreRing } from '../score-ring';
import { Heat } from '../heat';
import { leadTemperature } from '@/lib/scoring';
import { CompanyLogo } from '../company-logo';

// Catálogo de marcas con controles: ordenar por score B3S o por recientes,
// y verlo en tarjetas, lista o cuadrícula. Una tarjeta por startup.
type Sort = 'score' | 'temperatura' | 'recientes';
type Dir = 'desc' | 'asc';
type View = 'tarjetas' | 'lista' | 'cuadricula';

export function StartupsList({ items }: { items: BriefingLead[] }) {
  const [sort, setSort] = useState<Sort>('score');
  const [dir, setDir] = useState<Dir>('desc');
  const [view, setView] = useState<View>('tarjetas');

  // Pulsar el orden que ya está activo lo invierte. Es el patrón de cualquier
  // tabla y evita duplicar botones: con tres criterios y dos direcciones
  // harían falta seis, y la barra dejaría de leerse de un vistazo.
  const elegirOrden = (v: Sort) => {
    if (v === sort) return setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    setSort(v);
    setDir('desc');
  };

  const scoreOf = (bl: BriefingLead) =>
    bl.scan?.status === 'ready' && bl.scan.score != null ? Number(bl.scan.score) : null;
  const tempOf = (bl: BriefingLead) => leadTemperature(bl).score;

  const sorted = [...items].sort((a, b) => {
    const signo = dir === 'desc' ? 1 : -1;
    if (sort === 'recientes') return signo * b.lead.updated_at.localeCompare(a.lead.updated_at);
    if (sort === 'temperatura') return signo * (tempOf(b) - tempOf(a));
    // Sin scan no es "la peor valorada", es una desconocida: se queda al final
    // en las dos direcciones. Colarlas arriba en ascendente enterraría justo
    // las marcas flojas que se quieren ver.
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return signo * (sb - sa);
  });
  const variant: View = view;
  const flecha = dir === 'desc' ? ' ↓' : ' ↑';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          label="Orden"
          value={sort}
          onChange={(v) => elegirOrden(v as Sort)}
          options={[
            ['score', `Score B3S${sort === 'score' ? flecha : ''}`],
            ['temperatura', `Temperatura${sort === 'temperatura' ? flecha : ''}`],
            ['recientes', `Recientes${sort === 'recientes' ? flecha : ''}`],
          ]}
        />
        <Segmented
          label="Vista"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            ['tarjetas', 'Tarjetas'],
            ['lista', 'Lista'],
            ['cuadricula', 'Cuadrícula'],
          ]}
        />
      </div>

      {view === 'cuadricula' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((bl) => (
            <StartupCard
              key={bl.company!.domain}
              bl={bl}
              variant="cuadricula"
              verTemp={sort === 'temperatura'}
            />
          ))}
        </div>
      ) : (
        <div className={view === 'lista' ? 'space-y-2' : 'space-y-3'}>
          {sorted.map((bl) => (
            <StartupCard
              key={bl.company!.domain}
              bl={bl}
              variant={variant}
              verTemp={sort === 'temperatura'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StartupCard({
  bl,
  variant,
  verTemp,
}: {
  bl: BriefingLead;
  variant: View;
  // Ordenando por temperatura hay que VER la temperatura: un orden cuyo
  // criterio no se ve parece aleatorio.
  verTemp: boolean;
}) {
  const c = bl.company!;
  const name = companyLabel(c.name, c.domain);
  const score = bl.scan?.status === 'ready' && bl.scan.score != null ? Number(bl.scan.score) : null;
  const scanning = bl.scan?.status === 'queued' || bl.scan?.status === 'running';
  const sectors = (c.sector ?? '')
    .split(/\s*·\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const founder = bl.contact ? displayName(bl.contact.full_name) : null;
  // El mismo componente que la ficha: manda el logo subido a mano, si no el
  // publico por dominio, y solo si ninguno carga queda el monograma. Antes
  // esta lista pintaba SIEMPRE la inicial, asi que el logo que alguien habia
  // subido no se veia en ningun sitio salvo dentro de la ficha.
  const Logo = ({ size }: { size: number }) => (
    <CompanyLogo domain={c.domain} name={name} size={size} src={c.logo_url} />
  );

  const scoreEl = (
    <span className="flex shrink-0 items-center gap-2.5">
      {verTemp && <Heat temp={leadTemperature(bl)} size={variant === 'lista' ? 11 : 13} />}
      {score != null ? (
        <ScoreRing score={score} size={variant === 'lista' ? 26 : 30} />
      ) : (
        <span className="text-xs text-[var(--muted)]">
          {scanning ? 'escaneando…' : 'sin scan'}
        </span>
      )}
    </span>
  );

  const sectorChips = sectors.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {sectors.map((s) => (
        <span
          key={s}
          className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
        >
          {s}
        </span>
      ))}
    </div>
  );

  const meta = (
    <span className="text-xs text-[var(--muted)]">
      {stageLabel(bl.lead.stage)}
      {founder ? ` · ${founder}` : ''}
    </span>
  );

  const fichaHref = `/companies/${c.domain}`;

  if (variant === 'lista') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <Logo size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={fichaHref} className="truncate font-medium hover:underline">
              {name}
            </Link>
            {meta}
          </div>
          {sectorChips}
        </div>
        {scoreEl}
        <Link
          href={fichaHref}
          className="shrink-0 rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-black transition-opacity hover:opacity-85"
        >
          Ficha
        </Link>
      </div>
    );
  }

  if (variant === 'cuadricula') {
    return (
      <div className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 gap-2.5">
            <Logo size={34} />
            <div className="min-w-0">
              <Link href={fichaHref} className="block truncate font-medium hover:underline">
                {name}
              </Link>
              {meta}
            </div>
          </div>
          {scoreEl}
        </div>
        {sectorChips && <div className="mt-2.5">{sectorChips}</div>}
        <div className="mt-auto pt-3">
          <Link
            href={fichaHref}
            className="block rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-center text-xs font-medium text-black transition-opacity hover:opacity-85"
          >
            Ver ficha
          </Link>
        </div>
      </div>
    );
  }

  // Tarjetas (por defecto): fila con identidad, sectores y score.
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <Logo size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={fichaHref} className="truncate text-base font-semibold hover:underline">
            {name}
          </Link>
          <span className="font-mono text-xs text-[var(--muted)]">{c.domain}</span>
        </div>
        <div className="mt-1">{meta}</div>
        {sectorChips && <div className="mt-2">{sectorChips}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {scoreEl}
        <Link
          href={fichaHref}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-85"
        >
          Ver ficha
        </Link>
      </div>
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-[var(--soft)]">{label}</span>
      <div className="flex rounded-md border border-[var(--border)] p-0.5">
        {options.map(([val, text]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              value === val
                ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
