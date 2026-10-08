-- Respect RLS on public.scans when the lightweight scan view is queried.
alter view public.scans_ligeros set (security_invoker = true);
