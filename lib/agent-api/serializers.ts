import { computeRadar } from '@/lib/radar';
import { leadTemperature } from '@/lib/scoring';
import type { BriefingLead, Note, Scan, Signal } from '@/lib/types';

function signalView(signal: Signal) {
  const detail = signal.detail as Record<string, unknown> | null;
  return {
    id: signal.id,
    type: signal.type,
    detected_at: signal.detected_at,
    occurred_at: detail?.occurred_at ?? detail?.announced_at ?? detail?.date ?? null,
    evidence: detail?.evidence ?? detail?.quote ?? null,
    source_url: detail?.source_url ?? detail?.url ?? null,
    detail,
  };
}

export function scanView(scan: Scan | null) {
  if (!scan) return null;
  return {
    id: scan.id,
    status: scan.status,
    score: scan.score == null ? null : Number(scan.score),
    tldr: scan.tldr,
    evidence: scan.evidence,
    ui_url: scan.ui_url,
    created_at: scan.created_at,
    completed_at: scan.completed_at,
  };
}

export function noteView(note: Note) {
  const attributed = note as Note & { agent_name?: string | null };
  return {
    id: note.id,
    lead_id: note.lead_id,
    company_id: note.company_id,
    body: note.body,
    kind: note.kind,
    created_at: note.created_at,
    author: attributed.agent_name ?? null,
  };
}

function radarView(bl: BriefingLead) {
  const radar = computeRadar(bl, bl.signals);
  const best = radar.best;
  return {
    version: radar.version,
    state: radar.state,
    fit: radar.fit,
    timing: radar.timing,
    score: radar.score,
    best_signal: best
      ? {
          id: best.signal.id,
          type: best.type,
          label: best.label,
          level: best.level,
          occurred_at: best.occurredAt,
          value: best.value,
          evidence: best.evidence,
          source_url: best.sourceUrl,
        }
      : null,
  };
}

function companyView(bl: BriefingLead) {
  const company = bl.company;
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    domain: company.domain,
    description: company.description,
    sector: company.sector,
    hq_country: company.hq_country,
    city: company.city,
    size: company.size,
    founded_year: company.founded_year,
    funding_stage: company.funding_stage,
    linkedin_url: company.linkedin_url,
    icp_fit: company.icp_fit,
    icp_reason: company.icp_reason,
  };
}

function contactView(bl: BriefingLead) {
  const contact = bl.contact;
  if (!contact) return null;
  return {
    id: contact.id,
    full_name: contact.full_name,
    role: contact.role,
    linkedin_url: contact.linkedin_url,
    headline: contact.headline,
    city: contact.city,
    notes: contact.notes,
    last_touch_at: contact.last_touch_at,
  };
}

export function leadSummary(bl: BriefingLead) {
  return {
    id: bl.lead.id,
    stage: bl.lead.stage,
    priority_score: bl.lead.priority_score,
    discard_reason: bl.lead.discard_reason,
    owner_email: bl.lead.owner_email ?? bl.lead.created_by_email ?? null,
    updated_at: bl.lead.updated_at,
    company: companyView(bl),
    contact: contactView(bl),
    radar: radarView(bl),
    temperature: leadTemperature(bl),
    latest_signal: bl.signal ? signalView(bl.signal) : null,
    scan: scanView(bl.scan),
    has_message_draft: Boolean(bl.message?.draft),
    links: {
      self: `/api/v1/leads/${bl.lead.id}`,
      notes: `/api/v1/leads/${bl.lead.id}/notes`,
      company_scan: bl.company ? `/api/v1/companies/${bl.company.domain}/scans` : null,
    },
  };
}

export function leadDetail(bl: BriefingLead, notes: Note[]) {
  return {
    ...leadSummary(bl),
    signals: bl.signals.map(signalView),
    message: bl.message
      ? {
          id: bl.message.id,
          channel: bl.message.channel,
          lang: bl.message.lang,
          draft: bl.message.draft,
          edited_final: bl.message.edited_final,
          sent_at: bl.message.sent_at,
          replied: bl.message.replied,
          created_at: bl.message.created_at,
        }
      : null,
    notes: notes.map(noteView),
    safety: {
      outbound_messages_require_human: true,
      linkedin_browser_automation_allowed: false,
    },
  };
}
