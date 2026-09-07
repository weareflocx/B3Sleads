-- Battle Cards, ejes: escritura de puntuaciones y borrado de un eje.
--
-- Va aparte de la migración anterior por comodidad de despliegue, no por
-- dependencia: las dos son idempotentes y se pueden pegar juntas o repetidas.

-- Puntuar una marca en UN eje.
--
-- estudio_marca_merge no vale aquí: mezcla a un solo nivel, así que mandar
-- {axis_scores: {...}} reemplazaría el objeto entero y la puntuación que otra
-- persona acabara de poner en otro eje desaparecería. Esta mezcla baja un
-- nivel más y toca solo su eje.
--
-- p_value null borra la puntuación de ese eje: no es lo mismo que un 0, que
-- significa "en el extremo izquierdo".
create or replace function estudio_eje_score(
  p_company_id uuid,
  p_domain text,
  p_axis text,
  p_value int,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies
     set marcas = marcas || jsonb_build_object(
           p_domain,
           coalesce(marcas -> p_domain, '{}'::jsonb) || jsonb_build_object(
             'axis_scores',
             case
               when p_value is null
                 then coalesce(marcas -> p_domain -> 'axis_scores', '{}'::jsonb) - p_axis
               else coalesce(marcas -> p_domain -> 'axis_scores', '{}'::jsonb)
                    || jsonb_build_object(p_axis, to_jsonb(p_value))
             end
           )
         ),
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;

-- Borrar un eje se lleva por delante TODO lo suyo: su definición, la
-- puntuación de cada marca y las posiciones del cliente. Dejar puntuaciones
-- huérfanas significaría que crear un eje nuevo con el mismo identificador
-- heredaría números que nadie puso.
create or replace function estudio_eje_borrar(
  p_company_id uuid,
  p_axis text,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies s
     set axes = coalesce(
           (select jsonb_agg(e)
              from jsonb_array_elements(s.axes) e
             where e ->> 'axis_id' is distinct from p_axis),
           '[]'::jsonb
         ),
         marcas = coalesce(
           (select jsonb_object_agg(
                     k,
                     case when jsonb_exists(v, 'axis_scores')
                       then v || jsonb_build_object('axis_scores', (v -> 'axis_scores') - p_axis)
                       else v
                     end
                   )
              from jsonb_each(s.marcas) as t(k, v)),
           '{}'::jsonb
         ),
         client_positions = jsonb_strip_nulls(jsonb_build_object(
           'current', nullif(coalesce(s.client_positions -> 'current', '{}'::jsonb) - p_axis, '{}'::jsonb),
           'target',  nullif(coalesce(s.client_positions -> 'target',  '{}'::jsonb) - p_axis, '{}'::jsonb)
         )),
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;
