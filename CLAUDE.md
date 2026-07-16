# FLOC* Radar

App de lead-gen para FLOC*. Detecta startups con ronda reciente,
cualifica su marca con Brand3 Scanner, enriquece contacto vía Lusha
MCP y genera borradores de mensaje. EL ENVÍO ES SIEMPRE HUMANO.

## Reglas duras
- NUNCA implementar automatización de navegador contra LinkedIn
  (Playwright, Puppeteer, cookies de sesión). Ni siquiera como
  feature flag. Ver spec §9.
- NUNCA usar la API raw de Lusha (requiere plan Scale). Lusha solo
  vía MCP.
- Reveals de Lusha: solo emails (1 crédito). Nunca phones (10).
- Los mensajes generados siguen prompts/message-system.md. Sin em
  dashes, sin clichés de agencia, declarativo.
- Tokens y keys solo en .env.local. Verificar .gitignore antes de
  cada commit.

## Stack
Next.js 15 + Supabase + Brand3 Scanner API + Claude API.
Pipeline nocturno en pipeline/nightly.ts + Claude Code para Lusha.

## Comandos
npm run dev · npm run pipeline:dry (sin gastar créditos) ·
npm run pipeline:run
