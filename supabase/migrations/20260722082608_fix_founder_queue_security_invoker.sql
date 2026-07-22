-- Ejecuta la vista con los permisos y las políticas RLS del usuario que la
-- consulta, no con los del propietario que la creó.
alter view public.founder_queue set (security_invoker = true);
