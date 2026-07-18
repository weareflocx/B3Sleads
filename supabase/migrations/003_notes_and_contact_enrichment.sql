-- 003 · Notas con fecha + enriquecimiento del founder
--
-- notes: bitácora del lead. Cada nota es un registro con fecha, para poder
-- listarlas por fecha y, más adelante, alimentar recomendaciones. kind separa
-- notas manuales de informes generados (p.ej. brief de llamada).
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  body text not null,
  kind text not null default 'note', -- note | call_report | insight
  created_at timestamptz not null default now()
);
create index if not exists notes_lead_id_created_idx on notes (lead_id, created_at desc);

-- Enriquecimiento del contacto: ciudad y teléfono (alta manual o proveedor de
-- datos; nunca por scraping de LinkedIn, spec §9).
alter table contacts add column if not exists city text;
alter table contacts add column if not exists phone text;

-- RLS: consistente con el resto (lectura/escritura vía service role en servidor)
alter table notes enable row level security;
