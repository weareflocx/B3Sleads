'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizarDominio } from '@/lib/dominio';

// "Añadir como lead" para una ronda de la prensa que aún no está en la base.
// La noticia no trae el dominio, así que se pide. Respeta la dedup por
// dominio: si la marca ya es lead, abre su ficha en vez de crear otra. No
// lanza scan: entra en Detectado con la ronda "sin confirmar" y la noticia
// como fuente, por la misma vía que la subida en lote.
export function AnadirComoLead({ fuente, fecha }: { fuente: string; fecha: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dominio, setDominio] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function anadir() {
    const d = normalizarDominio(dominio);
    if (!d) return setAviso('Eso no es un dominio (marca.com).');
    setOcupado(true);
    setAviso(null);
    try {
      const post = (body: unknown) =>
        fetch('/api/leads/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
          async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
            return j;
          },
        );
      const c = (await post({ accion: 'comprobar', dominios: [d], handles: [] })) as { existentes: { dominio: string; esLead: boolean }[] };
      if (c.existentes.some((x) => x.dominio === d && x.esLead)) {
        setAviso('Ya estaba en la base: abro su ficha.');
        router.push(`/companies/${d}`);
        return;
      }
      const fechaIso = fecha && !Number.isNaN(Date.parse(fecha)) ? fecha.slice(0, 10) : null;
      const r = (await post({
        accion: 'importar',
        origen: 'rondas',
        filas: [
          {
            n: 1,
            dominioRaw: d,
            dominio: d,
            marca: null,
            fundadores: [],
            sector: null,
            ronda: fechaIso ? { importe: null, fecha: fechaIso, tipo: null } : null,
            fuente,
            pais: null,
            ciudad: null,
            errores: [],
            avisos: [],
            repetidaDe: null,
          },
        ],
      })) as { resultados: { estado: string; detalle: string }[] };
      const res = r.resultados[0];
      if (res?.estado === 'error') throw new Error(res.detalle);
      router.push(`/companies/${d}`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo añadir.');
    } finally {
      setOcupado(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--muted)]"
      >
        Añadir como lead
      </button>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        <input
          autoFocus
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anadir()}
          placeholder="dominio de la marca"
          aria-label="Dominio de la marca"
          className="w-40 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-xs outline-none focus:border-[var(--cta)]"
        />
        <button
          onClick={anadir}
          disabled={ocupado || !dominio.trim()}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--muted)] disabled:opacity-40"
        >
          {ocupado ? 'Añadiendo…' : 'Añadir'}
        </button>
      </span>
      {aviso && <span className="text-[11px] text-[var(--muted)]">{aviso}</span>}
    </span>
  );
}
