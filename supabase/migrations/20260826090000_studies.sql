-- Estudios de marca: el benchmark de un cliente, compartido por el equipo.
-- Un estudio pertenece a una company (el cliente) y agrupa marcas del corpus
-- por grupos con nombre. Los grupos son la unidad porque responden preguntas
-- distintas: competidores directos y referentes de modelo no se promedian.
create table if not exists studies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- [{ nombre: "Multinivel", dominios: ["herbalife.com"] }, ...]
  -- En jsonb y no en tabla aparte: el grupo no tiene vida propia fuera de su
  -- estudio, y así reordenar o renombrar es una sola escritura.
  grupos jsonb not null default '[]'::jsonb,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Un estudio por cliente: la ruta es /marcas/<dominio>, así que dos estudios
-- para la misma marca no tendrían dónde vivir.
create unique index if not exists studies_company on studies (company_id);

-- Solo el service role entra: la app lee y escribe desde servidor, como el
-- resto de tablas.
alter table studies enable row level security;
