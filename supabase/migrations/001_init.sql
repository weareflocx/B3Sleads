-- FLOC* Radar — schema inicial (spec §3)

-- Empresas detectadas
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text unique not null,
  description text,
  hq_country text,
  sector text,                    -- web3, ai, marketplace, ecommerce, saas
  source text not null,           -- 'lusha_signal' | 'rss' | 'manual' | 'engaged'
  created_at timestamptz default now()
);

-- Señales de momento
create table signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  type text not null,             -- 'funding_round' | 'hiring' | 'launch' | 'rebrand' | 'engagement'
  detail jsonb,                   -- { amount, round, investors[], source_url, ... }
  detected_at timestamptz default now()
);

-- Resultados de B3S Scanner
create table scans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  scanner_job_id text not null,             -- id opaco devuelto por B3S API v1
  status text not null default 'running',   -- running | blocked | ready | failed | cancelled
  score numeric,                            -- score principal del result
  tldr jsonb,                               -- TLDR Brand3 completo
  evidence jsonb,                           -- hallazgos para personalizar mensaje
  result_raw jsonb,                         -- payload completo de /result
  ui_url text,                              -- link al informe visual
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Contactos (founder/CEO/CTO)
create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  lusha_id text,
  full_name text not null,
  role text,
  email text,
  linkedin_url text,
  notes text,                     -- ángulo personal tras revisar su perfil
  enriched_at timestamptz
);

-- Leads = unidad del pipeline
create table leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id),
  scan_id uuid references scans(id),
  stage text not null default 'detected',
  -- detected | briefed | contacted | conversation | call | proposal | won | lost | discarded
  priority_score numeric,         -- score compuesto para ordenar el briefing
  discard_reason text,            -- alimenta el aprendizaje del filtro
  updated_at timestamptz default now()
);

-- Mensajes generados
create table messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  channel text not null,          -- 'linkedin' | 'email'
  lang text not null default 'en',
  draft text not null,
  edited_final text,              -- lo que Sergio realmente envió (feedback loop)
  sent_at timestamptz,
  replied boolean default false,
  created_at timestamptz default now()
);

-- Índices para el briefing y dedupe
create index idx_leads_stage on leads(stage);
create index idx_leads_priority on leads(priority_score desc);
create index idx_signals_company on signals(company_id);
create index idx_scans_company on scans(company_id);
create index idx_messages_lead on messages(lead_id);

-- RLS: un solo usuario en MVP. La app va detrás de Supabase Auth;
-- el pipeline usa la service role key (bypassa RLS).
alter table companies enable row level security;
alter table signals enable row level security;
alter table scans enable row level security;
alter table contacts enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;

create policy "authenticated read/write companies" on companies
  for all to authenticated using (true) with check (true);
create policy "authenticated read/write signals" on signals
  for all to authenticated using (true) with check (true);
create policy "authenticated read/write scans" on scans
  for all to authenticated using (true) with check (true);
create policy "authenticated read/write contacts" on contacts
  for all to authenticated using (true) with check (true);
create policy "authenticated read/write leads" on leads
  for all to authenticated using (true) with check (true);
create policy "authenticated read/write messages" on messages
  for all to authenticated using (true) with check (true);
