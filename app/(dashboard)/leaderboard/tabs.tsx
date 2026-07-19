'use client';

import { useState, type ReactNode } from 'react';

// Selector de ranking. El contenido llega renderizado del servidor;
// aquí solo se elige qué tabla se ve.
export function LeaderTabs({
  tabs,
}: {
  tabs: { key: string; label: string; hint: string; content: ReactNode }[];
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
                ? 'border-[var(--cta)] bg-[var(--cta)]/10 font-medium text-[var(--cta)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">{current?.hint}</p>
      <div className="mt-4">{current?.content}</div>
    </div>
  );
}
