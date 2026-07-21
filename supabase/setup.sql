-- B3S Leads — setup completo de base de datos.
-- Pega TODO esto en el SQL Editor de Supabase y pulsa Run. Una sola vez.

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

-- Supabase no autoexpone tablas nuevas: las políticas RLS no bastan sin los
-- privilegios SQL base para los roles de API.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;


-- B3S Leads — migración 002
-- 1) Ficha de compañía estilo Explee: el contexto que hace irrepetible el mensaje.
-- 2) LinkedIn como canal primario del contacto (el envío es humano, por LinkedIn).

-- ---------- Ficha de compañía ----------
alter table companies add column if not exists linkedin_url text;
alter table companies add column if not exists size text;          -- '1-10' | '11-50' | '51-200' | ...
alter table companies add column if not exists city text;
alter table companies add column if not exists founded_year integer;
alter table companies add column if not exists funding_stage text; -- pre-seed | seed | series-a | ...

-- Research estilo Explee. Lo rellena el Scanner (evidence) o el import.
alter table companies add column if not exists determinants jsonb;  -- ["Qué les hace distintos", ...]
alter table companies add column if not exists competitors jsonb;   -- [{name, domain}, ...]
alter table companies add column if not exists keywords jsonb;      -- ["saas", "b2b", ...]

-- Fit de ICP calculado (0-100) + por qué. Alimenta el briefing y el descarte.
alter table companies add column if not exists icp_fit numeric;
alter table companies add column if not exists icp_reason text;

-- source ahora incluye 'explee' y 'linkedin' (import manual de perfiles)
-- Valores: lusha_signal | rss | manual | engaged | explee | linkedin

-- ---------- Contactos: LinkedIn primero ----------
-- linkedin_handle es la identidad canónica del founder (dedupe real:
-- una persona puede cambiar de empresa, su handle no).
alter table contacts add column if not exists linkedin_handle text;
alter table contacts add column if not exists headline text;        -- titular del perfil
alter table contacts add column if not exists source text;          -- explee | linkedin | lusha | engaged | manual
alter table contacts add column if not exists last_touch_at timestamptz;
alter table contacts add column if not exists email_verified boolean default false;

create unique index if not exists idx_contacts_linkedin_handle
  on contacts(linkedin_handle) where linkedin_handle is not null;
create index if not exists idx_companies_icp_fit on companies(icp_fit desc);
create index if not exists idx_contacts_company on contacts(company_id);

-- ---------- Mensajes: LinkedIn por defecto ----------
alter table messages alter column channel set default 'linkedin';

-- ---------- Vista: cola de founders lista para contactar ----------
-- Un founder entra en la cola si tiene LinkedIn, su lead está vivo y no
-- se ha contactado. Ordenada por priority_score.
create or replace view founder_queue as
select
  l.id           as lead_id,
  l.stage,
  l.priority_score,
  c.id           as contact_id,
  c.full_name,
  c.role,
  c.linkedin_url,
  c.headline,
  c.notes,
  co.id          as company_id,
  co.name        as company_name,
  co.domain,
  co.sector,
  co.size,
  co.funding_stage,
  co.icp_fit,
  s.score        as brand3_score,
  s.status       as scan_status,
  s.ui_url       as scan_url
from leads l
join companies co on co.id = l.company_id
join contacts c   on c.id = l.contact_id
left join scans s on s.id = l.scan_id
where c.linkedin_url is not null
  and l.stage in ('detected', 'briefed')
order by l.priority_score desc nulls last;
