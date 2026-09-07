-- Battle Cards: clasificación, ejes de posicionamiento y posiciones del
-- cliente dentro de un estudio.
--
-- Por qué tres columnas nuevas y no una tabla aparte: un estudio es un
-- documento pequeño (decenas de marcas) que se lee entero siempre y se
-- comparte por enlace. Partirlo en tablas obligaría a unir en cada vista sin
-- ganar nada.
--
-- Por qué `marcas` va indexado por DOMINIO y no anidado dentro de su grupo:
-- la clasificación tiene que sobrevivir a mover una marca de grupo. Es el
-- mismo criterio que ya aplica fusionaNotas() con las notas. Además deja
-- `grupos` como está —pertenencia, orden y ocultas—, que es lo que viaja en
-- la URL y lo que hace que un enlace compartido siga valiendo.
alter table studies
  -- { "herbalife.com": { role, layer, priority, note, legacy_note,
  --                      axis_scores: { eje_1: 7 }, verification } }
  add column if not exists marcas jsonb not null default '{}'::jsonb,
  -- [{ axis_id, label_left, label_right, description? }] — máximo 4.
  add column if not exists axes jsonb not null default '[]'::jsonb,
  -- { current: { eje_1: 3 }, target: { eje_1: 8 } }
  add column if not exists client_positions jsonb not null default '{}'::jsonb;

-- El "por qué está en el estudio" pasa de grupos[].notas a marcas[].note.
-- La spec acota la nota a 140 caracteres para que quepa en una línea de la
-- lista; el texto original NO se pierde: lo que exceda queda en legacy_note.
-- Medido antes de escribir esto: 25 notas en producción, 3 pasan de 140, la
-- más larga 224 caracteres.
do $$
declare
  fila record;
  grupo jsonb;
  dominio text;
  texto text;
  acumulado jsonb;
begin
  for fila in select id, grupos, marcas from studies loop
    acumulado := coalesce(fila.marcas, '{}'::jsonb);

    for grupo in select value from jsonb_array_elements(fila.grupos) loop
      for dominio, texto in
        select key, value #>> '{}' from jsonb_each(coalesce(grupo -> 'notas', '{}'::jsonb))
      loop
        -- Si la marca ya tiene ficha no se pisa: esta migración solo siembra.
        if texto is not null and btrim(texto) <> '' and not jsonb_exists(acumulado, dominio) then
          acumulado := acumulado || jsonb_build_object(
            dominio,
            jsonb_strip_nulls(jsonb_build_object(
              'note', left(btrim(texto), 140),
              'legacy_note', case when length(btrim(texto)) > 140 then btrim(texto) else null end
            ))
          );
        end if;
      end loop;
    end loop;

    update studies set marcas = acumulado where id = fila.id;
  end loop;
end $$;

-- Escritura de la ficha de UNA marca, mezclando en vez de reemplazar.
--
-- Es una función y no un update desde la app porque clasificar es teclear
-- rápido: dos marcas seguidas leídas-modificadas-escritas desde el cliente se
-- pisan la una a la otra. Con el merge en la base, cada escritura toca solo
-- su dominio y el orden de llegada deja de importar.
create or replace function estudio_marca_merge(
  p_company_id uuid,
  p_domain text,
  p_patch jsonb,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies
     set marcas = marcas || jsonb_build_object(
           p_domain,
           jsonb_strip_nulls(coalesce(marcas -> p_domain, '{}'::jsonb) || p_patch)
         ),
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;

comment on function estudio_marca_merge(uuid, text, jsonb, text) is
  'Mezcla campos en studies.marcas[dominio] sin releer el documento. Una clave con valor null se elimina (jsonb_strip_nulls): asi se borra un campo de la ficha.';
