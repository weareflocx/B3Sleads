-- Los scans sin el rastro de adquisición.
--
-- `result_raw.acquisition_summary` (la cobertura de páginas del rastreo) es
-- el 57% de cada informe guardado y la app no lo lee en ningún sitio: solo
-- figura en un tipo. El estudio de marca baja 7,8 MB de informes para 44
-- marcas; por esta vista baja menos de la mitad. La tabla no cambia: el
-- informe entero sigue ahí para cuando haga falta.
create or replace view public.scans_ligeros as
select
  id,
  company_id,
  scanner_job_id,
  status,
  score,
  tldr,
  evidence,
  ui_url,
  created_at,
  completed_at,
  (result_raw - 'acquisition_summary') as result_raw
from public.scans;

grant select on public.scans_ligeros to service_role;
