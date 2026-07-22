-- Quién responde por el lead. `created_by_email` (004) ya dice quién lo
-- detectó y no se toca nunca: es historia. `owner_email` dice quién lo está
-- trabajando ahora y cambia al delegar. Nulo = lo lleva quien lo detectó.
alter table leads add column if not exists owner_email text;
create index if not exists leads_owner_email_idx on leads (owner_email);
