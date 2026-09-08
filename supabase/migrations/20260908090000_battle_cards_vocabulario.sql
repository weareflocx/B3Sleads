-- Battle Cards, vocabulario: la lista de términos excluidos por estudio.
--
-- El cruce saca expresiones compartidas del texto literal de las marcas, y
-- una parte siempre será idioma y no categoría ("more than", "quienes
-- somos"). El contraste contra el resto del corpus las hunde en el orden,
-- pero no las hace desaparecer. Excluirlas es un juicio, se hace una vez y
-- se queda.
alter table studies
  add column if not exists excluded_terms jsonb not null default '[]'::jsonb;

-- Añadir o quitar un término, sin releer el documento: excluir es teclear
-- rápido, y leer-modificar-escribir desde el cliente pierde exclusiones.
create or replace function estudio_termino_excluir(
  p_company_id uuid,
  p_term text,
  p_excluir boolean,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies
     set excluded_terms = case
           when p_excluir then
             case when excluded_terms @> to_jsonb(array[lower(btrim(p_term))])
               then excluded_terms
               else excluded_terms || to_jsonb(array[lower(btrim(p_term))])
             end
           else coalesce(
             (select jsonb_agg(t)
                from jsonb_array_elements_text(excluded_terms) t
               where t is distinct from lower(btrim(p_term))),
             '[]'::jsonb
           )
         end,
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;
