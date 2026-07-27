import { PAGE } from '@/app/(dashboard)/page-width';
import { getFounderQueue, getConversations, getBriefingLeads } from '@/lib/data';
import { displayName, companyLabel } from '@/lib/types';
import { buildPitch } from '@/lib/pitch';
import { buildDraftPrompt } from '@/lib/claude';
import { leadTemperature } from '@/lib/scoring';
import type { BriefingLead } from '@/lib/types';
import { FoundersBoard, type FounderItem } from './founders-list';

export const dynamic = 'force-dynamic';

// Frase de entrada del argumentario (determinista, sin API), apoyada en el
// informe completo de B3S. Requiere empresa + scan; si no, la card pide el scan.
function opener(bl: BriefingLead): string | null {
  if (!bl.company || !bl.scan) return null;
  return buildPitch({ company: bl.company, scan: bl.scan, fundingSignal: bl.signal }).opener;
}

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

  // Precalcula lo que la card necesita (opener/prompt/temp) para pasarlo al
  // board cliente, que ordena y elige la vista.
  const toItem = (bl: BriefingLead): FounderItem => ({
    key: bl.lead.id,
    initial: bl,
    opener: opener(bl),
    draftPrompt: buildDraftPrompt(bl),
    temp: leadTemperature(bl),
    updatedAt: bl.lead.updated_at,
  });

  return (
    <main className={`${PAGE} space-y-6`}>
      <h1 className="text-2xl font-bold tracking-tight">Founders</h1>

      <FoundersBoard conversations={conversations.map(toItem)} queue={queue.map(toItem)} />

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
                  {bl.company ? companyLabel(bl.company.name, bl.company.domain) : ''}{' '}
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
                  className="text-xs text-[var(--linkedin-soft)] hover:underline"
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
