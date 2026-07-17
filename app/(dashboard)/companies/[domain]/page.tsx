import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompanyFiche } from '@/lib/data';
import { priorityBreakdown } from '@/lib/scoring';
import { ScanButton } from './scan-button';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs">
      {children}
    </span>
  );
}

// Ficha de compañía estilo Explee explore: el contexto completo de un
// prospecto en una pantalla, con el Scanner conectado.
export default async function CompanyPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const bl = await getCompanyFiche(decodeURIComponent(domain));
  if (!bl || !bl.company) notFound();

  const { company, contact, signal, scan, lead, message } = bl;
  const breakdown = priorityBreakdown({ company, signal, scan });
  const tldr =
    typeof scan?.tldr === 'string' ? scan.tldr : ((scan?.tldr as { summary?: string })?.summary ?? null);
  const gaps = (scan?.tldr as { gaps?: string[] } | null)?.gaps ?? [];

  return (
    <main>
      <Link href="/briefing" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Briefing
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {company.domain} ↗
            </a>
            {company.linkedin_url && (
              <a
                href={company.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {company.sector && <Chip>{company.sector}</Chip>}
            {company.size && <Chip>{company.size} personas</Chip>}
            {company.city && <Chip>{company.city}</Chip>}
            {company.hq_country && <Chip>{company.hq_country}</Chip>}
            {company.funding_stage && <Chip>{company.funding_stage}</Chip>}
            {company.founded_year && <Chip>fundada {company.founded_year}</Chip>}
            <Chip>fuente: {company.source}</Chip>
          </div>
        </div>
        <div className="text-right">
          {lead.priority_score != null && (
            <div className="rounded-md border border-[var(--border)] px-3 py-2">
              <div className="font-mono text-2xl">{Math.round(lead.priority_score)}</div>
              <div className="text-xs text-[var(--muted)]">prioridad</div>
            </div>
          )}
        </div>
      </header>

      {company.description && (
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[var(--text)]/90">
          {company.description}
        </p>
      )}

      <div className="mt-2 font-mono text-xs text-[var(--muted)]">
        señal {breakdown.recencia} · ronda {breakdown.ronda} · gap marca {breakdown.gap_marca} · fit{' '}
        {breakdown.fit_icp}
        {breakdown.bonus_engaged > 0 && (
          <span className="text-green-400"> · warm +{breakdown.bonus_engaged}</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {company.determinants?.length ? (
            <Section title="Determinants">
              <ul className="space-y-1 text-sm">
                {company.determinants.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="text-[var(--accent)]">·</span>
                    {d}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {company.competitors?.length ? (
            <Section title="Competidores">
              <div className="flex flex-wrap gap-2">
                {company.competitors.map((c) => (
                  <Chip key={c.name}>{c.domain ? `${c.name} · ${c.domain}` : c.name}</Chip>
                ))}
              </div>
            </Section>
          ) : null}

          {company.keywords?.length ? (
            <Section title="Keywords">
              <div className="flex flex-wrap gap-2">
                {company.keywords.map((k) => (
                  <Chip key={k}>{k}</Chip>
                ))}
              </div>
            </Section>
          ) : null}

          {company.icp_fit != null && (
            <Section title="Fit de ICP">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                <span className="font-mono">{company.icp_fit}%</span>
                {company.icp_reason && (
                  <span className="text-[var(--muted)]"> — {company.icp_reason}</span>
                )}
              </div>
            </Section>
          )}
        </div>

        <div>
          <Section title="Señal">
            {signal ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                <div className="capitalize">{signal.type.replace('_', ' ')}</div>
                <div className="mt-1 text-[var(--muted)]">
                  {[
                    signal.detail?.round,
                    signal.detail?.amount,
                    (signal.detail?.investors as string[] | undefined)?.join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </div>
                {signal.detail?.source_url && (
                  <a
                    href={signal.detail.source_url as string}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline"
                  >
                    Fuente ↗
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sin señal registrada.</p>
            )}
          </Section>

          <Section title="Brand3 Scanner">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              {scan?.status === 'ready' ? (
                <>
                  <div className="font-mono text-sm">{scan.score ?? '—'}/100</div>
                  {tldr && <p className="mt-2 text-sm text-[var(--muted)]">“{tldr}”</p>}
                  {gaps.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                      {gaps.map((g) => (
                        <li key={g} className="flex gap-2">
                          <span className="text-[var(--accent)]">·</span>
                          {g}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <ScanButton domain={company.domain} leadId={lead.id} scan={scan} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-[var(--muted)]">
                    {scan
                      ? `Estado: ${scan.status}`
                      : 'Sin escanear. El scan es lo que hace irrepetible el mensaje.'}
                  </p>
                  <ScanButton domain={company.domain} leadId={lead.id} scan={scan} />
                </div>
              )}
            </div>
          </Section>

          <Section title="Founder">
            {contact ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                <div className="font-medium">{contact.full_name}</div>
                {contact.role && <div className="text-[var(--muted)]">{contact.role}</div>}
                {contact.headline && (
                  <p className="mt-1 text-xs text-[var(--muted)]">{contact.headline}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {contact.linkedin_url ? (
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      Abrir LinkedIn ↗
                    </a>
                  ) : (
                    <span className="text-xs text-red-400">Sin LinkedIn: no es contactable</span>
                  )}
                  {contact.email && (
                    <span className="text-xs text-[var(--muted)]">
                      {contact.email}
                      {!contact.email_verified && ' (no verificado)'}
                    </span>
                  )}
                </div>
                {contact.notes && (
                  <p className="mt-2 text-xs text-[var(--muted)]">Ángulo: {contact.notes}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sin contacto todavía.</p>
            )}
          </Section>

          {message && (
            <Section title="Borrador">
              <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm leading-relaxed">
                {message.draft}
              </p>
              <Link
                href="/founders"
                className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
              >
                Ir a la cola de founders para copiar y enviar →
              </Link>
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}
