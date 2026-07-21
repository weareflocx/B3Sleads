-- Supabase ya no autoexpone tablas nuevas del schema public.
-- RLS decide qué filas puede usar `authenticated`; `service_role` necesita
-- privilegios SQL aunque omita RLS en las operaciones server-only.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
