import { PAGE } from '@/app/(dashboard)/page-width';
import { getBriefingLeads } from '@/lib/data';
import { LeadCard } from './lead-card';

export const dynamic = 'force-dynamic';

export default async function BriefingPage() {
  const leads = await getBriefingLeads();
  // El briefing muestra leads cualificados: con empresa (ficha + Scanner).
  // Los founders sueltos sin empresa viven en /founders hasta tener dominio.
  const active = leads.filter(
    (l) => ['detected', 'briefed'].includes(l.lead.stage) && l.company,
  );

  return (
    <main className={PAGE}>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Briefing de las 9:00</h1>
        <span className="text-sm text-[var(--muted)]">
          {active.length} {active.length === 1 ? 'lead' : 'leads'} en cola
        </span>
      </div>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          Nada en cola. El pipeline nocturno traerá candidatos nuevos, o añade founders desde
          Founders.
        </p>
      ) : (
        <div className="space-y-4">
          {active.map((bl) => (
            <LeadCard key={bl.lead.id} initial={bl} />
          ))}
        </div>
      )}
    </main>
  );
}
