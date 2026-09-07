'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// El porqué de una marca en el estudio, editable en el sitio donde se lee.
// Una frase: "referente de cómo se cuenta una red de vendedores", "la que
// más invierte en marca del sector". Es lo que justifica que esté y lo que
// se pierde si lo lleva alguien en la cabeza.
export function NotaMarca({
  cliente,
  marca,
  inicial,
  className = '',
}: {
  cliente: string; // dominio del cliente del estudio
  marca: string;
  inicial: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(inicial ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setTexto(inicial ?? ''), [inicial]);
  useEffect(() => {
    if (!editando) return;
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editando]);

  async function guardar() {
    const nuevo = texto.trim();
    setEditando(false);
    if (nuevo === (inicial ?? '').trim()) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch('/api/estudio/nota', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cliente, marca, nota: nuevo }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setTexto(inicial ?? '');
    } finally {
      setOcupado(false);
    }
  }

  if (editando) {
    return (
      <textarea
        ref={area}
        value={texto}
        rows={2}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTexto(inicial ?? '');
            setEditando(false);
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            guardar();
          }
        }}
        placeholder="por qué está en el estudio"
        className={`block w-full resize-none rounded-md border border-[var(--cta)] bg-[var(--bg)] px-2 py-1 text-xs leading-relaxed outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      disabled={ocupado}
      title="Editar el porqué"
      className={`block w-full text-left text-xs leading-relaxed transition-colors ${
        texto
          ? 'text-[var(--muted)] hover:text-[var(--text)]'
          : 'text-[var(--soft)] hover:text-[var(--muted)]'
      } ${className}`}
    >
      {ocupado ? 'guardando…' : texto || '+ por qué está en el estudio'}
      {error && <span className="ml-2 text-[var(--danger)]">{error}</span>}
    </button>
  );
}
