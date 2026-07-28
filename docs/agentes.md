# Conectar un agente a B3S Leads

Guía de entrega para quien monta un agente (Hermes, Guanchito/OpenClaw, o
cualquier LLM con herramientas) sobre la API de B3S Leads. La referencia
técnica de cada endpoint está en [api-v1.md](api-v1.md); esto es el "qué le
digo al agente".

## 1. Lo que se le entrega a cada agente

| Dato | Valor |
|---|---|
| Base URL | `https://b3slead.netlify.app/api/v1` |
| Clave | **solo la suya** (ver abajo) |
| Documentación | `docs/api-v1.md` de este repo |
| Autodescubrimiento | `GET /api/v1` (sin auth) devuelve el índice de endpoints |

Cada agente recibe **únicamente su propia clave**, nunca la lista entera. Todo
lo que escribe queda firmado con su nombre: las notas aparecen como
`[guanchito] …` en la bitácora y las señales llevan `source: api:guanchito`.
Si un día hay que revocar a uno, se quita su entrada de `B3SLEADS_API_KEYS` y
los demás siguen funcionando.

## 2. Bloque de instrucciones para el agente

Pegar tal cual en el system prompt del agente, sustituyendo `<SU_CLAVE>`:

---

Tienes acceso a **B3S Leads**, el radar de lead-gen de FLOC\*. Detecta startups
con momento de marca, las cualifica con el Brand3 Scanner y prepara las
conversaciones con sus founders.

**API:** `https://b3slead.netlify.app/api/v1`
**Autenticación:** cabecera `Authorization: Bearer <SU_CLAVE>` en toda petición.
Empieza por `GET /api/v1` para ver los endpoints disponibles.

**Cómo trabajar:**

1. `GET /leads?state=activo` — la cola de hoy, ordenada por radar. Cada lead
   trae el número (`radar.score` = `fit × timing`) **y la señal que lo
   sostiene**, con su evidencia literal y cuándo ocurrió.
2. `GET /companies/{domain}` — la ficha completa de una marca: los dos scores,
   los componentes del análisis con su lectura y sus citas, señales y bitácora.
3. `GET /companies/{domain}/dossier` — el dossier en texto plano, para razonar
   sobre el lead.
4. `GET /companies/{domain}/brief` — el prompt maestro del brief de llamada.
   Devuelve instrucciones completas: **ejecútalas** para producir el brief.
5. Cuando descubras algo → `POST /signals`. Cuando concluyas algo →
   `POST /notes`. Cuando el humano avance el lead → `PATCH /leads/{id}`.

**Reglas que no puedes saltarte:**

- **No escribes a founders.** El contacto es siempre humano y por LinkedIn. La
  API no tiene endpoints de mensajería, y no debes proponer automatizarlo.
- **Ninguna señal sin evidencia.** `POST /signals` exige `evidence` (cita o
  descripción literal) y `occurredAt` (la fecha en que ocurrió el evento, no la
  de hoy). Sin eso devuelve 400, y con razón: un número sin evidencia no vale.
- **Dos scores, nunca mezclados.** `score_automatico` es lo que midió la
  máquina y es lo que ordena. `score_consolidado` lleva curación humana y sirve
  para hablar del lead, pero no ordena nada. Al comparar antes/después, compara
  siempre automático con automático.
- **Un lead en `reserva` no es un lead malo**: es correcto pero sin señal viva.
  No lo descartes por eso.
- **No inventes datos.** Si algo no está en la respuesta, dilo. Los huecos que
  la ficha marca con su frecuencia de detección (`detectada en 2 de 3`) son
  dudosos: no los presentes como carencias confirmadas.

**Tipos de señal** (el peso lo da el tipo, no tú):
nivel A (10) `rebranding_declarado`, `oferta_empleo_marca`, `busqueda_agencia` ·
nivel B (6) `web_nueva`, `cambio_nombre`, `pivot_lanzamiento`, `cambio_ceo_cmo`,
`expansion_mercado`, `levantando_ronda` ·
nivel C (3) `ronda`, `crecimiento_plantilla`.

---

## 3. Ejemplos ejecutables

```bash
export B3S_KEY="<SU_CLAVE>"
export B3S_API="https://b3slead.netlify.app/api/v1"

# La cola de hoy
curl -s "$B3S_API/leads?state=activo" -H "Authorization: Bearer $B3S_KEY"

# La ficha de una marca
curl -s "$B3S_API/companies/nothiring.me" -H "Authorization: Bearer $B3S_KEY"

# El brief de llamada, listo para ejecutar
curl -s "$B3S_API/companies/nothiring.me/brief" -H "Authorization: Bearer $B3S_KEY"

# Registrar una señal encontrada (con evidencia y fecha real)
curl -s -X POST "$B3S_API/signals" \
  -H "Authorization: Bearer $B3S_KEY" -H "Content-Type: application/json" \
  -d '{"domain":"nothiring.me","type":"oferta_empleo_marca",
       "occurredAt":"2026-07-25",
       "evidence":"Vacante de Head of Brand publicada en su LinkedIn",
       "sourceUrl":"https://www.linkedin.com/jobs/view/…"}'

# Anotar una conclusión
curl -s -X POST "$B3S_API/notes" \
  -H "Authorization: Bearer $B3S_KEY" -H "Content-Type: application/json" \
  -d '{"domain":"nothiring.me","body":"Publican sobre rebranding desde marzo","kind":"insight"}'
```

## 4. Definición de herramientas (function calling)

Para un agente con herramientas tipadas, estas cuatro cubren el 90% del uso:

```json
[
  {"name": "b3s_leads",
   "description": "Cola de leads de B3S Leads con su radar y la señal que lo sostiene.",
   "parameters": {"type":"object","properties":{
     "state":{"type":"string","enum":["activo","reserva","no_escaneable"]},
     "stage":{"type":"string"},"limit":{"type":"integer"}}}},

  {"name": "b3s_company",
   "description": "Ficha completa de una marca: scores, componentes, señales y bitácora.",
   "parameters": {"type":"object","required":["domain"],
     "properties":{"domain":{"type":"string"}}}},

  {"name": "b3s_brief",
   "description": "Prompt del brief de llamada de una marca. Ejecuta sus instrucciones.",
   "parameters": {"type":"object","required":["domain"],
     "properties":{"domain":{"type":"string"}}}},

  {"name": "b3s_add_signal",
   "description": "Registra una señal de timing. Exige evidencia literal y la fecha en que ocurrió.",
   "parameters": {"type":"object","required":["domain","type","occurredAt","evidence"],
     "properties":{"domain":{"type":"string"},"type":{"type":"string"},
       "occurredAt":{"type":"string","description":"YYYY-MM-DD del evento, no de hoy"},
       "evidence":{"type":"string"},"sourceUrl":{"type":"string"}}}}
]
```

## 5. Comprobar que la clave funciona

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$B3S_API/leads" -H "Authorization: Bearer $B3S_KEY"
```

`200` → listo. `401` → la clave no es válida o no está en el servidor: revisa
`B3SLEADS_API_KEYS` en Netlify y **lanza un deploy nuevo** (las variables solo
entran en un build nuevo). `GET /api/v1` dice `"configured": false` cuando el
servidor no tiene ninguna clave cargada.
