import { getBriefingLeads, getLeadNotes } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { BriefingLead, Lead } from '@/lib/types';
import type { LeadListQuery, LeadPatch } from './contracts';
import { AgentApiError } from './errors';
import { leadDetail, leadSummary } from './serializers';

export async function findLead(leadId: string): Promise<BriefingLead> {
  const leads = await getBriefingLeads();
  const lead = leads.find((item) => item.lead.id === leadId);
  if (!lead) {
    throw new AgentApiError(404, 'lead_not_found', 'Lead no encontrado.');
  }
  return lead;
}

export async function listAgentLeads(query: LeadListQuery) {
  let leads = await getBriefingLeads();

  if (query.stages.length > 0) {
    const allowed = new Set(query.stages);
    leads = leads.filter((item) => allowed.has(item.lead.stage));
  }
  if (query.ownerEmail) {
    leads = leads.filter(
      (item) =>
        (item.lead.owner_email ?? item.lead.created_by_email ?? '').toLowerCase() ===
        query.ownerEmail,
    );
  }
  if (query.hasLinkedIn !== undefined) {
    leads = leads.filter((item) => Boolean(item.contact?.linkedin_url) === query.hasLinkedIn);
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    leads = leads.filter((item) =>
      [
        item.company?.name,
        item.company?.domain,
        item.company?.sector,
        item.contact?.full_name,
        item.contact?.headline,
      ].some((value) => value?.toLowerCase().includes(needle)),
    );
  }

  const total = leads.length;
  const page = leads.slice(query.offset, query.offset + query.limit).map(leadSummary);
  return {
    data: page,
    meta: {
      total,
      limit: query.limit,
      offset: query.offset,
      has_more: query.offset + page.length < total,
    },
  };
}

export async function getAgentLead(leadId: string) {
  const lead = await findLead(leadId);
  const notes = await getLeadNotes(leadId);
  return leadDetail(lead, notes);
}

export async function patchAgentLead(leadId: string, patch: LeadPatch) {
  if (isDemoMode()) {
    throw new AgentApiError(
      409,
      'demo_mode_read_only',
      'El modo demo permite lectura, pero no guarda mutaciones.',
    );
  }

  await findLead(leadId);
  const db = getServiceSupabase()!;
  const now = new Date().toISOString();
  const update: Partial<Lead> = { updated_at: now };

  if (patch.stage !== undefined) {
    update.stage = patch.stage;
    update.discard_reason = patch.stage === 'discarded' ? (patch.discardReason ?? null) : null;
  }
  if (patch.ownerEmail !== undefined) {
    update.owner_email = patch.ownerEmail;
  }

  const { data, error } = await db
    .from('leads')
    .update(update)
    .eq('id', leadId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new AgentApiError(500, 'lead_update_failed', 'No se pudo actualizar el lead.');
  }
  if (!data) {
    throw new AgentApiError(404, 'lead_not_found', 'Lead no encontrado.');
  }

  if (patch.stage === 'contacted') {
    const { error: messageError } = await db
      .from('messages')
      .update({ sent_at: now })
      .eq('lead_id', leadId)
      .is('sent_at', null);
    if (messageError) {
      throw new AgentApiError(
        500,
        'message_touch_failed',
        'El lead cambió de etapa, pero no se pudo actualizar el mensaje.',
      );
    }
  }

  return getAgentLead(leadId);
}
