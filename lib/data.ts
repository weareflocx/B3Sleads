// Capa de acceso a datos. Con Supabase configurado lee de la BD;
// sin credenciales, sirve datos demo para desarrollo de UI.
import { getServiceSupabase, isDemoMode } from './supabase';
import { DEMO_LEADS } from './demo-data';
import { mergeSectorVocabulary, parseSectorList } from './sectors';
import type { BriefingLead, Company, Contact, Lead, Message, Note, Scan, Signal, Study } from './types';

// Vocabulario de sectores para el picker: lista curada + los ya usados en la
// BD, sin duplicar. Así "añadir uno nuevo" se incorpora al vocabulario.
export async function getSectorVocabulary(): Promise<string[]> {
  let inUse: string[] = [];
  if (!isDemoMode()) {
    const db = getServiceSupabase()!;
    const { data } = await db.from('companies').select('sector').not('sector', 'is', null);
    inUse = ((data as { sector: string | null }[] | null) ?? []).flatMap((r) =>
      parseSectorList(r.sector),
    );
  }
  return mergeSectorVocabulary(inUse);
}

export async function getBriefingLeads(): Promise<BriefingLead[]> {
  if (isDemoMode()) {
    return [...DEMO_LEADS].sort(
      (a, b) => (b.lead.priority_score ?? 0) - (a.lead.priority_score ?? 0),
    );
  }
  const db = getServiceSupabase()!;
  const { data: leads, error } = await db
    .from('leads')
    .select('*')
    .order('priority_score', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return hydrateLeads(leads as Lead[]);
}

async function hydrateLeads(leads: Lead[]): Promise<BriefingLead[]> {
  const db = getServiceSupabase()!;
  // Filtramos nulls: un founder sin empresa tiene company_id null y su
  // contacto se carga por contact_id (no por company_id), o desaparecería.
  const companyIds = [...new Set(leads.map((l) => l.company_id).filter(Boolean))];
  const contactIds = [...new Set(leads.map((l) => l.contact_id).filter(Boolean))];
  const leadIds = leads.map((l) => l.id);

  const [companies, signals, scans, contacts, messages] = await Promise.all([
    db.from('companies').select('*').in('id', companyIds),
    db.from('signals').select('*').in('company_id', companyIds).order('detected_at', { ascending: false }),
    db.from('scans').select('*').in('company_id', companyIds),
    db.from('contacts').select('*').in('id', contactIds),
    db.from('messages').select('*').in('lead_id', leadIds).order('created_at', { ascending: false }),
  ]);

  const companyById = new Map((companies.data as Company[] | null)?.map((c) => [c.id, c]));
  const scanById = new Map((scans.data as Scan[] | null)?.map((s) => [s.id, s]));
  const contactById = new Map((contacts.data as Contact[] | null)?.map((c) => [c.id, c]));

  // No descartamos leads sin empresa: un founder suelto (solo LinkedIn) es
  // válido y debe aparecer en su cola. company queda null hasta tener dominio.
  return leads.map((lead) => ({
    lead,
    company: lead.company_id ? (companyById.get(lead.company_id) ?? null) : null,
    signal: lead.company_id
      ? ((signals.data as Signal[] | null)?.find((s) => s.company_id === lead.company_id) ?? null)
      : null,
    // El radar necesita TODAS las señales para quedarse con la de más valor
    // viva (máximo, no la última ni la suma).
    signals: lead.company_id
      ? ((signals.data as Signal[] | null)?.filter((s) => s.company_id === lead.company_id) ?? [])
      : [],
    scan: lead.scan_id ? (scanById.get(lead.scan_id) ?? null) : null,
    contact: lead.contact_id ? (contactById.get(lead.contact_id) ?? null) : null,
    message: (messages.data as Message[] | null)?.find((m) => m.lead_id === lead.id) ?? null,
  }));
}

// Ficha completa de una compañía por dominio (estilo Explee explore).
export async function getCompanyFiche(domain: string): Promise<BriefingLead | null> {
  const all = await getBriefingLeads();
  return all.find((l) => l.company?.domain === domain) ?? null;
}

// Todas las señales de una compañía, la más reciente primero.
export async function getCompanySignals(companyId: string): Promise<Signal[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('signals')
    .select('*')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false });
  return (data as Signal[] | null) ?? [];
}

// Histórico de scans de una compañía, del más antiguo al más reciente.
// Cada vez que se importa un informe se añade un scan; así se ve la evolución.
// Bitácora del lead, de la más reciente a la más antigua.
export async function getLeadNotes(leadId: string): Promise<Note[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  return (data as Note[] | null) ?? [];
}

export async function getCompanyScans(companyId: string): Promise<Scan[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('scans')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });
  return (data as Scan[] | null) ?? [];
}

// Founders en outreach en frío: con LinkedIn, aún sin contactar.
export async function getFounderQueue(): Promise<BriefingLead[]> {
  const all = await getBriefingLeads();
  return all.filter(
    (l) => l.contact?.linkedin_url && ['detected', 'briefed'].includes(l.lead.stage),
  );
}

// Conversaciones abiertas: founders que ya respondieron por privado. La
// señal más fuerte del embudo y la métrica de éxito del proyecto.
export async function getConversations(): Promise<BriefingLead[]> {
  const all = await getBriefingLeads();
  return all.filter(
    (l) => l.contact?.linkedin_url && ['conversation', 'call', 'proposal'].includes(l.lead.stage),
  );
}

// Selecciones de curación por componente (migración 010). Si la tabla aún no
// está aplicada, devuelve vacío: la ficha funciona igual con los defectos
// (último run válido) y el consolidado es idéntico al automático.
export async function getComponentSelections(
  companyId: string,
): Promise<import('./consolidated').ComponentSelection[]> {
  if (isDemoMode()) return [];
  try {
    const db = getServiceSupabase()!;
    const { data, error } = await db
      .from('component_selections')
      .select('dimension, scan_id, is_manual, selected_by_email, note, selected_at')
      .eq('company_id', companyId);
    if (error) return [];
    return (data as import('./consolidated').ComponentSelection[] | null) ?? [];
  } catch {
    return [];
  }
}

// Todos los founders de una marca. La tabla contacts ya cuelga de company_id,
// así que una startup puede tener varios: el lead apunta a uno (con quien se
// habla), pero la ficha los enseña todos.
export async function getCompanyContacts(companyId: string): Promise<Contact[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('contacts')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true });
  return (data as Contact[] | null) ?? [];
}

// Catálogo de startups (marcas): una entrada por empresa, no por lead. Es la
// vista brand-first (score B3S, sector, ronda, founder), independiente del
// stage; el trabajo por etapa sigue en Pipeline. De cada marca se elige el
// lead más informativo (scan listo primero, luego con founder).
export async function getStartups(): Promise<BriefingLead[]> {
  const all = await getBriefingLeads();
  const rank = (x: BriefingLead) =>
    (x.scan?.status === 'ready' ? 2 : 0) + (x.contact?.linkedin_url ? 1 : 0);
  const byDomain = new Map<string, BriefingLead>();
  for (const bl of all) {
    if (!bl.company) continue;
    const cur = byDomain.get(bl.company.domain);
    if (!cur || rank(bl) > rank(cur)) byDomain.set(bl.company.domain, bl);
  }
  return [...byDomain.values()];
}

export async function updateLeadStage(
  leadId: string,
  stage: string,
  discardReason?: string,
): Promise<void> {
  if (isDemoMode()) return; // no-op en demo
  const db = getServiceSupabase()!;
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
  const db = getServiceSupabase()!;
  const { error } = await db
    .from('messages')
    .update({ edited_final: editedFinal })
    .eq('id', messageId);
  if (error) throw error;
}

// ---------- el corpus ----------
// Marcas por dominio SIN pasar por leads. El estudio de marca compara contra
// competidores que no son leads ni deben serlo: si esta consulta arrancara
// de la tabla leads, como el resto, un competidor sería invisible aquí.
export interface MarcaCorpus {
  company: Company;
  scans: Scan[]; // del más antiguo al más reciente, solo 'ready'
  activo: Scan | null; // un scan en marcha, si lo hay
  lead: Lead | null; // presente solo si además es un lead
}

export async function getCorpusBrands(domains: string[]): Promise<MarcaCorpus[]> {
  const wanted = [...new Set(domains.map((d) => d.toLowerCase()))];
  if (isDemoMode() || wanted.length === 0) return [];
  const db = getServiceSupabase()!;
  const { data: companies } = await db.from('companies').select('*').in('domain', wanted);
  const comps = (companies as Company[] | null) ?? [];
  if (!comps.length) return [];
  const ids = comps.map((c) => c.id);
  const [{ data: scans }, { data: leads }] = await Promise.all([
    db.from('scans').select('*').in('company_id', ids).order('created_at', { ascending: true }),
    db.from('leads').select('*').in('company_id', ids),
  ]);
  const allScans = (scans as Scan[] | null) ?? [];
  const allLeads = (leads as Lead[] | null) ?? [];
  // Se devuelven en el orden pedido: el orden de un grupo lo decide quien lo
  // monta, no la base de datos.
  const byDomain = new Map(comps.map((c) => [c.domain, c]));
  return wanted
    .map((d) => byDomain.get(d))
    .filter((c): c is Company => Boolean(c))
    .map((company) => {
      const mine = allScans.filter((s) => s.company_id === company.id);
      return {
        company,
        scans: mine.filter((s) => s.status === 'ready'),
        activo: mine.find((s) => ['queued', 'running', 'blocked'].includes(s.status)) ?? null,
        lead: allLeads.find((l) => l.company_id === company.id) ?? null,
      };
    });
}

export async function getCorpusBrand(domain: string): Promise<MarcaCorpus | null> {
  const [m] = await getCorpusBrands([domain]);
  return m ?? null;
}

// ---------- estudios ----------
// El estudio deja de vivir en la URL: se guarda por cliente y lo ve todo el
// equipo. La URL sigue sirviendo para compartir un estado concreto, pero ya
// no es la única copia.
export async function getEstudio(companyId: string): Promise<Study | null> {
  if (isDemoMode()) return null;
  const db = getServiceSupabase()!;
  const { data } = await db.from('studies').select('*').eq('company_id', companyId).maybeSingle();
  return (data as Study | null) ?? null;
}

export async function guardarEstudio(
  companyId: string,
  grupos: Study['grupos'],
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  // upsert por company_id: un estudio por cliente, y guardar es siempre la
  // misma operación tanto si existe como si no.
  const { error } = await db.from('studies').upsert(
    { company_id: companyId, grupos, updated_by_email: email, updated_at: new Date().toISOString() },
    { onConflict: 'company_id' },
  );
  if (error) throw error;
}
