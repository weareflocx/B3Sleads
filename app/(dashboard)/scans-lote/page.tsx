import { PAGE } from '@/app/(dashboard)/page-width';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { normalizarDominio } from '@/lib/dominio';
import { LoteScans, type MarcaLote } from './lote-scans';

export const dynamic = 'force-dynamic';

// Escanear una lista de marcas de una vez y el mismo día, para que las notas
// sean comparables (informes, rankings). Cada scan pasa por /api/scans/launch,
// igual que el botón de la ficha: mismo token, mismas reglas, y el scan queda
// enlazado a la marca y a su lead.
export default async function ScansLotePage({ searchParams }: { searchParams: Promise<{ dominios?: string }> }) {
  const { dominios: crudo = '' } = await searchParams;
  const pedidos = [
    ...new Set(
      crudo
        .split(/[\s,;]+/)
        .map((d) => normalizarDominio(d))
        .filter((d): d is string => !!d),
    ),
  ];

  let marcas: MarcaLote[] = [];
  if (pedidos.length && !isDemoMode()) {
    const db = getServiceSupabase()!;
    const { data: companies } = await db.from('companies').select('id, name, domain').in('domain', pedidos);
    const ids = (companies ?? []).map((c) => c.id as string);
    const [{ data: leads }, { data: scans }] = await Promise.all([
      db.from('leads').select('id, company_id').in('company_id', ids.length ? ids : ['-']),
      db
        .from('scans')
        .select('company_id, score, created_at, status')
        .in('company_id', ids.length ? ids : ['-'])
        .order('created_at', { ascending: false }),
    ]);
    marcas = pedidos.map((domain) => {
      const c = (companies ?? []).find((x) => x.domain === domain);
      const ultimo = c ? (scans ?? []).find((s) => s.company_id === c.id && s.status === 'ready') : null;
      return {
        domain,
        companyId: (c?.id as string) ?? null,
        name: (c?.name as string) ?? null,
        leadId: c ? ((leads ?? []).find((l) => l.company_id === c.id)?.id as string | undefined) ?? null : null,
        ultimaNota: (ultimo?.score as number | null) ?? null,
        ultimaFecha: (ultimo?.created_at as string | undefined) ?? null,
      };
    });
  }

  return (
    <main className={PAGE}>
      <h1 className="text-2xl font-bold tracking-tight">Escanear en lote</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--muted)]">
        Todas las marcas el mismo día y con la misma versión del Scanner, para que sus notas se puedan comparar. Cada
        scan consume cuota.
      </p>
      <form method="get" className="mb-8 space-y-2">
        <textarea
          name="dominios"
          defaultValue={pedidos.join('\n')}
          rows={6}
          placeholder={'un dominio por línea\nqilimanjaro.tech\nallox.bio'}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-sm outline-none focus:border-[var(--cta)]"
        />
        <button className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--muted)]">
          Comprobar marcas
        </button>
      </form>
      {pedidos.length > 0 && <LoteScans marcas={marcas} />}
    </main>
  );
}
