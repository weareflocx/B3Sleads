import { getBriefingLeads } from '@/lib/data';
import { PAGE_WIDE } from '../page-width';
import { Kanban } from './kanban';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const leads = await getBriefingLeads();
  return (
    <main className={PAGE_WIDE}>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Pipeline</h1>
      <Kanban initial={leads} />
    </main>
  );
}
