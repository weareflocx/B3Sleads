'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NOTA_MAX } from '@/lib/battle-cards';
import { useEstudioOpcional } from './estudio-estado';

// El porqué de una marca en el estudio, editable en el sitio donde se lee.
// Una frase: "referente de cómo se cuenta una red de vendedores", "la que
// más invierte en marca del sector". Es lo que justifica que esté y lo que
// se pierde si lo lleva alguien en la cabeza.
//
// Se guarda en la ficha de la marca, marca a marca, como el rol o la capa.
// Antes vivía dentro de la composición del estudio, y la siguiente persona
// que añadía una marca desde otra pestaña la borraba sin saberlo.
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
  const estudio = useEstudioOpcional();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(inicial ?? '');
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);

  // Lo de fuera solo entra si NO se está escribiendo. Antes se aplicaba
  // siempre, y cualquier refresco (el sondeo de un scan, un cambio de otra
  // persona) devolvía el campo a lo guardado a mitad de frase.
  useEffect(() => {
    if (!editando) setTexto(inicial ?? '');
  }, [inicial, editando]);

  useEffect(() => {
    if (!editando) return;
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editando]);

  function guardar() {
    const nuevo = texto.replace(/\s+/g, ' ').trim();
    setEditando(false);
    setTexto(nuevo);
    if (nuevo === (inicial ?? '').trim()) return;
    setError(null);
    // Dentro del estudio, por la ficha compartida: se pinta en el acto y el
    // aviso de error sale arriba, junto al resto de guardados. Vacía = borrar.
    if (estudio) {
      estudio.clasificar(marca, { note: nuevo });
      return;
    }
    // Fuera (la ficha de una marca), directo y marca a marca.
    void fetch('/api/estudio/nota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: cliente, marca, nota: nuevo }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? 'No se pudo guardar');
        }
        router.refresh();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'No se pudo guardar');
        setTexto(inicial ?? '');
      });
  }

  if (editando) {
    const quedan = NOTA_MAX - texto.length;
    return (
      <div className={className}>
        <textarea
          ref={area}
          value={texto}
          rows={2}
          maxLength={NOTA_MAX}
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
          className="block w-full resize-none rounded-md border border-[var(--cta)] bg-[var(--bg)] px-2 py-1 text-xs leading-relaxed outline-none"
        />
        {/* Cuánto queda, a partir de que empieza a importar. Un tope que no
            se ve es un campo que "se corta". */}
        {quedan <= 60 && (
          <p
            className="mt-0.5 text-right font-mono text-[10px]"
            style={{ color: quedan <= 10 ? 'var(--warning)' : 'var(--soft)' }}
          >
            {quedan}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title="Editar el porqué"
      className={`block w-full text-left text-xs leading-relaxed transition-colors ${
        texto
          ? 'text-[var(--muted)] hover:text-[var(--text)]'
          : 'text-[var(--soft)] hover:text-[var(--muted)]'
      } ${className}`}
    >
      {texto || '+ por qué está en el estudio'}
      {error && <span className="ml-2 text-[var(--danger)]">{error}</span>}
    </button>
  );
}
