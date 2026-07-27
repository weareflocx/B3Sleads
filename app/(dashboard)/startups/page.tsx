import { PAGE } from '@/app/(dashboard)/page-width';
import { getStartups } from '@/lib/data';
import { ImportBox } from '../import-box';
import { StartupsList } from './startups-list';

export const dynamic = 'force-dynamic';

// Catálogo brand-first: todas las startups (una por marca) con su score B3S,
// sector y founder, independientes del stage. El alta por dominio vive aquí
// además de en Briefing; el trabajo por etapa sigue en Pipeline.
export default async function StartupsPage() {
  const startups = await getStartups();

  return (
    <main className={`${PAGE} space-y-6`}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Startups</h1>
        <span className="text-sm text-[var(--muted)]">
          {startups.length} {startups.length === 1 ? 'marca' : 'marcas'}
        </span>
      </div>

      <ImportBox />

      {startups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          Sin startups todavía. Añade una por dominio arriba o espera al pipeline nocturno.
        </p>
      ) : (
        <StartupsList items={startups} />
      )}
    </main>
  );
}
