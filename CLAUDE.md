# B3S Leads

App de lead-gen para FLOC*. Detecta startups con ronda reciente o
lanzamiento, cualifica su marca con Brand3 Scanner, estructura la ficha
de compañía y del founder, y genera borradores de mensaje.
EL ENVÍO ES SIEMPRE HUMANO, POR LINKEDIN.

## Reglas duras
- NUNCA implementar automatización de navegador contra LinkedIn
  (Playwright, Puppeteer, cookies de sesión, scraping programático).
  Ni siquiera como feature flag. Ver spec §9. Los contactos de LinkedIn
  entran a mano (pegar URL) o vía proveedores de datos.
- NUNCA usar la API raw de Lusha (requiere plan Scale). Lusha solo
  vía MCP.
- Reveals de Lusha: solo emails (1 crédito). Nunca phones (10).
- Los mensajes generados siguen prompts/message-system.md. Sin em
  dashes, sin clichés de agencia, declarativo. Nunca pitch de servicios
  en el primer mensaje.
- Tokens y keys solo en .env.local. Verificar .gitignore antes de
  cada commit. Los datasets de data/ no se commitean.

## Modelo mental
- El canal es LinkedIn. `contacts.linkedin_url` es la unidad de trabajo.
- La ficha de compañía (estilo Explee) es el contexto: qué venden,
  determinants, competidores, keywords, señal y scan de Brand3.
- El Scanner es el diferencial: sus hallazgos son lo que hace que el
  mensaje sea irrepetible.

## Config editable
- config/icp.json — criterios ICP (positivos/negativos), alimenta la
  extracción de rondas y el QA del pipeline.
- config/floc-offer.json — oferta real de FLOC*, contexto para el
  redactor (no se pitchea).

## Stack
Next.js 15 + Supabase + Brand3 Scanner API + Claude API.
Pipeline nocturno en pipeline/nightly.ts + Claude Code para Lusha.

## Comandos
npm run dev · npm run pipeline:dry (sin gastar créditos) ·
npm run pipeline:run · npm run import:explee:dry
