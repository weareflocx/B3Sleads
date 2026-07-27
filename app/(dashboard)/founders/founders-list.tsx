'use client';

import { useState } from 'react';
import { FounderRow } from './founder-row';
import type { BriefingLead } from '@/lib/types';
import type { Temperature } from '@/lib/scoring';

// La cola de founders con controles: ordenar por prioridad (temperatura viva)
// o por recientes (última actividad), y verla en tarjetas, lista o cuadrícula.
// El servidor precalcula opener/prompt/temp y los pasa ya listos.
export type FounderItem = {
  key: string;
  initial: BriefingLead;
  opener: string | null;
  draftPrompt: string | null;
  temp: Temperature;
  updatedAt: string;
  conversation?: boolean;
};

type Sort = 'prioridad' | 'recientes';
type View = 'tarjetas' | 'lista' | 'cuadricula';

export function FoundersList({ items }: { items: FounderItem[] }) {
  const [sort, setSort] = useState<Sort>('prioridad');
  const [view, setView] = useState<View>('tarjetas');

  const sorted = [...items].sort((a, b) =>
    sort === 'prioridad' ? b.temp.score - a.temp.score : b.updatedAt.localeCompare(a.updatedAt),
  );
  const variant = view === 'lista' ? 'list' : view === 'cuadricula' ? 'grid' : 'card';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          label="Orden"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            ['prioridad', 'Prioridad'],
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
          {sorted.map((it) => (
            <FounderRow key={it.key} variant="grid" {...rowProps(it)} />
          ))}
        </div>
      ) : (
        <div className={view === 'lista' ? 'space-y-2' : 'space-y-3'}>
          {sorted.map((it) => (
            <FounderRow key={it.key} variant={variant} {...rowProps(it)} />
          ))}
        </div>
      )}
    </div>
  );
}

function rowProps(it: FounderItem) {
  return {
    initial: it.initial,
    opener: it.opener,
    draftPrompt: it.draftPrompt,
    temp: it.temp,
    conversation: it.conversation,
  };
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
