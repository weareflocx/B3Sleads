-- Los fondos como entidad propia. Hasta ahora vivían como texto dentro de
-- signals.detail.investors, lo que impedía tener ficha, web verificada y
-- ranking. La relación fondo → participada NO se duplica aquí: se sigue
-- derivando de las rondas, así que corregir una ronda actualiza la cartera.

create table if not exists investors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,          -- identidad canónica ("adara")
  name text not null,                 -- como se muestra ("Adara Ventures")
  website text,                       -- dominio verificado a mano, sin http
  linkedin_url text,
  hq text,
  kind text not null default 'vc',    -- vc | angel | corporate | accelerator
  thesis text,                        -- en qué invierten, en una línea
  notes text,
  -- Ficha de compañía del propio fondo. Existe solo si se ha escaneado su
  -- marca: permite reutilizar scans sin tocar el modelo de datos.
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists investors_slug_idx on investors (slug);

-- Marca las companies que son fondos, para que ningún listado de startups
-- las cuente como lead.
alter table companies add column if not exists is_investor boolean not null default false;

grant select, insert, update, delete on investors to service_role;
grant select on investors to authenticated;
