# FLOC* Radar

Sistema de generación de leads cualificados para FLOC*. Detecta startups con
señal de momento (ronda de financiación), cualifica su marca con Brand3
Scanner, enriquece el contacto del founder vía Lusha MCP y genera un borrador
de mensaje personalizado. **El envío es siempre humano.**

## Arranque rápido

```bash
npm install
cp .env.example .env.local   # rellenar credenciales
npm run dev                  # http://localhost:3000
```

Sin credenciales de Supabase la app arranca en **modo demo** con datos de
ejemplo, útil para revisar la UI.

## Setup de producción

1. **Supabase**: crear proyecto, ejecutar `supabase/migrations/001_init.sql`
   en el SQL editor, copiar URL + anon key + service role key a `.env.local`.
2. **Brand3 Scanner**: pedir el Bearer token a Jesús → `BRAND3_TOKEN`.
3. **Claude API**: key de console.anthropic.com → `ANTHROPIC_API_KEY`.
4. **Lusha**: configurar el MCP de Lusha en Claude Code
   (`mcp.lusha.com/mcp/claude`). El pipeline lo usa vía
   `pipeline/nightly-prompt.md`; no hay API raw.
5. **Deploy app**: Vercel (importar repo, setear env vars). El pipeline corre
   en local o en una máquina Fly.io vía cron.

## Pipeline nocturno

```bash
npm run pipeline:dry   # RSS + extracción, sin escrituras ni créditos
npm run pipeline:run   # completo: RSS → Scanner → scoring → borradores
```

El paso Lusha (señales + enriquecimiento de contactos) corre aparte con
Claude Code headless:

```bash
# crontab -e
0 6 * * 1-5 cd ~/floc-radar && npm run pipeline:run >> logs/pipeline.log 2>&1
30 6 * * 1-5 cd ~/floc-radar && claude -p "$(cat pipeline/nightly-prompt.md)" \
  --allowedTools "mcp__lusha__*,Bash,Read,Write" >> logs/pipeline.log 2>&1
```

## Reglas duras

- Nada de automatización de navegador contra LinkedIn. La app genera, Sergio
  copia y envía a mano (máx 5-8 mensajes/día).
- Lusha solo vía MCP. Reveals solo de emails (1 crédito), nunca phones (10).
- Presupuesto Lusha: ≤100 créditos/mes con gate automático en cada run.
- Tokens solo en `.env.local`, nunca en el repo.

Spec completa: v0.1 · julio 2026. Ver `CLAUDE.md` para contexto de Claude Code.
