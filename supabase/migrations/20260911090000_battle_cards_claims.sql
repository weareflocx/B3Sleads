-- Battle Cards, claims: los tipos del estudio y el juicio humano por claim.
--
-- El léxico PROPONE un tipo; la persona DECIDE. Lo decidido se guarda y gana
-- siempre, igual que con el rol, la capa y la prioridad de cada marca: el
-- Scanner aporta material, el criterio lo pone el equipo.
--
-- Dos columnas:
--   claim_types     — el vocabulario de tipos de ESTE estudio. Vacío significa
--                     "los de por defecto": así un estudio antiguo sigue
--                     funcionando sin tocar nada.
--   claim_overrides — por identificador de claim, qué decidió la persona:
--                     {"tipo": "...", "oculto": true}. El identificador sale
--                     del dominio y del texto, así que sobrevive a recalcular.
alter table studies
  add column if not exists claim_types jsonb not null default '[]'::jsonb,
  add column if not exists claim_overrides jsonb not null default '{}'::jsonb;

-- Decidir sobre UN claim, sin releer el documento entero.
--
-- Clasificar es teclear rápido: con leer-modificar-escribir desde el cliente,
-- dos decisiones seguidas se pisan y una se pierde. Esta mezcla toca solo su
-- claim, como estudio_marca_merge hace con una marca.
--
-- Una clave con valor null borra ese campo. Un parche vacío borra el claim
-- entero del registro, que es como se vuelve a "lo que diga el léxico".
create or replace function estudio_claim_marcar(
  p_company_id uuid,
  p_claim_id text,
  p_patch jsonb,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies
     set claim_overrides = case
           when p_patch is null or p_patch = '{}'::jsonb
             then claim_overrides - p_claim_id
           else claim_overrides || jsonb_build_object(
             p_claim_id,
             (
               select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                 from jsonb_each(
                   coalesce(claim_overrides -> p_claim_id, '{}'::jsonb) || p_patch
                 ) as e(k, v)
                where v is distinct from 'null'::jsonb
             )
           )
         end,
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;

-- El vocabulario de tipos del estudio. Va entero: son ocho o diez y los
-- edita una persona cada vez, igual que los ejes.
create or replace function estudio_claim_tipos(
  p_company_id uuid,
  p_tipos jsonb,
  p_email text
) returns void
language sql
set search_path = public
as $$
  update studies
     set claim_types = coalesce(p_tipos, '[]'::jsonb),
         updated_by_email = coalesce(p_email, updated_by_email),
         updated_at = now()
   where company_id = p_company_id;
$$;
