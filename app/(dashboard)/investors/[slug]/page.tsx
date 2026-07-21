import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ensureInvestor,
  getInvestor,
  getPortfolio,
  investorNameFromRounds,
  formatEur,
} from '@/lib/investors-data';
import { getCompanyScans } from '@/lib/data';
import { investorSearchUrl } from '@/lib/investors';
import { companyLabel } from '@/lib/types';
import { CompanyLogo } from '../../company-logo';
import { ScoreRing } from '../../score-ring';
import { ScanButton } from '../../companies/[domain]/scan-button';
import { InvestorField } from './investor-field';

export const dynamic = 'force-dynamic';

// Ficha del fondo. Comparte lenguaje con la de startup (logo, score, scan
// de B3S) pero cambia lo que abajo es distinto: un fondo no tiene founder
// que trabajar ni ronda que levantar, tiene cartera. Así que donde la
// startup lleva seguimiento y financiación, aquí van las participadas.
export default async function InvestorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // El fondo puede existir solo como texto dentro de una ronda: al abrir su
  // ficha por primera vez se materializa.
  const nameFromRounds = await investorNameFromRounds(slug);
  let investor = await getInvestor(slug);
  if (!investor && nameFromRounds) investor = await ensureInvestor(slug, nameFromRounds);
  if (!investor) notFound();

  const portfolio = await getPortfolio(slug);
  const scans = investor.company_id ? await getCompanyScans(investor.company_id) : [];
  const ownScan = scans[0] ?? null;

  const scored = portfolio.filter((p) => p.scan?.score != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((a, p) => a + Number(p.scan!.score), 0) / scored.length)
    : null;
  const deployed = portfolio.reduce(
    (sum, p) =>
      sum +
      p.rounds.reduce(
        (s, r) => s + (typeof r.detail?.amount_eur === 'number' ? r.detail.amount_eur : 0),
        0,
      ),
    0,
  );

  return (
    <main>
      <Link href="/leaderboard" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Leaderboard
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-[var(--border)] pb-6">
        <div className="flex min-w-0 gap-4">
          <CompanyLogo domain={investor.website ?? ''} name={investor.name} />
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{investor.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-sm text-[var(--muted)]">
              <InvestorField
                slug={slug}
                field="website"
                initial={investor.website ?? ''}
                placeholder="añadir web del fondo"
                render={(v) => (
                  <a href={`https://${v}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {v} ↗
                  </a>
                )}
              />
              <a
                href={investorSearchUrl(investor.name)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--soft)] hover:text-[var(--text)]"
              >
                buscar ↗
              </a>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs uppercase text-[var(--muted)]">
                {investor.kind}
              </span>
              <span className="rounded-md border border-[var(--cta)]/40 bg-[var(--cta)]/10 px-2 py-1 font-mono text-xs text-[var(--cta)]">
                {portfolio.length} en cartera
              </span>
              {deployed > 0 && (
                <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--muted)]">
                  {formatEur(deployed)} en rondas
                </span>
              )}
            </div>
          </div>
        </div>

        {avgScore != null && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-mono text-xs uppercase tracking-wide text-[var(--muted)]">
                Marca de la cartera
              </p>
              <p className="font-mono text-xs text-[var(--soft)]">
                media de {scored.length} escaneada{scored.length === 1 ? '' : 's'}
              </p>
            </div>
            <ScoreRing score={avgScore} />
          </div>
        )}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
            Cartera en el radar
          </h2>
          {portfolio.length ? (
            <ul className="mt-3 space-y-2">
              {portfolio.map(({ company, scan, rounds }) => (
                <li key={company.id}>
                  <Link
                    href={`/companies/${company.domain}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--cta)]"
                  >
                    <CompanyLogo domain={company.domain} name={companyLabel(company.name, company.domain)} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {companyLabel(company.name, company.domain)}
                      </span>
                      <span className="block truncate font-mono text-xs text-[var(--muted)]">
                        {company.domain}
                        {rounds[0]?.detail?.round ? ` · ${rounds[0].detail.round}` : ''}
                        {rounds[0]?.detail?.amount ? ` · ${rounds[0].detail.amount}` : ''}
                      </span>
                    </span>
                    {scan?.score != null ? (
                      <ScoreRing score={Number(scan.score)} size={36} />
                    ) : (
                      <span className="font-mono text-xs text-[var(--soft)]">sin scan</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Todavía no hay participadas de este fondo en el radar. Aparecerán solas al registrar
              rondas donde entre.
            </p>
          )}

          <h2 className="mt-8 font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
            Tesis
          </h2>
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            <InvestorField
              slug={slug}
              field="thesis"
              initial={investor.thesis ?? ''}
              placeholder="en qué invierten, en una línea"
              multiline
            />
          </div>
        </section>

        <aside className="space-y-6">
          <section>
            <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
              B3S Scanner
            </h2>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {investor.company_id ? (
                <>
                  {ownScan?.status === 'ready' && ownScan.score != null ? (
                    <p className="mb-3 text-sm">
                      <span className="font-mono text-2xl">{Number(ownScan.score)}</span>
                      <span className="font-mono text-xs text-[var(--muted)]"> /100</span>
                    </p>
                  ) : (
                    <p className="mb-3 text-sm text-[var(--muted)]">
                      Un fondo también se compra por su marca. Escanéalo y tendrás con qué abrir la
                      conversación con el propio equipo.
                    </p>
                  )}
                  <ScanButton
                    companyId={investor.company_id}
                    domain={investor.website ?? ''}
                    scan={ownScan}
                  />
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Añade la web del fondo arriba y podrás escanear su marca como la de cualquier
                  startup.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
              Ficha
            </h2>
            <div className="mt-3 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              <div>
                <p className="font-mono text-xs uppercase text-[var(--muted)]">Sede</p>
                <InvestorField slug={slug} field="hq" initial={investor.hq ?? ''} placeholder="ciudad" />
              </div>
              <div>
                <p className="font-mono text-xs uppercase text-[var(--muted)]">LinkedIn</p>
                <InvestorField
                  slug={slug}
                  field="linkedinUrl"
                  initial={investor.linkedin_url ?? ''}
                  placeholder="url de la company page"
                  render={(v) => (
                    <a
                      href={v}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-[var(--linkedin)] hover:underline"
                    >
                      abrir ↗
                    </a>
                  )}
                />
              </div>
              <div>
                <p className="font-mono text-xs uppercase text-[var(--muted)]">Notas</p>
                <InvestorField
                  slug={slug}
                  field="notes"
                  initial={investor.notes ?? ''}
                  placeholder="quién decide, cómo entra, con quién co-invierte"
                  multiline
                />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
