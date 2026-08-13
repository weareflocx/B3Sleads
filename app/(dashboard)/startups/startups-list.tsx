'use client';

import { useState } from 'react';
import Link from 'next/link';
import { companyLabel, displayName, stageLabel } from '@/lib/types';
import type { BriefingLead } from '@/lib/types';
import { ScoreRing } from '../score-ring';
import { CompanyLogo } from '../company-logo';

// Catálogo de marcas con controles: ordenar por score B3S o por recientes,
// y verlo en tarjetas, lista o cuadrícula. Una tarjeta por startup.
type Sort = 'score' | 'recientes';
type View = 'tarjetas' | 'lista' | 'cuadricula';

export function StartupsList({ items }: { items: BriefingLead[] }) {
  const [sort, setSort] = useState<Sort>('score');
  const [view, setView] = useState<View>('tarjetas');

  const scoreOf = (bl: BriefingLead) =>
    bl.scan?.status === 'ready' && bl.scan.score != null ? Number(bl.scan.score) : -1;

  const sorted = [...items].sort((a, b) =>
    sort === 'score'
      ? scoreOf(b) - scoreOf(a)
      : b.lead.updated_at.localeCompare(a.lead.updated_at),
  );
  const variant: View = view;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          label="Orden"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            ['score', 'Score B3S'],
            ['recientes', 'Recientes'],
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
            <StartupCard key={bl.company!.domain} bl={bl} variant="cuadricula" />
          ))}
        </div>
      ) : (
        <div className={view === 'lista' ? 'space-y-2' : 'space-y-3'}>
          {sorted.map((bl) => (
            <StartupCard key={bl.company!.domain} bl={bl} variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
}

function StartupCard({ bl, variant }: { bl: BriefingLead; variant: View }) {
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

  const scoreEl =
    score != null ? (
      <ScoreRing score={score} size={variant === 'lista' ? 26 : 30} />
    ) : (
      <span className="shrink-0 text-xs text-[var(--muted)]">{scanning ? 'escaneando…' : 'sin scan'}</span>
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
