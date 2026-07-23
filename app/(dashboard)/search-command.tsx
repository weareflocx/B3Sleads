'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/lib/search';
import { IconSearch, IconBuilding, IconFounders } from './nav-icons';
import { ScoreRing } from './score-ring';
import { Avatar } from './avatar';

// Buscador global de startups y founders. Se abre con Cmd/Ctrl+K o desde el
// menú. El trigger se adapta al menú: caja con placeholder cuando está
// expandido, solo la lupa cuando está comprimido.
export function SearchCommand({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atajo global de teclado.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setHits([]);
      setActive(0);
      // El foco tras el paint, cuando el input ya existe.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Búsqueda con debounce.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = await res.json();
        setHits(json.hits ?? []);
        setActive(0);
      } catch {
        /* abortado o error de red: se deja lo que hubiera */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      if (!hit.href) return;
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  const companies = hits.filter((h) => h.kind === 'company');
  const founders = hits.filter((h) => h.kind === 'founder');

  return (
    <>
      {collapsed ? (
        <button
          onClick={() => setOpen(true)}
          title="Buscar (⌘K)"
          aria-label="Buscar"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--nav-active-bg)] hover:text-[var(--text)]"
        >
          <IconSearch size={18} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-left text-sm text-[var(--soft)] transition-colors hover:border-[var(--muted)]"
        >
          <IconSearch size={15} />
          <span className="flex-1">Buscar…</span>
          <kbd className="rounded border border-[var(--border)] px-1 font-mono text-[10px] text-[var(--muted)]">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5">
              <IconSearch size={17} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Buscar startups y founders…"
                className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-[var(--soft)]"
              />
              {loading && <span className="text-xs text-[var(--soft)]">…</span>}
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {q.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--soft)]">
                  Escribe para buscar en el radar.
                </p>
              ) : hits.length === 0 && !loading ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--soft)]">
                  Nada con “{q.trim()}”.
                </p>
              ) : (
                <>
                  {companies.length > 0 && (
                    <Group label="Startups">
                      {companies.map((h) => (
                        <Row
                          key={`c-${h.href}`}
                          hit={h}
                          activeHit={hits[active]}
                          onSelect={go}
                        />
                      ))}
                    </Group>
                  )}
                  {founders.length > 0 && (
                    <Group label="Founders">
                      {founders.map((h, i) => (
                        <Row
                          key={`f-${h.href}-${i}`}
                          hit={h}
                          activeHit={hits[active]}
                          onSelect={go}
                        />
                      ))}
                    </Group>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  hit,
  activeHit,
  onSelect,
}: {
  hit: SearchHit;
  activeHit: SearchHit | undefined;
  onSelect: (h: SearchHit) => void;
}) {
  const isActive = activeHit === hit;
  const disabled = !hit.href;
  return (
    <button
      onClick={() => onSelect(hit)}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${
        isActive ? 'bg-[var(--nav-active-bg)]' : 'hover:bg-[var(--nav-active-bg)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {hit.kind === 'company' ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
          <IconBuilding size={15} />
        </span>
      ) : (
        <Avatar name={hit.name} size={28} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{hit.name}</span>
        <span className="block truncate font-mono text-xs text-[var(--muted)]">
          {hit.kind === 'company'
            ? hit.domain
            : [hit.role, hit.company].filter(Boolean).join(' · ') || 'founder'}
        </span>
      </span>
      {hit.kind === 'company' && hit.score != null && <ScoreRing score={hit.score} size={26} />}
    </button>
  );
}
