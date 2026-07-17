# B3S Leads

Sistema de generación de leads cualificados para FLOC*. Detecta startups con
señal de momento (ronda reciente o lanzamiento), cualifica su marca con Brand3
Scanner, estructura la ficha de la compañía y del founder, y genera un borrador
de mensaje. **El envío es siempre humano, por LinkedIn.**

## Arranque rápido

```bash
npm install
cp .env.example .env.local   # rellenar credenciales
npm run dev                  # http://localhost:3000
```

Sin credenciales de Supabase la app arranca en **modo demo** con datos de
ejemplo, útil para revisar la UI.

## Pantallas

| Ruta | Qué es |
|---|---|
| `/briefing` | El briefing de las 9:00: tarjetas del día por `priority_score`, con desglose de por qué está ahí cada lead. |
| `/founders` | **El canal.** Cola de founders con LinkedIn, listos para escribir a mano. Import por pegado. |
| `/companies/[domain]` | Ficha estilo Explee: descripción, determinants, competidores, keywords, fit de ICP, señal, Brand3 Scanner y founder. |
| `/pipeline` | Kanban de stages, drag & drop. |
| `/settings` | ICP, oferta, presupuestos y feeds, en solo lectura. |

## Modelo mental

- **El canal es LinkedIn.** `contacts.linkedin_handle` es la identidad canónica
  del founder (sobrevive a cambios de empresa) y `linkedin_url` es por donde
  Sergio escribe, a mano.
- **La ficha de compañía es el contexto.** Qué venden, qué les hace distintos,
  contra quién compiten, y qué dice el Scanner de su marca.
- **El Scanner es el diferencial.** Sus hallazgos son lo que hace que el mensaje
  sea irrepetible. Desde cualquier ficha se puede lanzar un scan.

## Setup de producción

1. **Supabase**: crear proyecto, ejecutar en orden
   `supabase/migrations/001_init.sql` y `002_company_fiche_linkedin.sql`,
   copiar URL + anon key + service role key a `.env.local`.
2. **Brand3 Scanner**: pedir el Bearer token a Jesús → `BRAND3_TOKEN`.
3. **Claude API**: key de console.anthropic.com → `ANTHROPIC_API_KEY`.
4. **Lusha**: configurar el MCP de Lusha en Claude Code
   (`mcp.lusha.com/mcp/claude`). El pipeline lo usa vía
   `pipeline/nightly-prompt.md`; no hay API raw.
5. **Deploy app**: Vercel (importar repo, setear env vars). El pipeline corre
   en local o en una máquina Fly.io vía cron.

## Pipeline nocturno

```bash
npm run pipeline:dry   # RSS + extracción + QA, sin escrituras ni créditos
npm run pipeline:run   # completo: RSS → Scanner → scoring → borradores
```

El paso Lusha (señales + enriquecimiento de contactos) corre aparte con
Claude Code headless:

```bash
# crontab -e
0 6 * * 1-5 cd ~/b3s-leads && npm run pipeline:run >> logs/pipeline.log 2>&1
30 6 * * 1-5 cd ~/b3s-leads && claude -p "$(cat pipeline/nightly-prompt.md)" \
  --allowedTools "mcp__lusha__*,Bash,Read,Write" >> logs/pipeline.log 2>&1
```

## Import de datasets externos

```bash
npm run import:explee:dry                        # resumen y filtro de ruido
npm run import:explee -- --geo ES --size 1-10    # importa el subconjunto
npm run import:explee -- --companies data/x.tsv --people data/y.tsv
```

Espera TSV en `data/` (gitignored). Filtra automáticamente el ruido de
ecosistema (fondos, aceleradoras, medios, agencias) según el ICP negativo, y
se queda solo con founders y CEOs. Un contacto sin LinkedIn entra marcado
como no contactable.

## Config editable

- `config/icp.json` — criterios ICP (positivos/negativos). Alimenta la
  extracción de rondas del pipeline y el QA de muestra.
- `config/floc-offer.json` — oferta real de FLOC*. Contexto para el redactor.

## Reglas duras

- **Nada de automatización contra LinkedIn.** Ni scraping, ni Playwright, ni
  cookies de sesión, ni para leer. Los founders entran a mano (pegar URL) o vía
  proveedores de datos. La app genera; Sergio copia y envía (máx 5-8/día).
- Lusha solo vía MCP. Reveals solo de emails (1 crédito), nunca phones (10).
- Presupuesto Lusha: ≤100 créditos/mes con gate automático en cada run.
- Tokens solo en `.env.local`. Los datasets de `data/` no se commitean.

Spec: v0.1 · julio 2026. Ver `CLAUDE.md` para el contexto de Claude Code.
