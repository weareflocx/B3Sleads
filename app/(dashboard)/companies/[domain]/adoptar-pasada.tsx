'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// El botón que convierte un run retenido en lectura de la ficha. No discute
// con el Scanner: su número sigue sin publicarse y el automático sigue
// siendo el que ordena. Lo que hace es lo que ya hacía la curación, pero de
// una vez: apuntar cada componente a esa pasada, firmado, y reversible.
export function AdoptarPasada({
  companyId,
  scanId,
  nota,
  adoptada,
}: {
  companyId: string;
  scanId: string;
  // El score bruto que el Scanner calculó y retuvo.
  nota: number | null;
  // Si todas las selecciones manuales ya apuntan a este run.
  adoptada: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(adopt: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/components/adopt', {
        method: adopt ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, scanId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(json.error ?? 'No se pudo guardar');
      else router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      {adoptada ? (
        <>
          <span className="rounded border border-[var(--cta)]/50 px-1.5 py-0.5 font-mono text-[10px] text-[var(--cta)]">
            lectura adoptada
          </span>
          <button
            onClick={() => go(false)}
            disabled={busy}
            className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
          >
            {busy ? 'volviendo…' : 'volver al automático'}
          </button>
        </>
      ) : (
        <button
          onClick={() => go(true)}
          disabled={busy}
          title="Cada componente que esa pasada detectó pasa a ser la versión curada. El automático no cambia."
          className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)] disabled:opacity-40"
        >
          {busy ? 'adoptando…' : `adoptar esa lectura${nota != null ? ` (${nota})` : ''}`}
        </button>
      )}
      {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}
    </span>
  );
}
