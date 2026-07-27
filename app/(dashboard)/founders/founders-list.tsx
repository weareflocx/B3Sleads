'use client';

import { useState } from 'react';
import { FounderRow } from './founder-row';
import type { BriefingLead } from '@/lib/types';
import type { Temperature } from '@/lib/scoring';

// Toda la sección Founders bajo un mismo control: ordenar por prioridad
// (temperatura viva = etapa + si está caliente + oportunidad) o por recientes
// (última actividad), y verla en cards o en listado compacto. El servidor
// precalcula opener/prompt/temp y los pasa ya listos.
export type FounderItem = {
  key: string;
  initial: BriefingLead;
  opener: string | null;
  draftPrompt: string | null;
  temp: Temperature;
  updatedAt: string;
};

type Sort = 'prioridad' | 'recientes';
type View = 'cards' | 'lista';

export function FoundersBoard({
  conversations,
  queue,
}: {
  conversations: FounderItem[];
  queue: FounderItem[];
}) {
  const [sort, setSort] = useState<Sort>('prioridad');
  const [view, setView] = useState<View>('cards');

  const sortItems = (items: FounderItem[]) =>
    [...items].sort((a, b) =>
      sort === 'prioridad' ? b.temp.score - a.temp.score : b.updatedAt.localeCompare(a.updatedAt),
    );
  const variant = view === 'lista' ? 'list' : 'card';

  const renderList = (items: FounderItem[], conversation: boolean) => (
    <div className={view === 'lista' ? 'space-y-2' : 'space-y-3'}>
      {sortItems(items).map((it) => (
        <FounderRow
          key={it.key}
          variant={variant}
          initial={it.initial}
          opener={it.opener}
          draftPrompt={it.draftPrompt}
          temp={it.temp}
          conversation={conversation}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
            ['cards', 'Cards'],
            ['lista', 'Listado'],
          ]}
        />
      </div>

      {conversations.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--success)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
            En conversación ({conversations.length}) — te respondieron por privado
          </h2>
          {renderList(conversations, true)}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Cola de contacto en frío ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
            Nadie en cola. Añade founders desde el Briefing o espera al pipeline nocturno.
          </p>
        ) : (
          renderList(queue, false)
        )}
      </section>
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
