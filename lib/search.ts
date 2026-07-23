// Búsqueda global de startups y founders. Los datos del radar son pocos
// (decenas), así que se filtra en memoria sobre los leads hidratados en vez
// de montar índices o full-text en Supabase. Rápido y sin dependencias.
import type { BriefingLead } from './types';
import { displayName, companyLabel } from './types';

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

export type SearchHit = CompanyHit | FounderHit;

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
