// Capa de acceso a datos. Con Supabase configurado lee de la BD;
// sin credenciales, sirve datos demo para desarrollo de UI.
import { cache } from 'react';
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

// Un scan sin su informe. `result_raw` es el informe entero del Scanner y
// pesa: los 173 scans del corpus suman 8,5 MB, y cada pantalla de lista los
// descargaba enteros para enseñar un número y una frase. Las listas piden
// solo esto; la ficha y el redactor, que sí leen el informe, piden el scan
// completo.
const SCAN_LIGERO = 'id, company_id, scanner_job_id, status, score, tldr, ui_url, created_at, completed_at';

// Un scan que lleva más de esto "en marcha" no está en marcha: el Scanner
// tarda minutos, no días. Se enseña como fallido en vez de "escaneando…"
// para siempre, y el sync puede cerrarlo de verdad si el informe existe.
const SCAN_COLGADO_MS = 6 * 60 * 60 * 1000;
function saneaScan(s: Scan): Scan {
  if (
    (s.status === 'queued' || s.status === 'running') &&
    Date.now() - new Date(s.created_at).getTime() > SCAN_COLGADO_MS
  ) {
    return { ...s, status: 'failed' };
  }
  return s;
}

// Todos los leads, hidratados. Se memoriza por petición (React `cache`): la
// home la pide dos veces (directa y vía getStartups), Founders tres, y sin
// esto cada una era otra vuelta completa a la base de datos.
//
// `conInforme` trae el informe del scan. Solo lo necesitan quienes redactan
// (Founders, regenerar mensaje): el resto lee score, estado y tldr.
export const getBriefingLeads = cache(async (conInforme = false): Promise<BriefingLead[]> => {
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
  return hydrateLeads(leads as Lead[], conInforme);
});

async function hydrateLeads(leads: Lead[], conInforme: boolean): Promise<BriefingLead[]> {
  if (!leads.length) return [];
  const db = getServiceSupabase()!;
  // Filtramos nulls: un founder sin empresa tiene company_id null y su
  // contacto se carga por contact_id (no por company_id), o desaparecería.
  const companyIds = [...new Set(leads.map((l) => l.company_id).filter(Boolean))];
  const contactIds = [...new Set(leads.map((l) => l.contact_id).filter(Boolean))];
  const scanIds = [...new Set(leads.map((l) => l.scan_id).filter(Boolean))];
  const leadIds = leads.map((l) => l.id);

  // Solo el scan al que apunta cada lead, no el histórico entero de la
  // empresa: el histórico lo pide la ficha por su cuenta.
  const [companies, signals, scans, contacts, messages] = await Promise.all([
    db.from('companies').select('*').in('id', companyIds),
    db.from('signals').select('*').in('company_id', companyIds).order('detected_at', { ascending: false }),
    db.from('scans').select(conInforme ? '*' : SCAN_LIGERO).in('id', scanIds),
    db.from('contacts').select('*').in('id', contactIds),
    db.from('messages').select('*').in('lead_id', leadIds).order('created_at', { ascending: false }),
  ]);

  const companyById = new Map((companies.data as Company[] | null)?.map((c) => [c.id, c]));
  const scanById = new Map(
    ((scans.data as unknown as Scan[] | null) ?? []).map((s) => [
      s.id,
      saneaScan(conInforme ? s : { ...s, evidence: null, result_raw: null }),
    ]),
  );
  const contactById = new Map((contacts.data as Contact[] | null)?.map((c) => [c.id, c]));
  // Señales agrupadas una vez, no un `filter` por lead.
  const signalsByCompany = new Map<string, Signal[]>();
  for (const s of (signals.data as Signal[] | null) ?? []) {
    if (!s.company_id) continue;
    const arr = signalsByCompany.get(s.company_id);
    if (arr) arr.push(s);
    else signalsByCompany.set(s.company_id, [s]);
  }
  const messageByLead = new Map<string, Message>();
  for (const m of (messages.data as Message[] | null) ?? []) {
    if (!messageByLead.has(m.lead_id)) messageByLead.set(m.lead_id, m);
  }

  // No descartamos leads sin empresa: un founder suelto (solo LinkedIn) es
  // válido y debe aparecer en su cola. company queda null hasta tener dominio.
  return leads.map((lead) => {
    const senales = lead.company_id ? (signalsByCompany.get(lead.company_id) ?? []) : [];
    return {
      lead,
      company: lead.company_id ? (companyById.get(lead.company_id) ?? null) : null,
      signal: senales[0] ?? null,
      // El radar necesita TODAS las señales para quedarse con la de más valor
      // viva (máximo, no la última ni la suma).
      signals: senales,
      scan: lead.scan_id ? (scanById.get(lead.scan_id) ?? null) : null,
      contact: lead.contact_id ? (contactById.get(lead.contact_id) ?? null) : null,
      message: messageByLead.get(lead.id) ?? null,
    };
  });
}

// Un lead concreto, con informe: lo que necesita quien redacta o regenera un
// mensaje. Antes se cargaba la cola entera para quedarse con una fila.
export async function getLeadFiche(leadId: string): Promise<BriefingLead | null> {
  if (isDemoMode()) return DEMO_LEADS.find((l) => l.lead.id === leadId) ?? null;
  const db = getServiceSupabase()!;
  const { data } = await db.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (!data) return null;
  const [bl] = await hydrateLeads([data as Lead], true);
  return bl ?? null;
}

// Ficha completa de una compañía por dominio (estilo Explee explore).
// Va directa a la empresa y a sus leads: la ficha de una marca no debería
// costar lo que cuesta la cola entera. Con varios leads manda el de más
// prioridad, como en la cola.
export async function getCompanyFiche(domain: string): Promise<BriefingLead | null> {
  const dom = domain.toLowerCase();
  if (isDemoMode()) return DEMO_LEADS.find((l) => l.company?.domain === dom) ?? null;
  const db = getServiceSupabase()!;
  const { data: company } = await db.from('companies').select('id').eq('domain', dom).maybeSingle();
  if (!company) return null;
  const { data: leads } = await db
    .from('leads')
    .select('*')
    .eq('company_id', company.id)
    .order('priority_score', { ascending: false, nullsFirst: false });
  if (!leads?.length) return null;
  const [bl] = await hydrateLeads(leads as Lead[], true);
  return bl ?? null;
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
  return scansConInforme((q) => q.eq('company_id', companyId).eq('status', 'ready'));
}

// Los scans con informe, por la vista `scans_ligeros` (el informe sin el
// rastro de adquisición, que es más de la mitad de cada uno y no se lee).
// Si la vista aún no está aplicada se cae a la tabla, con el informe entero:
// el resultado es el mismo, solo pesa más.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FiltroScans = (q: any) => any;
async function scansConInforme(filtra: FiltroScans): Promise<Scan[]> {
  const db = getServiceSupabase()!;
  const consulta = (tabla: string) =>
    filtra(db.from(tabla).select('*')).order('created_at', { ascending: true });
  const { data, error } = await consulta('scans_ligeros');
  if (!error && data) return data as Scan[];
  const { data: entero } = await consulta('scans');
  return (entero as Scan[] | null) ?? [];
}

// Founders en outreach en frío: con LinkedIn, aún sin contactar.
export async function getFounderQueue(conInforme = false): Promise<BriefingLead[]> {
  const all = await getBriefingLeads(conInforme);
  return all.filter(
    (l) => l.contact?.linkedin_url && ['detected', 'briefed'].includes(l.lead.stage),
  );
}

// Conversaciones abiertas: founders que ya respondieron por privado. La
// señal más fuerte del embudo y la métrica de éxito del proyecto.
export async function getConversations(conInforme = false): Promise<BriefingLead[]> {
  const all = await getBriefingLeads(conInforme);
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
export const getStartups = cache(async (): Promise<BriefingLead[]> => {
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
});

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
  // La curación humana. Sin esto el estudio comparaba automáticos mientras
  // la ficha enseñaba consolidados: la misma marca, dos números.
  selections: import('./consolidated').ComponentSelection[];
}

export async function getCorpusBrands(domains: string[]): Promise<MarcaCorpus[]> {
  const wanted = [...new Set(domains.map((d) => d.toLowerCase()))];
  if (isDemoMode() || wanted.length === 0) return [];
  const db = getServiceSupabase()!;
  const { data: companies } = await db.from('companies').select('*').in('domain', wanted);
  const comps = (companies as Company[] | null) ?? [];
  if (!comps.length) return [];
  const ids = comps.map((c) => c.id);
  const [scans, { data: leads }, { data: sels }] = await Promise.all([
    scansConInforme((q) => q.in('company_id', ids)),
    db.from('leads').select('*').in('company_id', ids),
    db
      .from('component_selections')
      .select('company_id, dimension, scan_id, is_manual, selected_by_email, note, selected_at')
      .in('company_id', ids),
  ]);
  const allScans = scans;
  const allLeads = (leads as Lead[] | null) ?? [];
  type Sel = import('./consolidated').ComponentSelection & { company_id: string };
  const allSels = (sels as Sel[] | null) ?? [];
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
        activo: mine.map(saneaScan).find((s) => ['queued', 'running', 'blocked'].includes(s.status)) ?? null,
        lead: allLeads.find((l) => l.company_id === company.id) ?? null,
        selections: allSels.filter((x) => x.company_id === company.id),
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
  if (!data) return null;
  // Los tres campos de Battle Cards se normalizan aquí en vez de confiar en
  // el DEFAULT de la tabla: así la app funciona igual antes y después de
  // aplicar la migración, y un despliegue no depende del orden.
  const fila = data as Record<string, unknown>;
  return {
    ...(fila as unknown as Study),
    marcas: (fila.marcas as Study['marcas']) ?? {},
    axes: (fila.axes as Study['axes']) ?? [],
    client_positions: (fila.client_positions as Study['client_positions']) ?? {},
    excluded_terms: (fila.excluded_terms as string[]) ?? [],
  };
}

// Excluir o recuperar un término del cruce de vocabulario.
export async function excluirTermino(
  companyId: string,
  termino: string,
  excluir: boolean,
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  const { error } = await db.rpc('estudio_termino_excluir', {
    p_company_id: companyId,
    p_term: termino,
    p_excluir: excluir,
    p_email: email,
  });
  if (error) throw error;
}

// Los ejes del estudio y la posición del cliente en ellos. Se manda el
// conjunto entero: son cuatro como mucho y los edita una persona cada vez.
export async function guardarEjes(
  companyId: string,
  axes: unknown,
  clientPositions: unknown,
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  const { error } = await db
    .from('studies')
    .update({
      axes,
      client_positions: clientPositions,
      updated_by_email: email,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId);
  if (error) throw error;
}

// Puntuar una marca en un eje. `valor` null borra la puntuación, que no es lo
// mismo que un 0 (0 es el extremo izquierdo del eje).
export async function guardarPuntuacionEje(
  companyId: string,
  dominio: string,
  eje: string,
  valor: number | null,
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  const { error } = await db.rpc('estudio_eje_score', {
    p_company_id: companyId,
    p_domain: dominio.toLowerCase(),
    p_axis: eje,
    p_value: valor,
    p_email: email,
  });
  if (error) throw error;
}

// Borrar un eje se lleva su definición, todas sus puntuaciones y las
// posiciones del cliente en él.
export async function borrarEje(
  companyId: string,
  eje: string,
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  const { error } = await db.rpc('estudio_eje_borrar', {
    p_company_id: companyId,
    p_axis: eje,
    p_email: email,
  });
  if (error) throw error;
}

// Escribe la ficha de UNA marca del estudio. Mezcla en la base (función
// estudio_marca_merge) en vez de releer y reescribir el documento entero:
// clasificar es teclear rápido, y dos escrituras seguidas desde el cliente
// se pisarían la una a la otra.
//
// Una clave con valor null borra ese campo de la ficha.
export async function guardarMarcaEstudio(
  companyId: string,
  dominio: string,
  parche: Record<string, unknown>,
  email: string | null,
): Promise<void> {
  if (isDemoMode()) return;
  const db = getServiceSupabase()!;
  const { error } = await db.rpc('estudio_marca_merge', {
    p_company_id: companyId,
    p_domain: dominio.toLowerCase(),
    p_patch: parche,
    p_email: email,
  });
  if (error) throw error;
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
