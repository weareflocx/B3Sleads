# Pipeline nocturno FLOC* Radar — paso Lusha (Claude Code headless)

Eres el paso de enriquecimiento del pipeline de FLOC* Radar. Trabajas con el
MCP de Lusha y la base de datos Supabase del proyecto. Sigue estos pasos EN ORDEN.

## Reglas duras de presupuesto
- ANTES de nada: llama a `account_usage` (gratis). Si `remaining < 20`,
  NO enriquezcas nada. Registra el saldo en el log y termina.
- Reveals: SOLO `reveal: ["emails"]` (1 crédito). NUNCA phones (10 créditos).
- Máximo 10 contactos enriquecidos por run.
- Presupuesto mensual total: 100 créditos. Si el consumo del mes (ver logs
  previos en logs/) supera 90, modo ahorro: solo señales, sin enriquecer.

## Paso 1 — Señales Lusha (opcional, si hay saldo)
1. `signals_companies_search` sobre el ICP: startups early-stage (pre-seed a
   serie A) de sectores web3/ai/marketplace/ecommerce/saas en Europa con señal
   de funding reciente.
2. Para cada empresa nueva encontrada (máx 5): comprueba si su dominio ya
   existe en la tabla `companies` de Supabase (dedupe). Si es nueva, insértala
   con `source='lusha_signal'` e inserta su señal en `signals`.

## Paso 2 — Enriquecimiento de contactos
1. Lee de Supabase los leads en stage `briefed` cuyo `contact_id` es NULL,
   ordenados por `priority_score` desc, máximo 10.
2. Para cada uno:
   a. `decision_makers_search` con el dominio de la empresa → busca founder,
      CEO o CTO (en ese orden de preferencia).
   b. Si hay contacto: `prospecting_contact_enrich` con `reveal: ["emails"]`.
   c. Inserta en `contacts` (full_name, role, email, linkedin_url, lusha_id,
      enriched_at=now) y actualiza `leads.contact_id`.
   d. Si Lusha no encuentra email: genera fallback por patrón
      `nombre@dominio` y guárdalo en `contacts.notes` como "email no
      verificado (patrón)" dejando `email` NULL.

## Paso 3 — Log
Escribe en `logs/lusha-run-YYYY-MM-DD.log`: saldo inicial, saldo final,
créditos gastados, contactos enriquecidos, empresas nuevas por señal.

## Acceso a Supabase
Usa la CLI o curl contra la API REST de Supabase con las variables de entorno
del proyecto (.env.local): NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
(header `apikey` + `Authorization: Bearer`).

## Prohibido
- Automatización de navegador contra LinkedIn en cualquier forma.
- API raw de Lusha (solo MCP).
- Reveals de teléfonos.
