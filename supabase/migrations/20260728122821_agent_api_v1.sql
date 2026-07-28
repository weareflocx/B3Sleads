-- B3S Leads Agent API v1
--
-- Las credenciales de agentes nunca se guardan en claro. La API recibe el
-- Bearer token, calcula SHA-256 y busca este hash con service_role.
-- La tabla permanece cerrada a anon/authenticated incluso si public está
-- expuesto por la Data API de Supabase.

create table if not exists agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  token_prefix text not null check (char_length(token_prefix) between 8 and 32),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}' check (
    scopes <@ array[
      'leads:read',
      'leads:write',
      'notes:write',
      'signals:write',
      'scans:write'
    ]::text[]
  ),
  created_by_email text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

-- La migración es reejecutable en desarrollo y actualiza el catálogo de
-- scopes aunque una versión anterior ya hubiera creado la tabla.
alter table agent_api_keys
  drop constraint if exists agent_api_keys_scopes_check;
alter table agent_api_keys
  add constraint agent_api_keys_scopes_check check (
    scopes <@ array[
      'leads:read',
      'leads:write',
      'notes:write',
      'signals:write',
      'scans:write'
    ]::text[]
  );

create index if not exists agent_api_keys_active_hash_idx
  on agent_api_keys(token_hash)
  where revoked_at is null;

alter table agent_api_keys enable row level security;

-- 006 concede privilegios por defecto a authenticated para tablas futuras.
-- Esta tabla contiene material de autenticación y se cierra explícitamente.
revoke all on table agent_api_keys from anon, authenticated;
grant select, insert, update, delete on table agent_api_keys to service_role;

-- Auditoría estructurada. No se guarda el payload para evitar duplicar PII o
-- texto sensible; basta quién hizo qué, sobre qué recurso y en qué request.
create table if not exists agent_api_actions (
  id uuid primary key default gen_random_uuid(),
  agent_api_key_id uuid references agent_api_keys(id) on delete set null,
  agent_key_fingerprint text not null,
  agent_name text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_api_actions_created_idx
  on agent_api_actions(created_at desc);

alter table agent_api_actions enable row level security;
revoke all on table agent_api_actions from anon, authenticated;
grant select, insert, update, delete on table agent_api_actions to service_role;

-- Contadores duraderos por ventana. Se actualizan mediante una función
-- atómica para que dos instancias serverless no puedan saltarse la cuota.
create table if not exists agent_api_rate_limits (
  agent_key_fingerprint text not null,
  bucket text not null,
  window_seconds integer not null,
  window_start bigint not null,
  request_count integer not null default 0,
  primary key (agent_key_fingerprint, bucket, window_seconds, window_start)
);

alter table agent_api_rate_limits enable row level security;
revoke all on table agent_api_rate_limits from anon, authenticated;
grant select, insert, update, delete on table agent_api_rate_limits to service_role;

create or replace function consume_agent_api_quota(
  p_key_fingerprint text,
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  is_allowed boolean,
  current_count integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  epoch_seconds bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  active_window bigint;
  consumed integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then
    raise exception 'invalid agent API quota';
  end if;

  active_window := epoch_seconds / p_window_seconds;

  insert into public.agent_api_rate_limits (
    agent_key_fingerprint,
    bucket,
    window_seconds,
    window_start,
    request_count
  )
  values (
    p_key_fingerprint,
    p_bucket,
    p_window_seconds,
    active_window,
    1
  )
  on conflict (agent_key_fingerprint, bucket, window_seconds, window_start)
  do update set request_count = public.agent_api_rate_limits.request_count + 1
  returning public.agent_api_rate_limits.request_count into consumed;

  delete from public.agent_api_rate_limits
  where agent_key_fingerprint = p_key_fingerprint
    and bucket = p_bucket
    and window_seconds = p_window_seconds
    and window_start < active_window - 2;

  return query select
    consumed <= p_limit,
    consumed,
    (p_window_seconds - (epoch_seconds % p_window_seconds))::integer;
end;
$$;

revoke all on function consume_agent_api_quota(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function consume_agent_api_quota(text, text, integer, integer)
  to service_role;

-- Reserva y respuesta de operaciones idempotentes que crean varios recursos
-- (por ejemplo, alta de lead + contacto + compañía).
create table if not exists agent_api_requests (
  agent_key_fingerprint text not null,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (agent_key_fingerprint, operation, idempotency_key)
);

alter table agent_api_requests enable row level security;
revoke all on table agent_api_requests from anon, authenticated;
grant select, insert, update, delete on table agent_api_requests to service_role;

-- Idempotencia de notas creadas por agentes. El fingerprint son los primeros
-- 16 caracteres del hash SHA-256, nunca parte del token en claro.
alter table notes
  add column if not exists agent_key_fingerprint text,
  add column if not exists idempotency_key text,
  add column if not exists agent_request_hash text,
  add column if not exists agent_api_key_id uuid references agent_api_keys(id) on delete set null,
  add column if not exists agent_name text;

create unique index if not exists notes_agent_idempotency_idx
  on notes(agent_key_fingerprint, idempotency_key)
  where agent_key_fingerprint is not null and idempotency_key is not null;

-- Idempotencia local de lanzamientos. B3S Scanner también recibe la misma key,
-- pero este índice evita duplicar filas locales si dos requests llegan a la vez.
alter table scans
  add column if not exists agent_key_fingerprint text,
  add column if not exists idempotency_key text,
  add column if not exists agent_request_hash text;

create unique index if not exists scans_agent_idempotency_idx
  on scans(agent_key_fingerprint, idempotency_key)
  where agent_key_fingerprint is not null and idempotency_key is not null;

-- Señales registradas por agentes: misma garantía de autoría e idempotencia.
alter table signals
  add column if not exists agent_key_fingerprint text,
  add column if not exists idempotency_key text,
  add column if not exists agent_request_hash text,
  add column if not exists agent_api_key_id uuid references agent_api_keys(id) on delete set null,
  add column if not exists agent_name text;

create unique index if not exists signals_agent_idempotency_idx
  on signals(agent_key_fingerprint, idempotency_key)
  where agent_key_fingerprint is not null and idempotency_key is not null;
