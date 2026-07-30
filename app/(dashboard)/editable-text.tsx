'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Edición inline sutil de un nombre (compañía o founder). En reposo no mancha:
// solo el texto y un lápiz tenue que aparece al pasar el ratón. Al pulsar, el
// propio texto se vuelve un input del mismo tamaño. Enter guarda, Esc cancela,
// y al perder el foco también guarda.
export function EditableText({
  initial,
  kind,
  id,
  as = 'span',
  className = '',
  label = 'Editar',
  field = 'name',
  placeholder,
}: {
  initial: string;
  kind: 'company' | 'contact';
  id: string;
  // Qué se edita. 'name' es el nombre (compañía o founder); 'role', el cargo.
  field?: 'name' | 'role';
  // Para campos que pueden estar vacíos: qué invitar a escribir.
  placeholder?: string;
  as?: 'h1' | 'span';
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    if (!editing) return;
    // Enfocar y seleccionar son dos cosas: en un campo vacío (un cargo que
    // aún no está) select() no tiene nada que seleccionar y el foco no llega,
    // así que se escribía al vacío.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  async function save() {
    const next = value.trim();
    setEditing(false);
    // El nombre no puede quedarse vacío; el cargo sí (se borra).
    if (next === initial || (!next && field === 'name')) {
      setValue(initial);
      return;
    }
    setSaving(true);
    const endpoint = kind === 'company' ? '/api/companies' : '/api/contacts';
    const body =
      kind === 'company'
        ? { companyId: id, name: next }
        : field === 'role'
          ? { contactId: id, role: next }
          : { contactId: id, full_name: next };
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
      else setValue(initial);
    } catch {
      setValue(initial);
    } finally {
      setSaving(false);
    }
  }

  const Tag = as;

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setValue(initial);
            setEditing(false);
          }
        }}
        // Hereda el tamaño/peso del texto; solo una línea inferior sutil.
        className={`${className} w-full max-w-full border-b border-[var(--cta)] bg-transparent p-0 outline-none`}
      />
    );
  }

  return (
    <Tag className={`group inline-flex items-center gap-2 ${className}`}>
      <span className={`${saving ? 'opacity-50' : ''} ${!value ? 'text-[var(--soft)]' : ''}`}>
        {value || placeholder}
      </span>
      <button
        onClick={() => setEditing(true)}
        title={label}
        aria-label={label}
        className="shrink-0 text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
      >
        <svg width="0.6em" height="0.6em" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Tag>
  );
}
