# B3S Leads

Sistema de generación de leads cualificados para FLOC*. Detecta startups con
señal de momento (ronda reciente o lanzamiento), cualifica su marca con B3S
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

## Agent API v1

La API server-to-server vive bajo `/api/v1` y está pensada para agentes LLM.
No reutiliza la cookie del dashboard: exige una clave Bearer con scopes. El
contrato machine-readable está en `GET /api/v1/openapi.json` y el documento de
descubrimiento en `GET /api/v1`.

Primero aplica todas las migraciones de `supabase/migrations/`. Para crear una
clave persistida (el valor solo se muestra una vez):

```bash
npm run agent:key:create -- \
  --name "agente-comercial" \
  --scopes leads:read,leads:write,notes:write,signals:write,scans:write \
  --expires-days 90
```

Si se filtra o deja de usarse, revócala por el ID que devuelve el comando:

```bash
npm run agent:key:revoke -- --id <key-uuid>
```

Para desarrollo también se puede definir una única `B3S_AGENT_API_KEY` de al
menos 24 caracteres en `.env.local`. Las claves son secretos server-only:
nunca deben llevar el prefijo `NEXT_PUBLIC_` ni enviarse al navegador.

Ejemplos:

```bash
# Consultar leads
curl -sS \
  -H "Authorization: Bearer $B3S_AGENT_API_KEY" \
  "http://localhost:3000/api/v1/leads?state=activo&stage=detected&limit=10"

# Añadir una nota idempotente
curl -sS -X POST \
  -H "Authorization: Bearer $B3S_AGENT_API_KEY" \
  -H "Idempotency-Key: note-lead-123-20260728" \
  -H "Content-Type: application/json" \
  -d '{"body":"Revisar el ángulo de expansión internacional","kind":"insight"}' \
  "http://localhost:3000/api/v1/leads/<lead-id>/notes"
```

Scopes disponibles: `leads:read`, `leads:write`, `notes:write`,
`signals:write` y `scans:write`. Las mutaciones idempotentes rechazan con `409` la reutilización
de una clave con parámetros distintos. Los límites por credencial son 120
lecturas/min, 30 cambios de lead/min, 60 notas/min, 30 señales/min y 10 scans/hora; un exceso
devuelve `429` con `Retry-After`. En modo demo hay lectura, pero todas las
mutaciones devuelven `demo_mode_read_only`.

La API no ofrece envío automático: cualquier mensaje saliente requiere
revisión humana. También prohíbe scraping o automatización del navegador
contra LinkedIn.

### Supabase local

La primera instalación en macOS usa Colima como runtime Docker. Con Docker
activo, el flujo habitual es:

```bash
npm run supabase:start   # Postgres, Auth, API, Studio y migraciones
npm run supabase:env     # genera .env.local (chmod 600) sin mostrar secretos
npm run dev:local        # http://localhost:3001, sin login sólo en desarrollo
```

Supabase Studio queda en `http://localhost:54323` y Mailpit en
`http://localhost:54324`. Para reconstruir la base desde las migraciones usa
`npm run supabase:reset`; para detenerla, `npm run supabase:stop`.

## Pantallas

| Ruta | Qué es |
|---|---|
| `/briefing` | El briefing de las 9:00: tarjetas del día por `priority_score`, con desglose de por qué está ahí cada lead. |
| `/founders` | **El canal.** Cola de founders con LinkedIn, listos para escribir a mano. Import por pegado. |
| `/companies/[domain]` | Ficha estilo Explee: descripción, determinants, competidores, keywords, fit de ICP, señal, B3S Scanner y founder. |
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

1. **Supabase**: crear proyecto, aplicar en orden todas las migraciones de
   `supabase/migrations/`, copiar URL + anon key + service role key a
   `.env.local`.
2. **B3S Scanner API**: configurar `B3S_SCANNER_API_URL` y el Bearer
   server-only `B3S_SCANNER_API_TOKEN`. Nunca usar un prefijo `NEXT_PUBLIC_`.
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
