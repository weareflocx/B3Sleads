'use client';

import { useEffect, useState } from 'react';

// Personalización: tema de la interfaz. Misma persistencia que el toggle
// del header (localStorage b3s-theme + data-theme en <html>).
export function ThemeCard() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(localStorage.getItem('b3s-theme') === 'dark' ? 'dark' : 'light');
  }, []);

  function apply(next: 'light' | 'dark') {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('b3s-theme', next);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-semibold">Personalización</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Tema de la interfaz.</p>
      <div className="mt-3 flex gap-2">
        {(['light', 'dark'] as const).map((t) => (
          <button
            key={t}
            onClick={() => apply(t)}
            className={`rounded-md border px-3.5 py-1.5 text-sm transition-colors ${
              theme === t
                ? 'border-[var(--cta)] bg-[var(--cta)]/10 font-medium text-[var(--cta)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
            }`}
          >
            {t === 'light' ? 'Claro' : 'Oscuro'}
          </button>
        ))}
      </div>
    </div>
  );
}
