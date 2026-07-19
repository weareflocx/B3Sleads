import Link from 'next/link';
import { getBriefingLeads } from '@/lib/data';
import { leadTemperature } from '@/lib/scoring';
import { displayName, companyLabel } from '@/lib/types';
import { Heat } from '../heat';
import { ScoreRing } from '../score-ring';

export const dynamic = 'force-dynamic';

// Home del dashboard: banner + el estado de cada sección de un vistazo,
// y los leads más calientes para saber a quién escribir hoy.
export default async function HomePage() {
  const leads = await getBriefingLeads();

  const conversations = leads.filter((l) =>
    ['conversation', 'call', 'proposal'].includes(l.lead.stage),
  );
  const queue = leads.filter(
    (l) => l.contact?.linkedin_url && ['detected', 'briefed'].includes(l.lead.stage),
  );
  const contacted = leads.filter((l) => l.lead.stage === 'contacted');
  const won = leads.filter((l) => l.lead.stage === 'won');
  const sinScan = leads.filter(
    (l) => l.company && (!l.scan || l.scan.status !== 'ready') && !['discarded', 'won', 'lost'].includes(l.lead.stage),
  );

  // Leads más calientes (activos), por temperatura viva
  const hottest = leads
    .filter((l) => !['discarded', 'won', 'lost'].includes(l.lead.stage))
    .map((bl) => ({ bl, temp: leadTemperature(bl) }))
    .sort((a, b) => b.temp.score - a.temp.score)
    .slice(0, 3);

  const sections = [
    {
      href: '/briefing',
      title: 'Briefing',
      value: queue.length + contacted.length === 0 ? '—' : String(queue.length),
      label: 'leads en cola para hoy',
      hint: 'El repaso de las 9:00: quién entra, con qué señal y con qué mensaje.',
    },
    {
      href: '/founders',
      title: 'Founders',
      value: String(conversations.length),
      label: conversations.length === 1 ? 'conversación abierta' : 'conversaciones abiertas',
      hint: `${queue.length} en cola de LinkedIn · máx 5-8 mensajes nuevos al día.`,
    },
    {
      href: '/pipeline',
      title: 'Pipeline',
      value: String(leads.length),
      label: 'leads en el embudo',
      hint: `${contacted.length} contactados · ${won.length} cerrados. Arrastra entre etapas.`,
    },
    {
      href: '/leaderboard',
      title: 'Leaderboard',
      value: sinScan.length ? String(sinScan.length) : '✓',
      label: sinScan.length ? 'marcas sin scan de B3S' : 'todo escaneado',
      hint: 'Usuarios, founders y startups: se puntúa avanzar, no acumular.',
    },
  ];

  return (
    <main className="space-y-8">
      {/* Banner */}
      <section className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-40 opacity-60"
          style={{
            background:
              'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 8px)',
          }}
        />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          B3S Leads
        </p>
        <h1 className="mt-2 max-w-lg text-2xl font-bold leading-snug tracking-tight">
          {conversations.length > 0
            ? `Tienes ${conversations.length} ${conversations.length === 1 ? 'conversación abierta' : 'conversaciones abiertas'}. Caliéntalas antes de abrir frío.`
            : queue.length > 0
              ? `${queue.length} founders esperan en la cola. Hoy, 5-8 mensajes buenos.`
              : 'Radar limpio. Añade founders o deja que el pipeline traiga candidatos.'}
        </h1>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--muted)]">
          El envío es siempre humano: la app prepara el contexto y el argumentario, la
          conversación la abres tú.
        </p>
      </section>

      {/* Resumen por sección */}
      <section>
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Secciones
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--muted)]"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <span className="text-xs text-[var(--soft)] transition-colors group-hover:text-[var(--text)]">
                  →
                </span>
              </div>
              <div className="mt-3 font-mono text-2xl leading-none">{s.value}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{s.label}</div>
              <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[11px] leading-relaxed text-[var(--soft)]">
                {s.hint}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* A quién escribir hoy */}
      {hottest.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Los más calientes
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {hottest.map(({ bl, temp }) => {
              const score = bl.scan?.status === 'ready' ? bl.scan.score : null;
              const name =
                displayName(bl.contact?.full_name) ||
                (bl.company ? companyLabel(bl.company.name, bl.company.domain) : '—');
              const target = bl.company ? `/companies/${bl.company.domain}` : '/founders';
              return (
                <Link
                  key={bl.lead.id}
                  href={target}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                    {bl.company && (
                      <div className="truncate font-mono text-xs text-[var(--muted)]">
                        {bl.company.domain}
                      </div>
                    )}
                    <div className="mt-1.5">
                      <Heat temp={temp} />
                    </div>
                  </div>
                  {score != null && <ScoreRing score={Number(score)} size={38} />}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
