'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// Mismo gesto que EditableText, pero para cualquier campo de la ficha del
// fondo: en reposo solo se ve el valor (o un hueco tenue si está vacío), y
// el lápiz aparece al pasar el ratón. La diferencia es que aquí un campo
// vacío tiene que invitar a rellenarse: un fondo recién descubierto no
// tiene web ni tesis, y esa es justo la información que hay que capturar.
export function InvestorField({
  slug,
  field,
  initial,
  placeholder,
  multiline = false,
  render,
}: {
  slug: string;
  field: 'website' | 'thesis' | 'hq' | 'linkedinUrl' | 'notes' | 'name';
  initial: string;
  placeholder: string;
  multiline?: boolean;
  render?: (value: string) => ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function save() {
    const next = value.trim();
    setEditing(false);
    if (next === initial.trim()) {
      setValue(initial);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/investors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, [field]: next }),
      });
      if (res.ok) router.refresh();
      else setValue(initial);
    } catch {
      setValue(initial);
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    'w-full rounded-md border border-[var(--cta)] bg-[var(--bg)] px-2 py-1 text-sm outline-none';

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref}
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(initial);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={`${fieldClass} resize-y`}
      />
    ) : (
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setValue(initial);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={fieldClass}
      />
    );
  }

  const filled = Boolean(value.trim());

  return (
    <span className="group inline-flex max-w-full items-start gap-2">
      {filled ? (
        <span className={saving ? 'opacity-50' : ''}>{render ? render(value) : value}</span>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-sm text-[var(--soft)] underline decoration-dotted underline-offset-4 hover:text-[var(--cta)]"
        >
          {placeholder}
        </button>
      )}
      {filled && (
        <button
          onClick={() => setEditing(true)}
          title="Editar"
          aria-label={`Editar ${field}`}
          className="mt-0.5 shrink-0 text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
