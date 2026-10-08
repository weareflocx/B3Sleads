'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function enviar(url: string, method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return json.error ?? `Error ${res.status}`;
  } catch {
    return 'Sin conexión con el servidor.';
  }
}

// La marca tiene leads repetidos (lib/unir-leads.ts): se avisa arriba de la
// ficha, que si no la marca sale dos veces en la cola y el kanban.
export function AvisoDuplicados({ companyId, duplicados }: { companyId: string; duplicados: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function unir() {
    setBusy(true);
    setAviso(null);
    const error = await enviar('/api/leads/unir', 'POST', { companyId });
    setBusy(false);
    if (error) return setAviso(`No se pudo unir: ${error}`);
    router.refresh();
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/5 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        Esta marca está duplicada: tiene {duplicados === 1 ? 'un lead de más' : `${duplicados} leads de más`} (sin founder o
        del mismo founder). Por eso sale dos veces en la cola y el kanban.
        {aviso && <span className="block text-xs text-[var(--danger)]">{aviso}</span>}
      </span>
      <button
        onClick={unir}
        disabled={busy}
        title="La bitácora y los mensajes pasan al lead que se queda, con la etapa más avanzada"
        className="shrink-0 rounded-md border border-[var(--cta)]/50 px-3 py-1.5 text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-50"
      >
        {busy ? 'Uniendo…' : 'Unir en uno'}
      </button>
    </div>
  );
}

// Borrar la marca entera. Irreversible, así que se confirma escribiendo el
// dominio, y antes se ofrece lo que casi siempre basta: descartarla.
export function EliminarMarca({ companyId, domain }: { companyId: string; domain: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const coincide = texto.trim().toLowerCase() === domain.toLowerCase();

  async function eliminar() {
    setBusy(true);
    setAviso(null);
    const error = await enviar('/api/companies', 'DELETE', { companyId, confirmDomain: texto });
    setBusy(false);
    if (error) return setAviso(error);
    router.push('/marcas');
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-xs text-[var(--muted)] underline-offset-2 transition-colors hover:text-[var(--danger)] hover:underline"
      >
        Eliminar marca…
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--danger)]/40 p-4 text-sm">
      <p>
        Se borra la marca y todo lo suyo: leads, founders, bitácora, mensajes, señales, scans y estudio. No se puede
        deshacer. Si solo no encaja, mejor descártala en Seguimiento.
      </p>
      <label className="mt-3 block text-xs text-[var(--muted)]">
        Escribe <span className="font-mono text-[var(--text)]">{domain}</span> para confirmar
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-sm outline-none focus:border-[var(--danger)]"
        />
      </label>
      {aviso && <p className="mt-2 text-xs text-[var(--danger)]">{aviso}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={eliminar}
          disabled={!coincide || busy}
          className="rounded-md border border-[var(--danger)]/60 px-3 py-1.5 text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10 disabled:opacity-40"
        >
          {busy ? 'Eliminando…' : 'Eliminar para siempre'}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setTexto('');
            setAviso(null);
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--muted)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
