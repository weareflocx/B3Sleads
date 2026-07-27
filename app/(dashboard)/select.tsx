'use client';

import { useEffect, useRef, useState } from 'react';

// Selector propio, con el diseño del producto (superficie, borde, check en la
// opción activa, chevron) en vez del <select> nativo que se ve "de sistema".
// Accesible: teclado (flechas, Enter, Esc), cierre al hacer clic fuera.
export type SelectOption = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  align = 'right',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, value, options]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[active];
      if (opt) choose(opt.value);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
        className={`flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--text)] transition-colors hover:border-[var(--muted)] focus:border-[var(--cta)] focus:outline-none disabled:opacity-50 ${className}`}
      >
        <span className="truncate">{current?.label ?? '—'}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={`shrink-0 text-[var(--muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute z-50 mt-1 max-h-72 min-w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ animation: 'b3s-pop 130ms cubic-bezier(0.23, 1, 0.32, 1)', transformOrigin: 'top' }}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
                    i === active ? 'bg-[var(--surface-2)]' : ''
                  } ${selected ? 'font-medium text-[var(--cta)]' : 'text-[var(--text)]'}`}
                >
                  <span className="w-3 shrink-0 text-center">{selected ? '✓' : ''}</span>
                  <span className="truncate whitespace-nowrap">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
