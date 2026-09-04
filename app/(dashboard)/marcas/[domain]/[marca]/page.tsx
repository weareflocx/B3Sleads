import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCorpusBrand, getCorpusBrands, getComponentSelections, getEstudio } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import { storedScanReport, retencionDeScan } from '@/lib/scan-report';
import { componentVersions } from '@/lib/scan-versions';
import { consolidateReport, consolidatedScore } from '@/lib/consolidated';
import { cardBand } from '@/lib/brand-card';
import { parseGrupos, perfilDeMarca, ultimoPublicable } from '@/lib/benchmark';
import { CompanyLogo } from '../../../company-logo';
import { EditableImage } from '../../../editable-image';
import { EditableText } from '../../../editable-text';
import { ScoreRing } from '../../../score-ring';
import { ScanComponents } from '../../../companies/[domain]/analysis-tabs';
import { ScoreHistory } from '../../../companies/[domain]/score-history';
import { ScanButton } from '../../../companies/[domain]/scan-button';

export const dynamic = 'force-dynamic';

// La ficha de una marca del corpus: lo que la ficha de lead tiene de análisis
// y nada de lo que tiene de persecución. Un competidor se mide y se cura, no
// se contacta. Si además es un lead, se enlaza a su ficha completa.
//
// La maqueta es deliberadamente la misma que la del lead: mismo cabecero con
// borde, misma rejilla 3fr/1fr, mismas secciones tituladas. Un competidor y
// un lead se leen igual, y quien salta de una ficha a otra no tiene que
// reaprender dónde está cada cosa. Lo único que cambia es el lateral: donde
// el lead tiene founders y seguimiento, aquí está el estudio al que pertenece.
type Props = {
  params: Promise<{ domain: string; marca: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

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

export default async function MarcaCorpusPage({ params, searchParams }: Props) {
  const { domain, marca } = await params;
  const cliente = decodeURIComponent(domain);
  const dom = decodeURIComponent(marca);
  const sp = await searchParams;
  const volver = `/marcas/${cliente}${sp.g ? `?g=${sp.g}` : ''}`;

  const m = await getCorpusBrand(dom);
  if (!m) notFound();

  // El estudio del cliente, para saber en qué grupo vive esta marca y contra
  // quién se está comparando. La URL manda cuando viene explícita, igual que
  // en la página del estudio: así un enlace compartido enseña lo mismo aquí.
  const marcaCliente = await getCorpusBrand(cliente);
  const guardado = marcaCliente ? await getEstudio(marcaCliente.company.id) : null;
  const grupos = sp.g !== undefined ? parseGrupos(sp.g) : (guardado?.grupos ?? []);
  const grupo = grupos.find((g) => g.dominios.includes(dom)) ?? null;
  const hermanas = grupo
    ? await getCorpusBrands(grupo.dominios.filter((d) => d !== dom))
    : [];

  const selections = await getComponentSelections(m.company.id);

  // Un run retenido no trae nota: la ficha enseña el último que sí la tiene y
  // dice, sin esconderlo, que hay uno posterior y por qué no publicó.
  const scanVisible = ultimoPublicable(m);
  const ultimo = m.scans[m.scans.length - 1] ?? null;
  const retencion = ultimo && ultimo.id !== scanVisible?.id ? retencionDeScan(ultimo.result_raw) : null;
  const report = storedScanReport(scanVisible?.result_raw ?? null);
  const versions = componentVersions(m.scans);
  const nombre = companyLabel(m.company.name, m.company.domain);

  // El mismo consolidado que la ficha de lead. Sin esto, curar un componente
  // aquí movía la lista pero no el número de arriba, y la misma marca daba
  // dos notas distintas según por qué ficha entraras.
  const autoScore = scanVisible?.score != null ? Number(scanVisible.score) : null;
  const consolidado = consolidateReport(
    report?.dimensions ?? [],
    selections,
    m.scans,
    scanVisible?.id ?? null,
  );
  const scoreConsolidado =
    autoScore != null
      ? consolidatedScore(autoScore, report?.dimensions ?? [], consolidado.dimensions)
      : null;
  const selectionsMap = Object.fromEntries(
    selections
      .filter((sel) => sel.is_manual)
      .map((sel) => [sel.dimension, { scanId: sel.scan_id, selectedBy: sel.selected_by_email, note: sel.note }]),
  );

  const tldr =
    typeof scanVisible?.tldr === 'string'
      ? scanVisible.tldr
      : ((scanVisible?.tldr as { summary?: string })?.summary ?? null);

  const perfil = perfilDeMarca(m);
  const estado = m.activo
    ? 'escaneando'
    : scanVisible
      ? retencion
        ? 'retenido'
        : 'con scan'
      : ultimo
        ? 'retenido'
        : 'sin scan';

  // La media del grupo se calcula con las que tienen nota publicable. Las
  // demás no restan: no puntuar no es puntuar bajo.
  const notasHermanas = hermanas
    .map((h) => ultimoPublicable(h)?.score)
    .filter((s): s is number => s != null)
    .map(Number);
  const mediaGrupo = notasHermanas.length
    ? Math.round(notasHermanas.reduce((a, b) => a + b, 0) / notasHermanas.length)
    : null;

  return (
    <main className={PAGE_XL}>
      <Link href={volver} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Estudio de {marcaCliente ? companyLabel(marcaCliente.company.name, marcaCliente.company.domain) : cliente}
      </Link>

      {/* Cabecera: identidad + estado del scan, con el mismo reparto que la
          ficha de lead (bloque de identidad a 86px de alto, caja de estado y
          anillo a la derecha). */}
      <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-[var(--border)] pb-6">
        <div className="flex min-w-0 gap-4">
          <EditableImage
            target={{ kind: 'company', id: m.company.id }}
            initial={m.company.logo_url}
            label="Cambiar logo de la marca"
            placement="inside"
          >
            <CompanyLogo domain={dom} name={nombre} size={86} src={m.company.logo_url} />
          </EditableImage>
          <div className="flex min-w-0 flex-col justify-between" style={{ minHeight: 86 }}>
            <EditableText
              initial={nombre}
              kind="company"
              id={m.company.id}
              as="h1"
              className="text-3xl font-semibold leading-none tracking-tight"
              label="Editar nombre de la marca"
            />
            <div className="flex flex-wrap items-center gap-3 font-mono text-sm text-[var(--muted)]">
              <a href={`https://${dom}`} target="_blank" rel="noreferrer" className="hover:underline">
                {dom} ↗
              </a>
              {m.lead && (
                <Link href={`/companies/${dom}`} className="text-[var(--cta)] hover:underline">
                  ficha de lead ↗
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {grupo ? (
                <Link
                  href={volver}
                  title={`Grupo del estudio de ${cliente}`}
                  className="inline-flex items-center rounded-md border border-[var(--cta)]/40 bg-[var(--cta)]/8 px-2.5 py-1 text-xs text-[var(--cta)] transition-colors hover:border-[var(--cta)]"
                >
                  {grupo.nombre}
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--soft)]">
                  Fuera de los grupos del estudio
                </span>
              )}
              {m.company.sector && <Chip>{m.company.sector}</Chip>}
              {m.company.size && <Chip>{m.company.size} personas</Chip>}
              {m.company.city && <Chip>{m.company.city}</Chip>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-md border border-[var(--border)] px-3.5 py-2 text-right">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">scan</div>
            <div className="mt-0.5 text-sm font-medium">{estado}</div>
            <div className="mt-1.5 font-mono text-[11px] text-[var(--soft)]">
              {perfil.detectados}/10 componentes
            </div>
          </div>
          {scoreConsolidado != null && (
            <div
              className="flex flex-col items-center"
              title={`B3S Score ${scoreConsolidado}/100`}
            >
              <ScoreRing score={scoreConsolidado} size={56} />
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {consolidado.manualCount > 0 ? 'Consolidado' : 'Score'}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[3fr_1fr]">
        {/* ── Columna principal: lo que el Scanner leyó ── */}
        <div className="min-w-0 space-y-8">
          <Section title="Resumen">
            {/* El corte a dos columnas depende del ancho REAL de la tarjeta, no
                de la ventana: con el lateral puesto, la caja del scan cabe a la
                derecha; si la tarjeta encoge, se apila. */}
            <div className="@container rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="grid gap-6 @2xl:grid-cols-[2fr_1fr]">
                <div className="min-w-0">
                  {retencion && (
                    <p className="mb-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                      Hay un scan más reciente sin puntuación publicable: {retencion.motivo}
                      {retencion.detalle ? `, porque ${retencion.detalle}` : ''}. Se muestra el
                      último con datos.
                      {retencion.matiz && (
                        <span className="mt-1.5 block text-[var(--soft)]">{retencion.matiz}</span>
                      )}
                    </p>
                  )}
                  {scoreConsolidado != null ? (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-2xl">{scoreConsolidado}</span>
                        <span className="font-mono text-sm text-[var(--muted)]">/100</span>
                        <span className="text-xs text-[var(--muted)]">
                          {cardBand(scoreConsolidado)}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                          {consolidado.manualCount > 0
                            ? `consolidado · ${consolidado.manualCount}/${consolidado.totalCount} curadas`
                            : 'sin curar'}
                        </span>
                      </div>
                      {tldr && (
                        <div className="mt-3 border-l-2 border-[var(--border)] pl-3">
                          {autoScore != null && (
                            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                              automático ·{' '}
                              <span className="text-xs text-[var(--muted)]">{autoScore}</span>/100 ·{' '}
                              {new Date(scanVisible!.created_at).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                              })}
                            </p>
                          )}
                          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{tldr}</p>
                        </div>
                      )}
                      {mediaGrupo != null && grupo && (
                        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">
                          Media de {grupo.nombre} sin contarla:{' '}
                          <span className="font-mono text-[var(--text)]">{mediaGrupo}</span>
                          <span className="ml-2 font-mono text-xs text-[var(--soft)]">
                            {scoreConsolidado > mediaGrupo ? '+' : ''}
                            {scoreConsolidado - mediaGrupo}
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      {m.activo
                        ? 'Escaneando. El análisis aparece en uno o dos minutos.'
                        : 'Sin scan todavía. Hasta que lo haya, esta marca no entra en la comparación.'}
                    </p>
                  )}
                </div>

                <div className="@2xl:border-l @2xl:border-[var(--border)] @2xl:pl-6">
                  <ScanButton
                    companyId={m.company.id}
                    domain={dom}
                    leadId={m.lead?.id ?? null}
                    scan={m.activo ?? ultimo}
                  />
                </div>
              </div>
            </div>
          </Section>

          {report ? (
            <Section title="Brand3 Scanner">
              <ScanComponents
                dimensions={consolidado.dimensions}
                versions={versions}
                companyId={m.company.id}
                selections={selectionsMap}
              />
            </Section>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
              {m.activo ? 'Escaneando. El análisis aparece en uno o dos minutos.' : 'Sin scan todavía.'}
            </p>
          )}

          {m.scans.length > 1 && <ScoreHistory scans={m.scans} />}
        </div>

        {/* ── Lateral: el estudio del que esta marca forma parte ── */}
        <aside className="space-y-8">
          <Section title="Estudio">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {marcaCliente && (
                <Link href={volver} className="flex items-center gap-3 group">
                  <CompanyLogo
                    domain={marcaCliente.company.domain}
                    name={companyLabel(marcaCliente.company.name, marcaCliente.company.domain)}
                    size={34}
                    src={marcaCliente.company.logo_url}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                      Cliente
                    </p>
                    <p className="truncate text-sm font-medium group-hover:underline">
                      {companyLabel(marcaCliente.company.name, marcaCliente.company.domain)}
                    </p>
                  </div>
                </Link>
              )}

              {grupo ? (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                    Grupo · {grupo.nombre}
                  </p>
                  {hermanas.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Sola en su grupo. Con una marca no hay media que comparar.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                      {hermanas.map((h) => {
                        const nota = ultimoPublicable(h)?.score;
                        const etiqueta = companyLabel(h.company.name, h.company.domain);
                        return (
                          <li key={h.company.id} className="py-2 first:pt-0 last:pb-0">
                            <Link
                              href={`/marcas/${cliente}/${h.company.domain}${sp.g ? `?g=${sp.g}` : ''}`}
                              className="flex items-center gap-2.5 group"
                            >
                              <CompanyLogo
                                domain={h.company.domain}
                                name={etiqueta}
                                size={22}
                                src={h.company.logo_url}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm group-hover:underline">
                                {etiqueta}
                              </span>
                              <span className="font-mono text-xs text-[var(--muted)]">
                                {nota != null ? Math.round(Number(nota)) : '—'}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-4 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">
                  Esta marca no está en ningún grupo del estudio. Añádela desde el estudio para que
                  entre en la comparación.
                </p>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </main>
  );
}
