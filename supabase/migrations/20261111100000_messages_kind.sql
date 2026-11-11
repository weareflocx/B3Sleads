-- Qué es cada mensaje, para contar bien los toques (seguimientos y
-- respuestas, pasos 6 y 7).
--  - first:    el primer mensaje al founder.
--  - followup: un toque más para conseguir respuesta.
--  - reply:    contestación a lo que dijo el founder. No cuenta como toque.
--
-- Aditiva y nullable: el código funciona con y sin ella (si falta, guarda
-- el mensaje sin kind). null = primer mensaje o anterior a la columna.
--
-- No se rellena hacia atrás: hasta esta rama solo se creaban primeros
-- mensajes (pipeline nocturno, redactar y regenerar), así que null ya
-- significa "first" en todas las filas existentes.
alter table messages add column if not exists kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_kind_check') then
    alter table messages
      add constraint messages_kind_check check (kind is null or kind in ('first', 'followup', 'reply'));
  end if;
end $$;
