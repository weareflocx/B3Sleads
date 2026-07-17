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
