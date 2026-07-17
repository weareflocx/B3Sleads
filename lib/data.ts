// Capa de acceso a datos. Con Supabase configurado lee de la BD;
// sin credenciales, sirve datos demo para desarrollo de UI.
import { getSupabase, isDemoMode } from './supabase';
import { DEMO_LEADS } from './demo-data';
import type { BriefingLead, Company, Contact, Lead, Message, Scan, Signal } from './types';

export async function getBriefingLeads(): Promise<BriefingLead[]> {
  if (isDemoMode()) {
    return [...DEMO_LEADS].sort(
      (a, b) => (b.lead.priority_score ?? 0) - (a.lead.priority_score ?? 0),
    );
  }
  const db = getSupabase()!;
  const { data: leads, error } = await db
    .from('leads')
    .select('*')
    .order('priority_score', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return hydrateLeads(leads as Lead[]);
}

async function hydrateLeads(leads: Lead[]): Promise<BriefingLead[]> {
  const db = getSupabase()!;
  const companyIds = [...new Set(leads.map((l) => l.company_id))];
  const leadIds = leads.map((l) => l.id);

  const [companies, signals, scans, contacts, messages] = await Promise.all([
    db.from('companies').select('*').in('id', companyIds),
    db.from('signals').select('*').in('company_id', companyIds).order('detected_at', { ascending: false }),
    db.from('scans').select('*').in('company_id', companyIds),
    db.from('contacts').select('*').in('company_id', companyIds),
    db.from('messages').select('*').in('lead_id', leadIds).order('created_at', { ascending: false }),
  ]);

  const companyById = new Map((companies.data as Company[] | null)?.map((c) => [c.id, c]));
  const scanById = new Map((scans.data as Scan[] | null)?.map((s) => [s.id, s]));
  const contactById = new Map((contacts.data as Contact[] | null)?.map((c) => [c.id, c]));

  return leads
    .filter((l) => companyById.has(l.company_id))
    .map((lead) => ({
      lead,
      company: companyById.get(lead.company_id)!,
      signal:
        (signals.data as Signal[] | null)?.find((s) => s.company_id === lead.company_id) ?? null,
      scan: lead.scan_id ? (scanById.get(lead.scan_id) ?? null) : null,
      contact: lead.contact_id ? (contactById.get(lead.contact_id) ?? null) : null,
      message:
        (messages.data as Message[] | null)?.find((m) => m.lead_id === lead.id) ?? null,
    }));
}

// Ficha completa de una compañía por dominio (estilo Explee explore).
export async function getCompanyFiche(domain: string): Promise<BriefingLead | null> {
  const all = await getBriefingLeads();
  return all.find((l) => l.company.domain === domain) ?? null;
}

// Todos los founders con LinkedIn listos para contactar, por prioridad.
export async function getFounderQueue(): Promise<BriefingLead[]> {
  const all = await getBriefingLeads();
  return all.filter(
    (l) => l.contact?.linkedin_url && ['detected', 'briefed'].includes(l.lead.stage),
  );
}

export async function updateLeadStage(
  leadId: string,
  stage: string,
  discardReason?: string,
): Promise<void> {
  if (isDemoMode()) return; // no-op en demo
  const db = getSupabase()!;
  const { error } = await db
    .from('leads')
    .update({
      stage,
      discard_reason: discardReason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
  if (error) throw error;

  // Al pasar a contactado, marcar sent_at del último mensaje (spec §10.2)
  if (stage === 'contacted') {
    await db
      .from('messages')
      .update({ sent_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .is('sent_at', null);
  }
}

export async function saveEditedMessage(messageId: string, editedFinal: string): Promise<void> {
  if (isDemoMode()) return;
  const db = getSupabase()!;
  const { error } = await db
    .from('messages')
    .update({ edited_final: editedFinal })
    .eq('id', messageId);
  if (error) throw error;
}
