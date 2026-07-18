import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompanyFiche, getCompanyScans, getCompanySignals } from '@/lib/data';
import { priorityBreakdown } from '@/lib/scoring';
import { buildPitch } from '@/lib/pitch';
import { STAGES, displayName } from '@/lib/types';
import { ScanButton } from './scan-button';
import { ScoreHistory } from './score-history';
import { FollowUp } from './follow-up';
import { FundingPanel } from './funding-panel';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
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

function scoreBandLabel(score: number): string {
  if (score < 40) return 'marca por construir';
  if (score < 60) return 'funcional, indistinguible';
  if (score < 75) return 'sólida con huecos';
  return 'marca trabajada';
}

// Ficha del lead: el espacio de trabajo para preparar y seguir la conversación
// con el founder. Columna principal: el análisis y el argumentario. Lateral:
// contacto, seguimiento y financiación.
export default async function CompanyPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const bl = await getCompanyFiche(decodeURIComponent(domain));
  if (!bl || !bl.company) notFound();

  const { company, contact, scan, lead, message } = bl;
  const [scanHistory, signals] = await Promise.all([
    getCompanyScans(company.id),
    getCompanySignals(company.id),
  ]);
  const fundingSignals = signals.filter((s) => s.type === 'funding_round');
  const latestFunding = fundingSignals[0] ?? null;
  const breakdown = priorityBreakdown({ company, signal: latestFunding, scan });
  const pitch = buildPitch({ company, scan, fundingSignal: latestFunding });

  const tldr =
    typeof scan?.tldr === 'string' ? scan.tldr : ((scan?.tldr as { summary?: string })?.summary ?? null);
  const gaps = (scan?.tldr as { gaps?: string[] } | null)?.gaps ?? [];
  const stageLabel =
    STAGES.find((s) => s.key === lead.stage)?.label ?? (lead.stage === 'lost' ? 'Perdido' : lead.stage);
  const firstName = displayName(contact?.full_name).split(' ')[0] || null;

  return (
    <main>
      <Link href="/briefing" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Briefing
      </Link>

      {/* Cabecera: identidad + estado */}
      <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-[var(--border)] pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:underline">
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
            <Chip>fuente: {company.source}</Chip>
          </div>
        </div>
        <div className="flex items-stretch gap-2.5 text-right">
          <div className="rounded-md border border-[var(--border)] px-3.5 py-2">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">etapa</div>
            <div className="mt-0.5 text-sm font-medium">{stageLabel}</div>
          </div>
          {lead.priority_score != null && (
            <div className="rounded-md border border-[var(--border)] px-3.5 py-2">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)]">prioridad</div>
              <div
                className="mt-0.5 font-mono text-xl leading-none"
                title={`señal ${breakdown.recencia} · ronda ${breakdown.ronda} · gap marca ${breakdown.gap_marca} · fit ${breakdown.fit_icp}`}
              >
                {Math.round(lead.priority_score)}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Columna principal: análisis y argumentario ── */}
        <div className="min-w-0 space-y-8">
          <Section title="Brand3 Scanner">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {scan?.status === 'ready' && scan.score != null ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-2xl">{Number(scan.score)}</span>
                    <span className="font-mono text-sm text-[var(--muted)]">/100</span>
                    <span className="text-xs text-[var(--muted)]">
                      {scoreBandLabel(Number(scan.score))}
                    </span>
                  </div>
                  {tldr && (
                    <p className="mt-3 border-l-2 border-[var(--border)] pl-3 text-sm leading-relaxed text-[var(--muted)]">
                      {tldr}
                    </p>
                  )}
                  {gaps.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {gaps.map((g) => (
                        <li key={g} className="flex gap-2">
                          <span className="text-[var(--accent)]">·</span>
                          <span className="text-[var(--muted)]">{g}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Sin escanear. El scan es lo que hace irrepetible el mensaje.
                </p>
              )}
              <div className="mt-4 border-t border-[var(--border)] pt-3.5">
                <ScanButton domain={company.domain} leadId={lead.id} scan={scan} />
              </div>
            </div>
          </Section>

          {(pitch.lectura.length > 0 || pitch.programa) && (
            <Section title={firstName ? `Argumentario · cómo abordar a ${firstName}` : 'Argumentario'}>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                {pitch.lectura.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Lectura de marca
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
                      {pitch.lectura.map((l) => (
                        <li key={l} className="flex gap-2">
                          <span className="text-[var(--accent)]">·</span>
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pitch.angulos.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Ángulos para abrir conversación
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
                      {pitch.angulos.map((a) => (
                        <li key={a} className="flex gap-2">
                          <span className="text-[var(--success)]">→</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pitch.programa && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Cómo ayuda FLOC*
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed">
                      <span className="font-medium">{pitch.programa.name}</span>
                      <span className="font-mono text-xs text-[var(--accent)]">
                        {' '}
                        {pitch.programa.price}
                      </span>
                      <span className="text-[var(--muted)]"> · {pitch.programa.scope}</span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                      {pitch.programa.why}
                    </p>
                  </div>
                )}
                <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--soft)]">
                  Generado del scan y la señal. El primer mensaje nunca pitchea: abre conversación.
                </p>
              </div>
            </Section>
          )}

          {message && (
            <Section title="Borrador">
              <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed">
                {message.draft}
              </p>
              <Link
                href="/founders"
                className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
              >
                Copiar y enviar desde la cola de founders →
              </Link>
            </Section>
          )}

          {scanHistory.length > 1 && <ScoreHistory scans={scanHistory} />}

          {(company.determinants?.length || company.competitors?.length || company.keywords?.length || company.icp_fit != null) ? (
            <Section title="Contexto de mercado">
              <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                {company.icp_fit != null && (
                  <p className="text-sm">
                    <span className="font-mono">{company.icp_fit}% fit ICP</span>
                    {company.icp_reason && (
                      <span className="text-[var(--muted)]"> — {company.icp_reason}</span>
                    )}
                  </p>
                )}
                {company.determinants?.length ? (
                  <ul className="space-y-1 text-sm">
                    {company.determinants.map((d) => (
                      <li key={d} className="flex gap-2">
                        <span className="text-[var(--accent)]">·</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {company.competitors?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {company.competitors.map((c) => (
                      <Chip key={c.name}>{c.domain ? `${c.name} · ${c.domain}` : c.name}</Chip>
                    ))}
                  </div>
                ) : null}
                {company.keywords?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {company.keywords.map((k) => (
                      <Chip key={k}>{k}</Chip>
                    ))}
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}
        </div>

        {/* ── Lateral: contacto, seguimiento, financiación ── */}
        <aside className="space-y-8">
          <Section title="Founder">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {contact ? (
                <>
                  <div className="text-sm font-medium">{displayName(contact.full_name)}</div>
                  {contact.role && (
                    <div className="mt-0.5 text-sm text-[var(--muted)]">{contact.role}</div>
                  )}
                  {contact.headline && (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                      {contact.headline}
                    </p>
                  )}
                  <div className="mt-3.5 space-y-2">
                    {contact.linkedin_url ? (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md bg-[var(--cta)] px-3 py-2 text-center text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
                      >
                        Abrir LinkedIn ↗
                      </a>
                    ) : (
                      <p className="text-xs text-[var(--warning)]">
                        Sin LinkedIn: no es contactable todavía.
                      </p>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="block truncate text-center text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                      >
                        {contact.email}
                        {!contact.email_verified && ' (no verificado)'}
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Sin contacto. Añádelo desde{' '}
                  <Link href="/founders" className="text-[var(--accent)] hover:underline">
                    Founders
                  </Link>
                  .
                </p>
              )}
            </div>
          </Section>

          <Section title="Seguimiento">
            <FollowUp lead={lead} contactId={contact?.id ?? null} initialNotes={contact?.notes ?? null} />
          </Section>

          <Section title="Financiación">
            <FundingPanel companyId={company.id} leadId={lead.id} fundingSignals={fundingSignals} />
          </Section>
        </aside>
      </div>
    </main>
  );
}
