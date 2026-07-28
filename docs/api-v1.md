# B3S Leads API v1

API pública de B3S Leads para agentes (Hermes, OpenClaw, o cualquier LLM con
herramientas). Da acceso al radar con su evidencia, a la ficha completa de cada
marca y a los prompts de trabajo (dossier y brief), y permite registrar lo que
el agente descubre: notas, señales y cambios de etapa.

**Lo que la API no hace, a propósito:** enviar mensajes. El envío a founders es
siempre humano y por LinkedIn (spec §9). Aquí no hay mensajería.

Base: `https://b3slead.netlify.app/api/v1` (o `http://localhost:3000/api/v1`).

## Autenticación

Una clave **por agente**, en la variable `B3SLEADS_API_KEYS` del servidor:

```
B3SLEADS_API_KEYS=hermes:sk_xxxxxxxxxxxxxxxx,openclaw:sk_yyyyyyyyyyyyyyyy
```

El nombre firma lo que el agente escribe (las notas salen como `[hermes] …` en
la bitácora; las señales llevan `source: api:hermes`). Para revocar a un
agente, se quita su entrada y el resto sigue funcionando.

Cada petición lleva la clave en la cabecera estándar:

```
Authorization: Bearer sk_xxxxxxxxxxxxxxxx
```

(También se acepta `x-api-key: <key>`.) Sin clave → `401`. `GET /api/v1` es el
único endpoint sin auth: devuelve este índice en JSON para que un agente se
autodescubra.

## Los dos scores

Todo lo que devuelve la API distingue dos números, y nunca los mezcla:

- **`score_automatico`** — el último run del Scanner, sin tocar. Es el que
  ordena (rankings, eje FIT del radar).
- **`score_consolidado`** — con curación humana por componente. Es la lectura
  de FLOC* sobre la marca; alimenta dossier y brief, pero **no ordena nada**.

## Endpoints

### `GET /api/v1/leads`

La cola completa con el radar (`fit × timing`) y la señal que sostiene cada
número. Ordenada: activos por radar descendente, el resto por actividad.

Filtros: `?state=activo|reserva|no_escaneable` · `?stage=detected|contacted|…`
· `?limit=50`

```bash
curl -s https://b3slead.netlify.app/api/v1/leads?state=activo \
  -H "Authorization: Bearer $B3S_KEY"
```

Cada lead: `{ id, stage, updated_at, company{name,domain,sector,bio},
founder{name,linkedin_url,headline}, scan{score_automatico,run_at,report_url},
radar{state,score,fit,timing,signal{type,level,ago,evidence,source_url}},
links.detail }`.

Regla de lectura para agentes: **un lead en `reserva` no es un lead malo**, es
un lead correcto esperando señal. Y ningún número del radar viene sin su
evidencia.

### `GET /api/v1/companies/{domain}`

La ficha completa: empresa, founder, radar, scan con los dos scores y los
componentes del Brand Seed **consolidado** (lectura estratégica, análisis, cita
con fuente, términos, si está curado y su frecuencia de detección), señales y
bitácora.

### `GET /api/v1/companies/{domain}/dossier`

El dossier del lead en texto plano — lo mismo que copia el botón "Pregunta al
dossier" del dashboard. Pensado para pegárselo a un LLM como contexto.

### `GET /api/v1/companies/{domain}/brief`

El prompt maestro del brief de llamada (instrucciones + dossier), sobre el
consolidado. Un agente lo ejecuta tal cual para preparar la llamada; incluye
las URLs del LinkedIn del founder y del informe del Scanner para que quien lo
corra las verifique.

### `POST /api/v1/leads`

Alta de un lead. Mismo camino que el alta del dashboard: dedupe, autocompletado
del nombre desde la URL, búsqueda de scan por dominio.

```bash
curl -s -X POST https://b3slead.netlify.app/api/v1/leads \
  -H "Authorization: Bearer $B3S_KEY" -H "Content-Type: application/json" \
  -d '{"linkedin":"linkedin.com/in/janedoe","domain":"acmelabs.io","note":"CTO pidiendo agencia en un post"}'
```

### `PATCH /api/v1/leads/{leadId}`

Cambiar la etapa: `{ "stage": "contacted" }`. Descartar exige motivo:
`{ "stage": "discarded", "discardReason": "Fuera de ICP" }`.

### `POST /api/v1/notes`

Anotar en la bitácora. La nota queda firmada por el agente en el cuerpo.

```bash
curl -s -X POST https://b3slead.netlify.app/api/v1/notes \
  -H "Authorization: Bearer $B3S_KEY" -H "Content-Type: application/json" \
  -d '{"domain":"acmelabs.io","body":"El founder publicó que buscan rebranding","kind":"insight"}'
```

### `POST /api/v1/signals`

Registrar una señal del radar. **Sin evidencia o sin fecha en que ocurrió, la
API devuelve 400**: una señal sin evidencia no sostiene un número.

```bash
curl -s -X POST https://b3slead.netlify.app/api/v1/signals \
  -H "Authorization: Bearer $B3S_KEY" -H "Content-Type: application/json" \
  -d '{"domain":"acmelabs.io","type":"oferta_empleo_marca","occurredAt":"2026-07-25","evidence":"Vacante de Head of Brand publicada en su LinkedIn","sourceUrl":"https://…"}'
```

Tipos y pesos: nivel A (10) `rebranding_declarado`, `oferta_empleo_marca`,
`busqueda_agencia` · nivel B (6) `web_nueva`, `cambio_nombre`,
`pivot_lanzamiento`, `cambio_ceo_cmo`, `expansion_mercado`, `levantando_ronda`
· nivel C (3) `ronda`, `crecimiento_plantilla`. Mandar un `type` desconocido
devuelve 400 con la lista.

## Flujo típico de un agente

1. `GET /leads?state=activo` → a quién le toca hoy y por qué (la señal).
2. `GET /companies/{domain}` → la ficha; o `/dossier` para razonar sobre ella.
3. Descubre algo (una vacante de marca, una ronda en curso) →
   `POST /signals` con evidencia y fecha.
4. Conclusión o contexto → `POST /notes`.
5. El humano contacta (LinkedIn, a mano) → el agente mueve etapa con `PATCH`.
