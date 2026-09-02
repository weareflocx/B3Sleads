import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCorpusBrand, getComponentSelections } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import { storedScanReport, retencionDeScan } from '@/lib/scan-report';
import { componentVersions } from '@/lib/scan-versions';
import { ultimoPublicable } from '@/lib/benchmark';
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
type Props = {
  params: Promise<{ domain: string; marca: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function MarcaCorpusPage({ params, searchParams }: Props) {
  const { domain, marca } = await params;
  const cliente = decodeURIComponent(domain);
  const dom = decodeURIComponent(marca);
  const sp = await searchParams;
  const volver = `/marcas/${cliente}${sp.g ? `?g=${sp.g}` : ''}`;

  const m = await getCorpusBrand(dom);
  if (!m) notFound();
  const selections = await getComponentSelections(m.company.id);

  const scanVisible = ultimoPublicable(m);
  const ultimo = m.scans[m.scans.length - 1] ?? null;
  const retencion = ultimo && ultimo.id !== scanVisible?.id ? retencionDeScan(ultimo.result_raw) : null;
  const report = storedScanReport(scanVisible?.result_raw ?? null);
  const versions = componentVersions(m.scans);
  const nombre = companyLabel(m.company.name, m.company.domain);
  const selectionsMap = Object.fromEntries(
    selections
      .filter((sel) => sel.is_manual)
      .map((sel) => [sel.dimension, { scanId: sel.scan_id, selectedBy: sel.selected_by_email, note: sel.note }]),
  );

  return (
    <main className={PAGE_XL}>
      <Link href={volver} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Estudio de {cliente}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <EditableImage target={{ kind: 'company', id: m.company.id }} initial={m.company.logo_url} label="Cambiar logo" placement="inside">
            <CompanyLogo domain={dom} name={nombre} size={64} src={m.company.logo_url} />
          </EditableImage>
          <div className="min-w-0">
            <EditableText
              initial={m.company.name || dom}
              kind="company"
              id={m.company.id}
              as="h1"
              className="text-2xl font-bold tracking-tight"
              label="Editar nombre"
            />
            <a href={`https://${dom}`} target="_blank" rel="noreferrer" className="font-mono text-sm text-[var(--muted)] hover:underline">
              {dom} ↗
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {scanVisible?.score != null && <ScoreRing score={Number(scanVisible.score)} size={44} />}
          {m.lead && (
            <Link href={`/companies/${dom}`} className="text-sm text-[var(--muted)] hover:underline">
              ficha de lead ↗
            </Link>
          )}
        </div>
      </div>

      {retencion && (
        <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--muted)]">
          Hay un scan más reciente sin puntuación publicable: {retencion.motivo}
          {retencion.detalle ? `, porque ${retencion.detalle}` : ''}. Se muestra el último con datos.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {report ? (
            <ScanComponents
              dimensions={report.dimensions}
              versions={versions}
              companyId={m.company.id}
              selections={selectionsMap}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
              {m.activo ? 'Escaneando. El análisis aparece en uno o dos minutos.' : 'Sin scan todavía.'}
            </p>
          )}
        </div>
        <aside className="space-y-6">
          <ScanButton companyId={m.company.id} domain={dom} leadId={m.lead?.id ?? null} scan={m.activo ?? ultimo} />
          {m.scans.length > 1 && <ScoreHistory scans={m.scans} />}
        </aside>
      </div>
    </main>
  );
}
