-- La invitación de LinkedIn como paso propio del embudo (etapas 'invited' y
-- 'connected', que caben en leads.stage porque es texto libre). La fecha de
-- la invitación necesita columna propia: updated_at la mueve cualquier nota o
-- scan, y los avisos de "sin aceptar" se cuentan desde el día que se invitó.
alter table leads add column if not exists invited_at timestamptz;

-- Los leads que ya estén en 'invited' sin fecha toman la de su último cambio.
update leads set invited_at = updated_at where stage = 'invited' and invited_at is null;
