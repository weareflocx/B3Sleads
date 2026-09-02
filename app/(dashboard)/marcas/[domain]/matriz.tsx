import type { FilaComponente, PerfilMarca } from '@/lib/benchmark';

// La matriz es el soporte del estudio, no su conclusión. Se lee por filas:
// cada componente, el cliente frente a la media de cada grupo. Barras y no
// números sueltos porque lo que importa es la distancia, no el decimal.
function Barra({ v, destacado }: { v: number | null; destacado?: boolean }) {
  if (v == null) {
    return <span className="font-mono text-[11px] text-[var(--soft)]">sin dato</span>;
  }
  const pct = Math.round(v * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: destacado ? 'var(--cta)' : 'var(--muted)',
          }}
        />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-[var(--muted)]">
        {pct}%
      </span>
    </span>
  );
}

export function Matriz({
  filas,
  cliente,
  grupos,
}: {
  filas: FilaComponente[];
  cliente: string;
  grupos: { nombre: string; perfiles: PerfilMarca[] }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
              Componente
            </th>
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--cta)]">
              {cliente}
            </th>
            {grupos.map((g) => (
              <th
                key={g.nombre}
                className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]"
              >
                {g.nombre}
                <span className="ml-1 opacity-60">({g.perfiles.length})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {filas.map((f) => (
            <tr key={f.key}>
              <td className="px-4 py-2.5 font-medium">{f.label}</td>
              <td className="px-4 py-2.5">
                <Barra v={f.cliente} destacado />
              </td>
              {f.porGrupo.map((g) => (
                <td key={g.nombre} className="px-4 py-2.5">
                  <Barra v={g.media} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
