import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getCompanyFiche,
  getCompanyScans,
  getCompanySignals,
  getLeadNotes,
  getSectorVocabulary,
  getComponentSelections,
  getCompanyContacts,
} from '@/lib/data';
import { consolidateReport, consolidatedScore } from '@/lib/consolidated';
import { suggestSectors, parseSectorList } from '@/lib/sectors';
import { componentTerms } from '@/lib/component-terms';
import { leadTemperature } from '@/lib/scoring';
import { buildPitch } from '@/lib/pitch';
import { storedScanReport } from '@/lib/scan-report';
import { buildCallBriefPrompt, buildLeadContext } from '@/lib/lead-prompts';
import { stageLabel as stageLabelFor, displayName, companyLabel } from '@/lib/types';
import { resolveInvestors } from '@/lib/investors';
import { getTeamMembers, leadOwner } from '@/lib/team';
import { userLabel } from '@/lib/leaderboard';
import { ScanButton } from './scan-button';
import { ScoreHistory } from './score-history';
import { FollowUp } from './follow-up';
import { NotesLog } from './notes-log';
import { LeadOwner } from './lead-owner';
import { FundingPanel } from './funding-panel';
import { LeadTools } from './lead-tools';
import { AnalysisTabs, ScanComponents } from './analysis-tabs';
import { componentVersions, detectionNote, canonDimension, DIMENSION_LABELS } from '@/lib/scan-versions';
import { BTN_LINKEDIN_OUTLINE, BTN_OUTLINE } from '../../buttons';
import { AddLeadButton } from '../../add-lead-modal';
import { CompanyLogo } from '../../company-logo';
import { CompanyBio } from './company-bio';
import { EditableImage } from '../../editable-image';
import { ScoreRing } from '../../score-ring';
import { Heat } from '../../heat';
import { Avatar } from '../../avatar';
import { EditableText } from '../../editable-text';

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
  const [scanHistory, signals, notes, team, sectorVocab, selections, allContacts] = await Promise.all([
    getCompanyScans(company.id),
    getCompanySignals(company.id),
    getLeadNotes(lead.id),
    getTeamMembers(),
    getSectorVocabulary(),
    getComponentSelections(company.id),
    getCompanyContacts(company.id),
  ]);
  const ownerEmail = leadOwner(lead);
  const owner = { email: ownerEmail, label: userLabel(ownerEmail) };
  const detectedBy = lead.created_by_email
    ? { email: lead.created_by_email, label: userLabel(lead.created_by_email) }
    : null;
  const fundingSignals = signals.filter((s) => s.type === 'funding_round');
  const latestFunding = fundingSignals[0] ?? null;
  // "Levantando ronda" no es una ronda cerrada, es el estado de AHORA: el
  // momento en que necesitan narrativa para el deck. Se guardaba y puntuaba en
  // el radar, pero la ficha solo miraba funding_round y quedaba invisible.
  const raisingSignals = signals.filter((s) => s.type === 'levantando_ronda');
  const raising = raisingSignals[0] ?? null;
  const rd = raising?.detail;
  const raisingHeadline = raising
    ? [rd?.round, rd?.target_amount ? `buscan ${rd.target_amount}` : null]
        .filter(Boolean)
        .join(' · ') || 'en ronda'
    : null;
  const report = storedScanReport(scan?.result_raw ?? null);

  const tldr =
    typeof scan?.tldr === 'string' ? scan.tldr : ((scan?.tldr as { summary?: string })?.summary ?? null);
  // Versiones de cada componente a lo largo de todos los escaneos.
  const versions = componentVersions(scanHistory);

  // El Brand Seed consolidado: para cada dimensión, la versión elegida a mano
  // o, sin elección, la del último run. Sin curar, el consolidado ES el
  // automático (mismo número, misma agregación: no hay delta que aplicar).
  const autoScore = scan?.status === 'ready' && scan.score != null ? Number(scan.score) : null;
  const consolidado = consolidateReport(
    report?.dimensions ?? [],
    selections,
    scanHistory,
    scan?.id ?? null,
  );
  const scoreConsolidado =
    autoScore != null
      ? consolidatedScore(autoScore, report?.dimensions ?? [], consolidado.dimensions)
      : null;
  const selectionsMap = Object.fromEntries(
    selections
      .filter((sel) => sel.is_manual)
      .map((sel) => [
        sel.dimension,
        { scanId: sel.scan_id, selectedBy: sel.selected_by_email, note: sel.note },
      ]),
  );
  // Atributos y Valores en términos cortos. El Scanner no los devuelve, así
  // que se destilan de su propio texto (y se marcan como implícitos cuando el
  // componente no llegó a detectarse). Cacheado por scan: se paga una vez.
  const TERM_DIMENSIONS = new Set(['attributes', 'values']);
  const termsByKey: Record<string, { terms: string[]; implicit: boolean }> = {};
  await Promise.all(
    consolidado.dimensions.map(async (d) => {
      const key = canonDimension(d.name);
      if (!TERM_DIMENSIONS.has(key) || d.terms?.length) return;
      const scanId = consolidado.sourceByKey[key] ?? scan?.id;
      if (!scanId) return;
      const implicit = d.missing || d.score == null;
      const text = [d.reading, d.analysis, d.verdict, d.quote].filter(Boolean).join(' ');
      const terms = await componentTerms(scanId, key, text, implicit).catch(() => []);
      if (terms.length) termsByKey[key] = { terms, implicit };
    }),
  );

  // Argumentario y brief beben del CONSOLIDADO: si la curación dice que la
  // misión existe, no pueden seguir diciendo "sin rastro".
  const pitch = buildPitch({
    company,
    scan,
    fundingSignal: latestFunding,
    dimensions: consolidado.dimensions,
  });
  const callBriefPrompt = buildCallBriefPrompt(bl, consolidado.dimensions);
  const leadContext = buildLeadContext(bl, consolidado.dimensions);

  // Los huecos se calculan sobre la UNIÓN de escaneos, no sobre el último.
  // Si una pasada anterior sí detectó la misión, ese hueco es falso: decírselo
  // a un founder es el error más caro del sistema, porque lo desmonta la única
  // persona que sabe con certeza que te equivocas.
  const gapsRaw = (scan?.tldr as { gaps?: string[] } | null)?.gaps ?? [];
  const gaps = gapsRaw.map((g) => {
    const key = Object.keys(DIMENSION_LABELS).find(
      (k) => k === g.trim().toLowerCase() || DIMENSION_LABELS[k].toLowerCase() === g.trim().toLowerCase(),
    );
    const dim = key ? versions.find((v) => v.key === key) : undefined;
    // Una dimensión es hueco solo si la VERSIÓN SELECCIONADA no la detectó.
    // Si la curación eligió una pasada que sí la encontró, ya no es hueco.
    const selectedDim = key
      ? consolidado.dimensions.find(
          (d) => canonDimension(d.name) === key && !d.missing && d.score != null,
        )
      : undefined;
    return {
      label: key ? DIMENSION_LABELS[key] : g,
      note: dim ? detectionNote(dim) : null,
      // Solo es hueco de verdad si NINGÚN escaneo lo detectó.
      confirmed: !dim || dim.stats.detectedIn === 0,
      resolved: !!selectedDim,
    };
  }).filter((g) => !g.resolved);
  // Todos los founders en una sola lista, con el del lead primero: es con
  // quien se habla, pero se presenta igual que el resto.
  // Sectores recomendados de lo que ya sabemos: la bio y el texto del scan.
  const sectorHints = suggestSectors(
    [company.description, tldr, ...consolidado.dimensions.map((d) => d.reading ?? d.analysis)]
      .filter(Boolean)
      .join(' '),
    sectorVocab,
    parseSectorList(company.sector),
  );

  const founders = contact
    ? [contact, ...allContacts.filter((c) => c.id !== contact.id)]
    : allContacts;
  const stageLabel = stageLabelFor(lead.stage);
  const firstName = displayName(contact?.full_name).split(' ')[0] || null;
  const temp = leadTemperature(bl);
  const score = scan?.status === 'ready' ? scan.score : null;

  // Ronda para la cabecera (lo más "vendible" arriba del todo).
  const fd = latestFunding?.detail;
  const fundingHeadline = latestFunding
    ? [fd?.round, fd?.amount].filter(Boolean).join(' · ') || 'ronda registrada'
    : company.funding_stage || null;
  // Los inversores salen de la cadena y pasan a ser puertas: cada uno lleva
  // a su ficha, con toda su cartera dentro del radar.
  const headlineInvestors = resolveInvestors(fd?.investors);

  return (
    <main className={PAGE_XL}>
      <Link href="/briefing" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Briefing
      </Link>

      {/* Cabecera: identidad + estado, con logo, score y temperatura */}
      <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-[var(--border)] pb-6">
        {/* El bloque de identidad cuadra en altura con la caja de etapa (86px):
            logo, nombre, dominio y ronda. La fuente del lead salía aquí y no
            aportaba a la conversación; la ronda sí. */}
        <div className="flex min-w-0 gap-4">
          <EditableImage
            target={{ kind: 'company', id: company.id }}
            initial={company.logo_url}
            label="Cambiar logo de la marca"
            placement="inside"
          >
            <CompanyLogo
              domain={company.domain}
              name={companyLabel(company.name, company.domain)}
              src={company.logo_url}
              size={86}
            />
          </EditableImage>
          <div className="flex min-w-0 flex-col justify-between" style={{ minHeight: 86 }}>
            <EditableText
              initial={companyLabel(company.name, company.domain)}
              kind="company"
              id={company.id}
              as="h1"
              className="text-3xl font-semibold leading-none tracking-tight"
              label="Editar nombre de la marca"
            />
            <div className="flex flex-wrap items-center gap-3 font-mono text-sm text-[var(--muted)]">
              {company.domain?.includes('.') ? (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {company.domain} ↗
                </a>
              ) : (
                // Sin TLD no es un dominio navegable: se muestra plano en vez
                // de un enlace a https://loquesea que no lleva a ninguna parte.
                <span title="Dominio incompleto: falta el .com/.ai/… Edítalo para tener enlace.">
                  {company.domain || 'sin dominio'}
                </span>
              )}
              {company.linkedin_url && (
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--linkedin-soft)] hover:underline"
                >
                  LinkedIn ↗
                </a>
              )}
            </div>
            {/* Ronda, inversores y atributos en una sola línea. Sin ronda no se
                deja el hueco vacío: se dice que no se ha detectado, que es una
                señal en sí misma y un recordatorio de que se puede registrar. */}
            <div className="flex flex-wrap items-center gap-2">
              {/* En ronda ahora: por delante de la ronda cerrada. Una marca
                  buscando dinero es el mejor momento para hablarle de marca. */}
              {raisingHeadline && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/8 px-2.5 py-1 text-xs text-[var(--accent)]">
                  <span className="font-semibold uppercase tracking-wider">En ronda</span>
                  <span className="text-[var(--text)]">{raisingHeadline}</span>
                </span>
              )}
              {fundingHeadline ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--cta)]/40 bg-[var(--cta)]/8 px-2.5 py-1 text-xs text-[var(--cta)]">
                  <span className="font-semibold uppercase tracking-wider">Ronda</span>
                  <span className="text-[var(--text)]">{fundingHeadline}</span>
                </span>
              ) : (
                !raisingHeadline && (
                  <span className="inline-flex items-center rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--soft)]">
                    Ronda no detectada
                  </span>
                )
              )}
              {headlineInvestors.map((inv) => (
                <Link
                  key={inv.slug}
                  href={inv.href}
                  title={`Ficha de ${inv.name}`}
                  className="inline-flex items-center rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
                >
                  {inv.name}
                </Link>
              ))}
              {company.size && <Chip>{company.size} personas</Chip>}
              {company.city && <Chip>{company.city}</Chip>}
              {company.hq_country && <Chip>{company.hq_country}</Chip>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-md border border-[var(--border)] px-3.5 py-2 text-right">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">etapa</div>
            <div className="mt-0.5 text-sm font-medium">{stageLabel}</div>
            <div className="mt-1.5" title={`Temperatura del lead · ${temp.note}`}>
              <Heat temp={temp} />
            </div>
          </div>
          {score != null && (
            <div
              className="flex flex-col items-center"
              title={`B3S Score ${Math.round(Number(score))}/100`}
            >
              {/* El anillo de la ficha enseña la lectura de FLOC* (consolidado),
                  como el RESUMEN: dos números distintos en la misma pantalla
                  sin explicación es lo que no puede pasar. Los rankings y el
                  radar siguen ordenando por el automático. */}
              <ScoreRing score={scoreConsolidado ?? Number(score)} size={56} />
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {consolidado.manualCount > 0 ? 'Consolidado' : 'Score'}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* El ancho total se reparte en 4 cuartos armónicos: la columna
          principal ocupa 3 (Bio 2 + Estado 1) y la lateral 1. Así "Estado"
          y la columna del founder tienen el mismo ancho. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[3fr_1fr]">
        {/* ── Columna principal: análisis y argumentario ── */}
        <div className="min-w-0 space-y-8">
          {/* Resumen: a la izquierda lo que sabemos (score, lectura, bio);
              a la derecha, en su propia columna, las acciones del scan. */}
          <Section title="Resumen">
            {/* El corte a dos columnas depende del ancho REAL de la tarjeta
                (container query), no de la ventana: en pantallas anchas el
                scan vive a la derecha; si la tarjeta encoge, se apila. */}
            <div className="@container rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="grid gap-6 @2xl:grid-cols-[2fr_1fr]">
                <div className="min-w-0">
                  {/* Bio arriba del todo: qué hace la startup, en su voz. */}
                  <div>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                      Bio
                    </p>
                    <CompanyBio
                      companyId={company.id}
                      initial={company.description}
                      initialSector={company.sector}
                      availableSectors={sectorVocab}
                      recommended={sectorHints}
                    />
                  </div>

                  {/* Debajo: la puntuación y el extracto del scan de B3S. */}
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    {scan?.status === 'ready' && scan.score != null ? (
                      <>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-mono text-2xl">{scoreConsolidado}</span>
                          <span className="font-mono text-sm text-[var(--muted)]">/100</span>
                          <span className="text-xs text-[var(--muted)]">
                            {scoreBandLabel(scoreConsolidado ?? 0)}
                          </span>
                          {/* Ningún score sin decir cuál de los dos es. */}
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                            {consolidado.manualCount > 0
                              ? `consolidado · ${consolidado.manualCount}/${consolidado.totalCount} curadas`
                              : 'sin curar'}
                          </span>
                        </div>
                        {tldr && (
                          <div className="mt-3 border-l-2 border-[var(--border)] pl-3">
                            {/* La lectura en prosa es de UN run concreto y no se
                                reescribe: se atribuye. Si la curación ya corrigió
                                una dimensión, este párrafo puede contradecirla y
                                hay que ver de cuándo es y con qué score se dijo. */}
                            {autoScore != null && (
                              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                                automático ·{' '}
                                <span className="text-xs text-[var(--muted)]">{autoScore}</span>/100 ·
                                último scan{' '}
                                {new Date(scan!.created_at).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                                })}
                              </p>
                            )}
                            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{tldr}</p>
                            {consolidado.manualCount > 0 && (
                              <p className="mt-1.5 font-mono text-[10px] text-[var(--soft)]">
                                Texto de ese escaneo. Donde contradiga a un componente curado, manda
                                la curación.
                              </p>
                            )}
                          </div>
                        )}
                        {gaps.length > 0 && (
                          <ul className="mt-3 space-y-1 text-sm">
                            {gaps.map((g) => (
                              <li key={g.label} className="flex gap-2">
                                <span
                                  className={
                                    g.confirmed ? 'text-[var(--accent)]' : 'text-[var(--warning)]'
                                  }
                                >
                                  ·
                                </span>
                                <span className="text-[var(--muted)]">
                                  {g.label}
                                  {g.note && (
                                    <span className="ml-1.5 font-mono text-[10px] text-[var(--soft)]">
                                      {g.note}
                                    </span>
                                  )}
                                </span>
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
                  </div>
                </div>

                <div className="@2xl:border-l @2xl:border-[var(--border)] @2xl:pl-6">
                  <ScanButton
                    companyId={company.id}
                    domain={company.domain}
                    leadId={lead.id}
                    scan={scan}
                  />
                </div>
              </div>
            </div>
          </Section>

          {(report || pitch.lectura.length > 0 || pitch.programa) && (
            <Section title="Brand3 Scanner">
              <AnalysisTabs
                tabs={[
                  {
                    key: 'scanner',
                    label: 'B3S Seed',
                    content: (
                      <ScanComponents
                        generatedTerms={termsByKey}
                        dimensions={consolidado.dimensions}
                        versions={versions}
                        companyId={company.id}
                        selections={selectionsMap}
                      />
                    ),
                  },
                  {
                    key: 'argumentario',
                    label: 'Argumentario',
                    content: (
                      <>
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
            
                      </>
                    ),
                  },
                ]}
              />
            </Section>
          )}

          {/* Con el lead recién arrancado (sin scan) esta zona sobra:
              primero el scan, luego trabajarlo. */}
          {scan?.status === 'ready' && (
            <Section title="Trabajar el lead">
              <LeadTools callBriefPrompt={callBriefPrompt} leadContext={leadContext} />
            </Section>
          )}

          {message && (
            <Section title="Borrador">
              <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed">
                {message.draft}
              </p>
              <Link
                href="/founders"
                className="mt-2 inline-block text-xs text-[var(--cta)] hover:underline"
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
          <Section title={allContacts.length > 1 ? 'Founders' : 'Founder'}>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {founders.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Sin contacto todavía.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {founders.map((c) => (
                    <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <EditableImage
                          target={{ kind: 'contact', id: c.id }}
                          initial={c.avatar_url}
                          label="Cambiar foto del founder"
                        >
                          <Avatar name={displayName(c.full_name)} src={c.avatar_url} size={34} />
                        </EditableImage>
                        <div className="min-w-0 flex-1">
                          <EditableText
                            initial={displayName(c.full_name)}
                            kind="contact"
                            id={c.id}
                            className="text-sm font-medium"
                            label="Editar nombre del founder"
                          />
                          {/* El cargo se edita en el sitio, igual que el
                              nombre: saber si hablas con el CEO o el CTO
                              cambia el mensaje, y suele llegar después. */}
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                            <EditableText
                              initial={c.role ?? ''}
                              kind="contact"
                              id={c.id}
                              field="role"
                              placeholder="sin cargo"
                              className="text-xs"
                              label="Editar cargo"
                            />
                            {c.city && <span className="truncate">· {c.city}</span>}
                          </div>
                        </div>
                        {/* Escribirle es abrir su LinkedIn: el icono lo dice sin
                            texto, y así todos los founders ocupan lo mismo. */}
                        {c.linkedin_url ? (
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            title={`Abrir LinkedIn de ${displayName(c.full_name)}`}
                            aria-label={`Abrir LinkedIn de ${displayName(c.full_name)}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--linkedin)]/40 text-[var(--linkedin)] transition-colors hover:border-[var(--linkedin)] hover:bg-[var(--linkedin)]/10"
                          >
                            {/* La "in" escrita en la Geist del producto: a este
                                tamaño el logo vectorial se empasta. */}
                            <span className="font-sans text-[13px] font-bold leading-none tracking-tight">
                              in
                            </span>
                          </a>
                        ) : (
                          <span
                            title="Sin LinkedIn: no es contactable todavía"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--soft)]"
                          >
                            —
                          </span>
                        )}
                      </div>

                      {/* Lo demás solo cuando lo hay, sin romper la fila. */}
                      {c.headline && (
                        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{c.headline}</p>
                      )}
                      {(c.email || c.phone) && (
                        <div className="mt-2 space-y-1 text-xs">
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="block truncate text-[var(--muted)] hover:text-[var(--text)]"
                            >
                              ✉ {c.email}
                              {!c.email_verified && ' (no verificado)'}
                            </a>
                          )}
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="block text-[var(--muted)] hover:text-[var(--text)]"
                            >
                              ☎ {c.phone}
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <AddLeadButton
                  domain={company.domain}
                  label="Añadir founder"
                  className={`${BTN_OUTLINE} flex w-full items-center justify-center gap-2`}
                />
              </div>
            </div>
          </Section>

          <Section title="Responsable">
            <LeadOwner leadId={lead.id} owner={owner} detectedBy={detectedBy} team={team} />
          </Section>

          <Section title="Seguimiento">
            <FollowUp lead={lead} />
          </Section>

          <Section title="Bitácora">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <NotesLog
                leadId={lead.id}
                companyId={company.id}
                contactId={contact?.id ?? null}
                notes={notes}
              />
            </div>
          </Section>

          <Section title="Financiación">
            <FundingPanel
              companyId={company.id}
              leadId={lead.id}
              fundingSignals={fundingSignals}
              raisingSignals={raisingSignals}
            />
          </Section>
        </aside>
      </div>
    </main>
  );
}
