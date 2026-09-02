'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serializeGrupos, type Grupo } from '@/lib/benchmark';

// Crear un grupo es una caja más en la parrilla, junto a los existentes: así
// el gesto de "otro grupo" vive donde vive el resultado del anterior.
export function NuevoGrupo({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [nombre, setNombre] = useState('');
  const crear = () => {
    const n = nombre.trim();
    if (!n || grupos.some((g) => g.nombre === n)) return;
    setNombre('');
    router.replace(`${pathname}?g=${serializeGrupos([...grupos, { nombre: n, dominios: [] }])}`);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-3">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="Nuevo grupo: Energéticas, Telco, Multinivel…"
        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]"
      />
      <button
        onClick={crear}
        disabled={!nombre.trim()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
      >
        Crear
      </button>
    </div>
  );
}
