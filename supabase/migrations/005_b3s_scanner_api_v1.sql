-- B3S Scanner API v1 usa identificadores opacos (no enteros).
-- La conversión preserva los IDs históricos existentes.
alter table scans
  alter column scanner_job_id type text using scanner_job_id::text;

alter table scans
  alter column status set default 'running';

create index if not exists idx_scans_scanner_job_id
  on scans(scanner_job_id);
