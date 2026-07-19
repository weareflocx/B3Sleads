-- 004 · Leaderboard: atribución de leads por usuario
--
-- created_by_email: el email del usuario logueado que añadió el lead.
-- Alimenta el ranking de usuarios (puntos por fase alcanzada). Los leads
-- del pipeline nocturno o anteriores al login quedan null → "equipo FLOC*".
alter table leads add column if not exists created_by_email text;
-- Backfill: lo anterior al login es de Sergio
update leads set created_by_email = 'sergio@wearefloc.com' where created_by_email is null;
