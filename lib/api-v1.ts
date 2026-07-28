// Capa común de la API pública (/api/v1): carga y serialización.
//
// La API existe para que los agentes (Hermes, OpenClaw…) trabajen sobre el
// radar sin navegador: leer la cola ordenada con su evidencia, abrir la ficha
// completa, llevarse el dossier o el brief, y registrar lo que descubren
// (notas, señales, cambios de etapa). El envío a founders sigue siendo
// humano y por LinkedIn: aquí no hay ningún endpoint de mensajería.
import { getBriefingLeads, getCompanyFiche, getCompanySignals, getLeadNotes, getComponentSelections } from './data';
import { getServiceSupabase, isDemoMode } from './supabase';
import { computeRadar, agoLabel, type Radar } from './radar';
import { storedScanReport } from './scan-report';
import { componentVersions, canonDimension } from './scan-versions';
import { consolidateReport, consolidatedScore, type ConsolidatedReport } from './consolidated';
import { displayName } from './types';
import type { BriefingLead, Scan, Signal } from './types';

// ---------- serialización ----------

function serializeSignal(radar: Radar) {
  const s = radar.best;
  if (!s) return null;
  return {
    type: s.type,
    label: s.label,
    level: s.level,
    occurred_at: s.occurredAt,
    ago: agoLabel(s.days),
    evidence: s.evidence,
    source_url: s.sourceUrl,
  };
}

export function serializeLead(bl: BriefingLead, companySignals: Signal[]) {
  const radar = computeRadar(bl, companySignals);
  return {
    id: bl.lead.id,
    stage: bl.lead.stage,
    updated_at: bl.lead.updated_at,
    company: bl.company
      ? {
          name: bl.company.name,
          domain: bl.company.domain,
          sector: bl.company.sector,
          bio: bl.company.description,
        }
      : null,
    founder: bl.contact
      ? {
          name: displayName(bl.contact.full_name),
          linkedin_url: bl.contact.linkedin_url,
          headline: bl.contact.headline,
        }
      : null,
    scan:
      bl.scan && bl.scan.status === 'ready' && bl.scan.score != null
        ? {
            score_automatico: Number(bl.scan.score),
            run_at: bl.scan.created_at,
            report_url: bl.scan.ui_url,
          }
        : null,
    radar: {
      state: radar.state,
      score: radar.score,
      fit: radar.fit,
      timing: radar.timing,
      version: radar.version,
      signal: serializeSignal(radar),
    },
    links: bl.company ? { detail: `/api/v1/companies/${bl.company.domain}` } : {},
  };
}

// ---------- carga de ficha completa ----------

export interface FicheBundle {
  bl: BriefingLead;
  signals: Signal[];
  consolidado: ConsolidatedReport;
  scoreAutomatico: number | null;
  scoreConsolidado: number | null;
  radar: Radar;
}

// Misma composición que la ficha del dashboard: informe del último run,
// curación aplicada encima, y el radar con todas las señales de la empresa.
export async function loadFiche(domain: string): Promise<FicheBundle | null> {
  const bl = await getCompanyFiche(domain);
  if (!bl || !bl.company) return null;
  const [signals, selections, scans] = await Promise.all([
    getCompanySignals(bl.company.id),
    getComponentSelections(bl.company.id),
    companyScans(bl.company.id),
  ]);
  const report = storedScanReport(bl.scan?.result_raw ?? null);
  const scoreAutomatico =
    bl.scan?.status === 'ready' && bl.scan.score != null ? Number(bl.scan.score) : null;
  const consolidado = consolidateReport(
    report?.dimensions ?? [],
    selections,
    scans,
    bl.scan?.id ?? null,
  );
  const scoreCons =
    scoreAutomatico != null
      ? consolidatedScore(scoreAutomatico, report?.dimensions ?? [], consolidado.dimensions)
      : null;
  return {
    bl,
    signals,
    consolidado,
    scoreAutomatico,
    scoreConsolidado: scoreCons,
    radar: computeRadar(bl, signals),
  };
}

async function companyScans(companyId: string): Promise<Scan[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('scans')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  return (data as Scan[] | null) ?? [];
}

export async function serializeFiche(bundle: FicheBundle) {
  const { bl, signals, consolidado, scoreAutomatico, scoreConsolidado, radar } = bundle;
  const notes = await getLeadNotes(bl.lead.id);
  const versions = componentVersions(await companyScans(bl.company!.id));
  const curated = new Set(
    (await getComponentSelections(bl.company!.id)).filter((s) => s.is_manual).map((s) => s.dimension),
  );

  return {
    lead: { id: bl.lead.id, stage: bl.lead.stage, updated_at: bl.lead.updated_at },
    company: {
      name: bl.company!.name,
      domain: bl.company!.domain,
      sector: bl.company!.sector,
      bio: bl.company!.description,
      city: bl.company!.city,
      country: bl.company!.hq_country,
    },
    founder: bl.contact
      ? {
          name: displayName(bl.contact.full_name),
          role: bl.contact.role,
          linkedin_url: bl.contact.linkedin_url,
          headline: bl.contact.headline,
        }
      : null,
    radar: {
      state: radar.state,
      score: radar.score,
      fit: radar.fit,
      timing: radar.timing,
      version: radar.version,
      signal: serializeSignal(radar),
    },
    scan:
      scoreAutomatico != null
        ? {
            // Dos scores, separados y etiquetados siempre. El consolidado lleva
            // curación humana; el automático es el registro de la máquina.
            score_automatico: scoreAutomatico,
            score_consolidado: scoreConsolidado,
            curated_dimensions: consolidado.manualCount,
            run_at: bl.scan!.created_at,
            report_url: bl.scan!.ui_url,
            components: consolidado.dimensions.map((d) => {
              const key = canonDimension(d.name);
              const stats = versions.find((v) => v.key === key)?.stats ?? null;
              return {
                dimension: key,
                label: d.name,
                detected: !d.missing && d.score != null,
                score: d.missing ? null : d.score,
                max: d.max,
                curated: curated.has(key),
                reading: d.reading,
                analysis: d.analysis,
                quote: d.quote ?? null,
                quote_url: d.quoteUrl ?? null,
                terms: d.terms ?? null,
                detection: stats
                  ? { detected_in: stats.detectedIn, total_runs: stats.totalRuns }
                  : null,
              };
            }),
          }
        : null,
    signals: signals.map((s) => ({
      type: s.type,
      detected_at: s.detected_at,
      detail: s.detail,
      author: (s as Signal & { agent_name?: string | null }).agent_name ?? null,
    })),
    notes: notes.map((n) => ({
      at: n.created_at,
      kind: n.kind,
      body: n.body,
      author: (n as typeof n & { agent_name?: string | null }).agent_name ?? null,
    })),
  };
}

// ---------- la cola completa, con radar ----------

export async function loadLeads() {
  const leads = await getBriefingLeads();
  const byCompany = await allSignalsByCompany();
  return leads.map((bl) =>
    serializeLead(bl, bl.company ? (byCompany.get(bl.company.id) ?? []) : []),
  );
}

async function allSignalsByCompany(): Promise<Map<string, Signal[]>> {
  if (isDemoMode()) return new Map();
  const db = getServiceSupabase()!;
  const { data } = await db.from('signals').select('*').order('detected_at', { ascending: false });
  const map = new Map<string, Signal[]>();
  for (const s of (data as Signal[] | null) ?? []) {
    if (!s.company_id) continue;
    map.set(s.company_id, [...(map.get(s.company_id) ?? []), s]);
  }
  return map;
}
