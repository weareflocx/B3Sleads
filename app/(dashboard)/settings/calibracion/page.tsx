import { PAGE } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import {
  calibrationByDimension,
  componentVersions,
  globalScoreDeviation,
  isUsableRun,
} from '@/lib/scan-versions';
import type { Scan } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Calibración del Scanner. No mide marcas: mide el instrumento. Con varias
// pasadas por empresa se ve qué dimensiones de la rúbrica son inestables, que
// es lo que dice qué arreglar del Scanner y en qué orden.
export default async function CalibracionPage() {
  if (isDemoMode()) {
    return (
      <main className={PAGE}>
        <h1 className="text-2xl font-bold tracking-tight">Calibración</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">Sin datos en modo demo.</p>
      </main>
    );
  }

  const db = getServiceSupabase()!;
  const { data } = await db.from('scans').select('*').order('created_at', { ascending: false });
  const scans = (data as Scan[] | null) ?? [];

  // Agrupar por empresa: la dispersión solo tiene sentido dentro de una marca.
  const byCompany = new Map<string, Scan[]>();
  for (const s of scans) {
    if (!s.company_id) continue;
    byCompany.set(s.company_id, [...(byCompany.get(s.company_id) ?? []), s]);
  }

  // La calibración mide la estabilidad de lo que el Scanner DA por bueno. Las
  // pasadas retenidas se pueden leer y curar en la ficha, pero aquí no
  // entran: medir la varianza con lecturas que el propio Scanner descartó
  // sería medir otra cosa.
  const perCompany = [...byCompany.values()].map((list) => componentVersions(list.filter(isUsableRun)));
  const rows = calibrationByDimension(perCompany);

  const { deviation, pairs } = globalScoreDeviation(
    [...byCompany.values()].map((list) => ({
      scores: list
        .filter(isUsableRun)
        .map((s) => ({ score: Number(s.score), at: s.created_at })),
    })),
  );

  const fallidos = scans.filter((s) => s.status === 'ready' && (s.score == null || Number(s.score) === 0));
  const conVarias = [...byCompany.values()].filter((l) => l.filter(isUsableRun).length >= 2).length;

  // Mientras la desviación esté por encima de 5, el score se comunica al
  // founder como banda, no como número exacto.
  const bandaObligatoria = deviation != null && deviation > 5;

  return (
    <main className={`${PAGE} space-y-8`}>
      <div>
        <Link href="/settings" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Ajustes
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Calibración del Scanner</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Esto no mide marcas, mide el instrumento. Una dimensión con desviación alta tiene un
          problema de rúbrica o de prompt, no de marca.
        </p>
      </div>

      {/* §8.2 — el número que gobierna la calibración */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
          Desviación global · runs de la misma marca en menos de 7 días
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <span
            className={`font-mono text-3xl ${
              deviation == null
                ? 'text-[var(--muted)]'
                : deviation <= 3
                  ? 'text-[var(--cta)]'
                  : deviation <= 5
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--accent)]'
            }`}
          >
            {deviation ?? '—'}
          </span>
          <span className="text-sm text-[var(--muted)]">
            objetivo ±3 · {pairs} {pairs === 1 ? 'par comparado' : 'pares comparados'}
          </span>
        </div>
        {bandaObligatoria && (
          <p className="mt-2 text-xs text-[var(--warning)]">
            Por encima de 5: el score se comunica al founder como banda, no como número exacto.
          </p>
        )}
      </section>

      {/* §8.1 — dispersión por dimensión */}
      <section>
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Dispersión por dimensión ({conVarias} marcas con 2 o más escaneos)
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            Aún no hay marcas con dos escaneos válidos. La dispersión necesita al menos dos pasadas.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                  <th className="px-4 py-2.5 font-normal">Dimensión</th>
                  <th className="px-4 py-2.5 font-normal">Desviación media</th>
                  <th className="px-4 py-2.5 font-normal">Rango medio</th>
                  <th className="px-4 py-2.5 font-normal">Tasa de detección</th>
                  <th className="px-4 py-2.5 font-normal">Marcas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td
                      className={`px-4 py-2.5 font-mono ${
                        r.avgStdev == null
                          ? 'text-[var(--soft)]'
                          : r.avgStdev >= 2
                            ? 'text-[var(--accent)]'
                            : r.avgStdev >= 1.2
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--cta)]'
                      }`}
                    >
                      {r.avgStdev ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--muted)]">{r.avgRange ?? '—'}</td>
                    <td
                      className={`px-4 py-2.5 font-mono ${
                        r.detectionRate < 0.7 ? 'text-[var(--warning)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      {Math.round(r.detectionRate * 100)}%
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--soft)]">{r.companies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--soft)]">
          Ordenado por inestabilidad: lo de arriba es la cola de trabajo del Scanner.
        </p>
      </section>

      {/* §8.3 — sesgo de curación. Se muestra desde el día uno, aunque hoy sea
          cero: la curación todavía no está enchufada (falta la migración). */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
          Sesgo de curación · media(consolidado − automático)
        </p>
        <p className="mt-2 font-mono text-2xl text-[var(--muted)]">—</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Sin fichas curadas todavía. Si esta diferencia se vuelve sistemáticamente positiva y mayor
          de 5 puntos, la curación está sesgando al alza y hay que revisar el criterio.
        </p>
      </section>

      {/* Runs que no cuentan */}
      <section>
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Runs fallidos ({fallidos.length})
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {fallidos.length === 0
            ? 'Ningún run con score 0 o nulo. No hay fallos de adquisición guardados como puntuación.'
            : 'Un fallo de adquisición no es un cero: estos runs quedan fuera de medias, rankings y versiones seleccionables.'}
        </p>
      </section>
    </main>
  );
}
