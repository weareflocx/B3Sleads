-- Seguimiento de la invitación de LinkedIn.
--  - invite_checked_at: la última vez que se miró en LinkedIn y seguía sin
--    aceptar ("Sigue pendiente"). Silencia el aviso una semana.
--  - paused_at: desde cuándo está en pausa. Un lead aparcado porque no
--    aceptó vuelve al radar con una señal detectada DESPUÉS de esta fecha.
--    updated_at no sirve: lo mueve cualquier nota o scan.
alter table leads add column if not exists invite_checked_at timestamptz;
alter table leads add column if not exists paused_at timestamptz;

update leads set paused_at = updated_at where stage = 'paused' and paused_at is null;
