'use client';

import { useEffect, useState } from 'react';

// Toggle claro/oscuro, igual que el de Brand3 Scanner. Persiste en localStorage.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('b3s-theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('b3s-theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      className="min-h-[30px] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--nav-active-border)] hover:text-[var(--accent)]"
      title="Cambiar tema"
    >
      {dark ? 'light' : 'dark'}
    </button>
  );
}
