'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// Envuelve un avatar o un logo y le añade edición sutil: en reposo no se ve
// nada, al pasar el ratón aparece un lápiz pequeño en la esquina, y al
// pulsarlo se abre un campo para pegar la URL de la imagen. Vaciarlo la
// quita y devuelve el monograma.
//
// Se pega a mano a propósito: traer la foto de LinkedIn de forma
// programática sería scraping (spec §9).
type Target =
  | { kind: 'contact'; id: string }
  | { kind: 'company'; id: string }
  | { kind: 'investor'; slug: string };

export function EditableImage({
  target,
  initial,
  children,
  label = 'Cambiar imagen',
}: {
  target: Target;
  initial: string | null;
  children: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(initial ?? ''), [initial]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const next = value.trim();
    // Solo http(s): pegar otra cosa (javascript:, data:) no tiene sentido
    // aquí y evita meter en el DOM algo que no sea una imagen remota.
    if (next && !/^https?:\/\//i.test(next)) {
      setError('Pega una URL que empiece por https://');
      return;
    }
    setError(null);
    if (next === (initial ?? '')) {
      setEditing(false);
      return;
    }

    setBusy(true);
    const endpoint =
      target.kind === 'company'
        ? '/api/companies'
        : target.kind === 'contact'
          ? '/api/contacts'
          : '/api/investors';
    const body =
      target.kind === 'company'
        ? { companyId: target.id, logo_url: next || null }
        : target.kind === 'contact'
          ? { contactId: target.id, avatar_url: next || null }
          : { slug: target.slug, logoUrl: next };

    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError('No se pudo guardar');
      }
    } catch {
      setError('No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="group/img relative inline-block">
      <span className={busy ? 'opacity-50' : undefined}>{children}</span>

      <button
        onClick={() => setEditing((v) => !v)}
        title={label}
        aria-label={label}
        className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--text)] group-hover/img:opacity-100 focus:opacity-100"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {editing && (
        <span className="absolute left-0 top-full z-20 mt-2 flex w-72 max-w-[80vw] flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setValue(initial ?? '');
                setError(null);
                setEditing(false);
              }
            }}
            placeholder="pega la URL de la imagen"
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs outline-none focus:border-[var(--cta)]"
          />
          <span className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-[var(--cta)] px-2 py-1 text-xs font-medium text-[var(--cta-text)] disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => {
                setValue(initial ?? '');
                setError(null);
                setEditing(false);
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              Cancelar
            </button>
            {initial && (
              <button
                onClick={() => {
                  setValue('');
                  inputRef.current?.focus();
                }}
                className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--danger)]"
              >
                Quitar
              </button>
            )}
          </span>
          <span className="text-[10px] leading-snug text-[var(--soft)]">
            {error ?? 'Clic derecho sobre la foto en LinkedIn → copiar dirección de la imagen.'}
          </span>
        </span>
      )}
    </span>
  );
}
