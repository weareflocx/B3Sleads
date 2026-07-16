import { getBriefingLeads } from '@/lib/data';
import { Kanban } from './kanban';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const leads = await getBriefingLeads();
  return (
    <main>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Pipeline</h1>
      <Kanban initial={leads} />
    </main>
  );
}
