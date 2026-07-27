-- B3S Leads — migración 010
-- Capa de curación por componente (spec de versiones, §4.3).
--
-- NUNCA modifica lo que la máquina vio: apunta a una versión concreta de un
-- componente dentro de un scan, no la edita. Si se perdiera la versión
-- original se perdería la posibilidad de medir la desviación y el argumento
-- de "esto es lo que el Scanner vio".
--
-- Las versiones NO necesitan tabla: se derivan de scans.result_raw
-- (lib/scan-versions.ts), que es inmutable por construcción.

create table if not exists component_selections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Clave canónica de la dimensión: purpose | magnetism | value-prop |
  -- personality | brand-idea | attributes | values | mission | vision |
  -- coherence. Texto, no enum: la rúbrica del Scanner puede crecer.
  dimension text not null,
  -- A qué scan pertenece la versión elegida. La versión concreta se localiza
  -- dentro de su result_raw por la clave de dimensión.
  scan_id uuid not null references scans(id) on delete cascade,
  selected_by_email text,
  selected_at timestamptz not null default now(),
  note text,
  -- false = valor por defecto (último run válido) · true = elección humana.
  -- Distingue una ficha curada de una que solo tiene el defecto, y es lo que
  -- permite medir el sesgo de curación (§8.3).
  is_manual boolean not null default false
);

-- Una sola selección activa por (empresa, dimensión).
create unique index if not exists idx_component_selections_unique
  on component_selections(company_id, dimension);

create index if not exists idx_component_selections_company
  on component_selections(company_id);

-- Cobertura de curación: cuántas dimensiones se han elegido a mano. Alimenta
-- la etiqueta "consolidado · 7/9 curadas" del bloque RESUMEN.
alter table companies add column if not exists curacion_cobertura integer;
