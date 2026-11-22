// Búsqueda global del CRM. Los datos son pocos (cientos de filas por tabla),
// así que se filtra en memoria en vez de montar índices o full-text: rápido,
// insensible a tildes y sin dependencias. `searchLeads` cubre el radar (los
// leads del pipeline hidratados); `searchCrm` cubre todo el CRM consultando
// companies, contacts, investors y notes directamente.
import type { BriefingLead, Company, Contact, Investor, Lead, Note, Scan } from './types';
import { displayName, companyLabel } from './types';
import { getServiceSupabase, isDemoMode } from './supabase';
import { DEMO_LEADS } from './demo-data';

export interface CompanyHit {
  kind: 'company';
  name: string;
  domain: string;
  score: number | null;
  href: string;
}

export interface FounderHit {
  kind: 'founder';
  name: string;
  role: string | null;
  company: string | null;
  domain: string | null;
  href: string;
}

export interface InvestorHit {
  kind: 'investor';
  name: string;
  kind_label: string;
  hq: string | null;
  href: string;
}

export interface NoteHit {
  kind: 'note';
  name: string;
  company: string | null;
  date: string;
  href: string;
}

export type SearchHit = CompanyHit | FounderHit | InvestorHit | NoteHit;


function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function searchLeads(leads: BriefingLead[], rawQuery: string): SearchHit[] {
  const q = norm(rawQuery.trim());
  if (q.length < 2) return [];

  const companies = new Map<string, CompanyHit>();
  const founders: FounderHit[] = [];

  for (const bl of leads) {
    const c = bl.company;
    if (c) {
      const label = companyLabel(c.name, c.domain);
      const hay = norm(`${label} ${c.domain} ${c.sector ?? ''}`);
      // Una startup aparece una vez aunque tenga varios leads.
      if (hay.includes(q) && !companies.has(c.domain)) {
        companies.set(c.domain, {
          kind: 'company',
          name: label,
          domain: c.domain,
          score: bl.scan?.status === 'ready' ? (bl.scan.score ?? null) : null,
          href: `/companies/${c.domain}`,
        });
      }
    }

    const k = bl.contact;
    if (k) {
      const name = displayName(k.full_name);
      const hay = norm(`${name} ${k.role ?? ''} ${k.headline ?? ''}`);
      if (hay.includes(q)) {
        founders.push({
          kind: 'founder',
          name,
          role: k.role ?? null,
          company: c ? companyLabel(c.name, c.domain) : null,
          // El founder se abre por la ficha de su empresa; sin dominio no hay
          // a dónde ir, así que esos no enlazan.
          domain: c?.domain ?? null,
          href: c ? `/companies/${c.domain}` : '',
        });
      }
    }
  }

  // Startups primero (son el ancla del trabajo), luego founders. Prioriza
  // las coincidencias que empiezan por la consulta sobre las que la contienen.
  const starts = (s: string) => (norm(s).startsWith(q) ? 0 : 1);
  const companyHits = [...companies.values()].sort((a, b) => starts(a.name) - starts(b.name));
  const founderHits = founders
    .sort((a, b) => starts(a.name) - starts(b.name))
    .slice(0, 8);

  return [...companyHits.slice(0, 8), ...founderHits];
}


// Filas sueltas del CRM tal y como salen de la base de datos. Separar la
// consulta del filtrado deja la lógica pura y probable sin tocar Supabase.
export interface CrmRows {
  companies: Company[];
  contacts: Contact[];
  investors: Investor[];
  notes: Note[];
  // El lead solo hace falta para enlazar notas que cuelgan de él y no de la
  // empresa directamente.
  leads: Pick<Lead, 'id' | 'company_id'>[];
  // Scans 'ready' para pintar el score en las marcas.
  scans: Pick<Scan, 'company_id' | 'score'>[];
}

// Filtra y ordena las filas del CRM. Pure: la misma función que usa
// `searchCrm` en producción y los tests.
export function searchCrmRows(rows: CrmRows, rawQuery: string): SearchHit[] {
  const q = norm(rawQuery.trim());
  if (q.length < 2) return [];

  const byId = new Map(rows.companies.map((c) => [c.id, c]));
  const domainByLead = new Map(
    rows.leads.map((l) => [l.id, l.company_id ? byId.get(l.company_id)?.domain ?? null : null]),
  );
  // Score: el del scan 'ready' más reciente de cada empresa.
  const scoreByCompany = new Map<string, number | null>();
  for (const s of rows.scans) {
    if (s.company_id && !scoreByCompany.has(s.company_id)) {
      scoreByCompany.set(s.company_id, s.score ?? null);
    }
  }

  const starts = (s: string) => (norm(s).startsWith(q) ? 0 : 1);

  const companyHits: CompanyHit[] = rows.companies
    .filter((c) =>
      norm(
        `${companyLabel(c.name, c.domain)} ${c.domain ?? ''} ${c.sector ?? ''} ${(c.keywords ?? []).join(' ')}`,
      ).includes(q),
    )
    .map((c) => ({
      kind: 'company' as const,
      name: companyLabel(c.name, c.domain),
      domain: c.domain,
      score: scoreByCompany.get(c.id) ?? null,
      href: `/companies/${c.domain}`,
    }))
    .sort((a, b) => starts(a.name) - starts(b.name))
    .slice(0, 8);

  const founderHits: FounderHit[] = rows.contacts
    .filter((k) =>
      norm(
        `${displayName(k.full_name)} ${k.role ?? ''} ${k.headline ?? ''} ${k.email ?? ''} ${k.linkedin_handle ?? ''}`,
      ).includes(q),
    )
    .map((k) => {
      const c = byId.get(k.company_id);
      return {
        kind: 'founder' as const,
        name: displayName(k.full_name),
        role: k.role ?? null,
        company: c ? companyLabel(c.name, c.domain) : null,
        domain: c?.domain ?? null,
        href: c ? `/companies/${c.domain}` : '',
      };
    })
    .sort((a, b) => starts(a.name) - starts(b.name))
    .slice(0, 8);

  const investorHits: InvestorHit[] = rows.investors
    .filter((i) => norm(`${i.name} ${i.kind ?? ''} ${i.hq ?? ''} ${i.website ?? ''}`).includes(q))
    .map((i) => ({
      kind: 'investor' as const,
      name: i.name,
      kind_label: i.kind,
      hq: i.hq,
      href: `/investors/${i.slug}`,
    }))
    .sort((a, b) => starts(a.name) - starts(b.name))
    .slice(0, 4);

  const noteHits: NoteHit[] = rows.notes
    .filter((n) => norm(n.body).includes(q))
    .map((n) => {
      const domain = n.company_id
        ? byId.get(n.company_id)?.domain ?? null
        : n.lead_id
          ? domainByLead.get(n.lead_id) ?? null
          : null;
      const c = n.company_id ? byId.get(n.company_id) : undefined;
      return {
        kind: 'note' as const,
        name: n.body.replace(/\s+/g, ' ').trim().slice(0, 90),
        company: c ? companyLabel(c.name, c.domain) : null,
        date: n.created_at.slice(0, 10),
        href: domain ? `/companies/${domain}` : '',
      };
    })
    .sort((a, b) => starts(a.name) - starts(b.name))
    .slice(0, 4);

  // Marcas primero (ancla del trabajo), luego contactos, inversores y notas.
  return [...companyHits, ...founderHits, ...investorHits, ...noteHits];
}

// Búsqueda global contra el CRM entero: empresas, contactos, inversores y
// notas, haya o no lead en el pipeline. En modo demo cae al radar de muestra.
export async function searchCrm(rawQuery: string): Promise<SearchHit[]> {
  if (rawQuery.trim().length < 2) return [];
  if (isDemoMode()) return searchLeads(DEMO_LEADS, rawQuery);
  const db = getServiceSupabase();
  if (!db) return [];

  const [companies, contacts, investors, notes, leads] = await Promise.all([
    db.from('companies').select('*'),
    db.from('contacts').select('*'),
    db.from('investors').select('*'),
    db.from('notes').select('*').order('created_at', { ascending: false }),
    db.from('leads').select('id, company_id'),
  ]);
  for (const r of [companies, contacts, investors, notes, leads]) {
    if (r.error) throw r.error;
  }

  const companyIds = new Set(
    ((companies.data as Company[] | null) ?? []).map((c) => c.id),
  );
  const scans = await db
    .from('scans')
    .select('id, company_id, status, score, created_at')
    .eq('status', 'ready')
    .in('company_id', [...companyIds])
    .order('created_at', { ascending: false });
  if (scans.error) throw scans.error;

  return searchCrmRows(
    {
      companies: (companies.data as Company[] | null) ?? [],
      contacts: (contacts.data as Contact[] | null) ?? [],
      investors: (investors.data as Investor[] | null) ?? [],
      notes: (notes.data as Note[] | null) ?? [],
      leads: (leads.data as Lead[] | null) ?? [],
      scans: (scans.data as Scan[] | null) ?? [],
    },
    rawQuery,
  );
}
