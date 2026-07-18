import { getFounderQueue, getConversations, getBriefingLeads } from '@/lib/data';
import { displayName } from '@/lib/types';
import { ImportBox } from './import-box';
import { FounderRow } from './founder-row';

export const dynamic = 'force-dynamic';

// La pantalla del canal: founders con LinkedIn, listos para que Sergio
// escriba a mano. El envío nunca es automático (spec §9).
export default async function FoundersPage() {
  const [queue, conversations, all] = await Promise.all([
    getFounderQueue(),
    getConversations(),
    getBriefingLeads(),
  ]);
  // Empresas detectadas (pipeline) a las que aún no les hemos encontrado el
  // founder en LinkedIn. Tienen empresa pero contacto sin perfil.
  const sinLinkedin = all.filter(
    (l) => l.company && !l.contact?.linkedin_url && ['detected', 'briefed'].includes(l.lead.stage),
  );

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Founders</h1>
        <span className="text-sm text-[var(--muted)]">
          {queue.length} en cola de LinkedIn · máx 5-8 mensajes nuevos al día
        </span>
      </div>

      <ImportBox />

      {/* Conversaciones abiertas: lo más valioso. Founders que respondieron. */}
      {conversations.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--success)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
            En conversación ({conversations.length}) — te respondieron por privado
          </h2>
          <div className="space-y-3">
            {conversations.map((bl) => (
              <FounderRow key={bl.lead.id} initial={bl} conversation />
            ))}
          </div>
        </section>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        Cola de contacto en frío
      </h2>
      {queue.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          Nadie en cola. Pega perfiles arriba o espera al pipeline nocturno.
        </p>
      ) : (
        <div className="space-y-3">
          {queue.map((bl) => (
            <FounderRow key={bl.lead.id} initial={bl} />
          ))}
        </div>
      )}

      {sinLinkedin.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Sin LinkedIn ({sinLinkedin.length}) — no contactables hasta encontrar el perfil
          </h2>
          <div className="space-y-1">
            {sinLinkedin.map((bl) => (
              <div
                key={bl.lead.id}
                className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <span>
                  {bl.company?.name}{' '}
                  <span className="text-[var(--muted)]">
                    {bl.contact ? `· ${displayName(bl.contact.full_name)}` : '· sin contacto'}
                  </span>
                </span>
                <a
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
                    bl.company?.name ?? '',
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--cta)] hover:underline"
                >
                  Buscar founder en LinkedIn ↗
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
