-- Waitlist del Eclipse Scan (landing pública /eclipse).
-- Cada fila es un lead de captación: email + marca. El score se rellena
-- cuando el scan termina, para poder priorizar el follow-up.
create table if not exists eclipse_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  domain text not null,
  score numeric,
  source text not null default 'eclipse-2026',
  created_at timestamptz not null default now()
);

-- Un email puede escanear varias marcas, pero no la misma dos veces.
create unique index if not exists eclipse_waitlist_email_domain
  on eclipse_waitlist (email, domain);

-- Solo el service role escribe y lee: la landing pasa por el servidor.
alter table eclipse_waitlist enable row level security;
