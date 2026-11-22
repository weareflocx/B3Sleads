import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchCrmRows, type CrmRows } from '../lib/search';
import type { Company, Contact, Investor, Note } from '../lib/types';

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'co-1',
    name: 'Flexiic',
    domain: 'flexiic.tech',
    description: null,
    hq_country: null,
    sector: 'saas',
    source: 'explee',
    created_at: '2026-01-01T00:00:00Z',
    linkedin_url: null,
    size: null,
    city: null,
    founded_year: null,
    funding_stage: null,
    determinants: null,
    competitors: null,
    keywords: null,
    icp_fit: null,
    icp_reason: null,
    logo_url: null,
    ...over,
  };
}

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'ct-1',
    company_id: 'co-1',
    lusha_id: null,
    full_name: 'Ana García',
    role: 'CEO',
    email: 'ana@flexiic.tech',
    linkedin_url: null,
    notes: null,
    enriched_at: null,
    linkedin_handle: null,
    headline: null,
    source: 'linkedin',
    last_touch_at: null,
    email_verified: false,
    city: null,
    phone: null,
    avatar_url: null,
    ...over,
  };
}

function investor(over: Partial<Investor> = {}): Investor {
  return {
    id: 'iv-1',
    slug: 'seedcap',
    name: 'SeedCap',
    website: 'seedcap.com',
    linkedin_url: null,
    hq: 'Madrid',
    kind: 'vc',
    thesis: null,
    notes: null,
    logo_url: null,
    company_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'nt-1',
    lead_id: null,
    company_id: 'co-1',
    body: 'Hablar de migración CSRD en la próxima llamada',
    kind: 'note',
    created_at: '2026-02-03T10:00:00Z',
    ...over,
  };
}

const base: CrmRows = {
  companies: [
    company(),
    company({ id: 'co-2', name: 'Heura', domain: 'heurafoods.com', sector: 'foodtech' }),
  ],
  contacts: [contact()],
  investors: [investor()],
  notes: [note()],
  leads: [{ id: 'ld-1', company_id: 'co-1' }],
  scans: [{ company_id: 'co-1', score: 7.4 }],
};

test('encuentra una marca sin lead en el pipeline', () => {
  const rows: CrmRows = {
    ...base,
    leads: [], // ningún lead apunta a ninguna empresa
    companies: [company({ id: 'co-9', name: 'Seccobrand', domain: 'seccobrand.com' })],
  };
  const hits = searchCrmRows(rows, 'secco');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'company');
  assert.equal(hits[0].href, '/companies/seccobrand.com');
});

test('encuentra un contacto sin lead por email', () => {
  const hits = searchCrmRows({ ...base, leads: [] }, 'ana@flexiic');
  const contacto = hits.find((h) => h.kind === 'founder');
  assert.ok(contacto);
  assert.equal(contacto.name, 'Ana García');
  assert.equal(contacto.href, '/companies/flexiic.tech');
});

test('encuentra inversores y notas', () => {
  const hits = searchCrmRows(base, 'csrd');
  const nota = hits.find((h) => h.kind === 'note');
  assert.ok(nota);
  assert.equal(nota.company, 'Flexiic');

  const inv = searchCrmRows(base, 'seed');
  assert.ok(inv.some((h) => h.kind === 'investor'));
});

test('la nota enlaza a la empresa vía su lead cuando no tiene company_id', () => {
  const hits = searchCrmRows(
    { ...base, notes: [note({ company_id: null, lead_id: 'ld-1' })] },
    'csrd',
  );
  const nota = hits.find((h) => h.kind === 'note');
  assert.equal(nota?.href, '/companies/flexiic.tech');
});

test('insensible a tildes y mayúsculas', () => {
  const hits = searchCrmRows(base, 'GARCÍA');
  assert.ok(hits.some((h) => h.kind === 'founder' && h.name === 'Ana García'));
});

test('la marca lleva el score de su scan listo', () => {
  const hit = searchCrmRows(base, 'flexiic').find((h) => h.kind === 'company');
  assert.equal(hit?.kind === 'company' ? hit.score : null, 7.4);
});

test('consulta corta devuelve vacío', () => {
  assert.deepEqual(searchCrmRows(base, 'a'), []);
});
