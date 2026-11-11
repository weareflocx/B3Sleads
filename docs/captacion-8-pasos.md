# Captación en 8 pasos, a nuestro modo

Referencia: el sistema «Claude como única pantalla de la captación»
(encontrar, señales, investigar, ángulo, mensaje, seguimientos, responder
y agendar). Nuestra versión cambia una cosa: **la app y Claude preparan
todo, y el envío lo hace una persona en LinkedIn** (CLAUDE.md, spec §9).
Nada de lo de aquí lee ni escribe en LinkedIn.

## Dónde está cada paso

| Paso | Estado | Dónde vive |
|---|---|---|
| 1. Encontrar al ICP | Hecho | `pipeline/nightly.ts`, importación de Explee, `config/icp.json` |
| 2. Señales de compra | Hecho | `lib/radar.ts` (tres niveles y caducidad) |
| 3. Investigar empresa y momento | Hecho | Ficha de compañía y founder, `lib/lead-prompts.ts` |
| 4. Ángulo de entrada | Hecho | Hallazgos del Scanner, `lib/pitch.ts`, battle cards |
| 5. Mensaje personalizado | Hecho | `prompts/message-system.md`, `lib/claude.ts` |
| 6. Seguimientos | **Fase 1 (esta rama)** | `prompts/followup-system.md`, `lib/seguimiento.ts`, briefing |
| 7. Responder y cualificar | **Fase 1 (esta rama)** | `prompts/reply-system.md`, ficha («Respuesta del founder») |
| 8. Agendar | Fase 1 a medias | `config/floc-offer.json` → `call` (enlace de agenda o dos huecos a mano) |
| Claude como única pantalla | Fase 2 | Conector MCP sobre la Agent API v1 (`docs/api-v1.md`) |

## Fase 1: seguimientos y respuestas

**Seguimientos (paso 6).** En «Seguimientos que tocan», cada fila tiene
«Redactar». El plan lo decide el código (`planSeguimiento`):

- Mensaje n.º 2, **segundo toque**: un hallazgo nuevo del scan, distinto
  del primero. Máximo 300 caracteres.
- Mensaje n.º 3, **último toque**: una idea útil y cierre sin pedir nada.
- Tras tres mensajes sin respuesta **no se redacta un cuarto**: se propone
  aparcar el lead («Sin respuesta tras 3 mensajes»). Que vuelva al radar
  con una señal nueva queda pendiente de comprobar `paused_at` en
  producción.
- Las contestaciones al founder no cuentan como toque (`messages.kind =
  'reply'`). Si el founder ha contestado alguna vez, el plan es siempre
  reactivar: nunca se aparca a quien ha respondido.
- Si el scan es dudoso (sin scan, nota retenida, sin informe por
  componentes o con la mitad de componentes sin detectar), no se pasan
  hallazgos al modelo y el seguimiento se apoya en la señal del radar.
- En conversación, call o propuesta paradas 7 días: **reactivar**, con la
  bitácora como contexto.

Al marcar «Enviado» se guarda el borrador de la app en `draft`, lo
enviado en `edited_final` y el tipo en `kind`, se anota en la bitácora y
la cuenta de 5 días empieza de nuevo. La migración de `kind` es aditiva y
el código funciona sin ella.

**Respuestas (paso 7).** En la ficha, «Respuesta del founder»: se pega lo
que contestó. La respuesta va a la bitácora tal cual y se lee:

- clase (interesado, pregunta, referido, ahora no, no le interesa, cortesía);
- qué revela sobre necesidad, momento y decisión (queda en la bitácora);
- etapa propuesta, que decide el código (`etapaPara`) y **confirma Sergio**;
- borrador de contestación, que Sergio revisa y envía.

**Agenda (paso 8).** Si `call.booking_url` está vacío, el borrador ofrece
`[hueco 1]` y `[hueco 2]` para rellenar a mano. Con enlace, lo usa.

**Sin clave de API.** Las dos herramientas tienen «Copiar prompt»: el
mismo material para pegarlo en el Claude de Sergio, como el brief de
llamada. «Copiar prompt» no escribe nada en la base de datos.

**Reglas que añaden los prompts nuevos.** Nunca «¿pudiste ver mi
mensaje?». Nunca afirmar que algo «no existe» en su web (el Scanner puede
fallar, ver el caso Flecsa): los huecos van como pregunta. Sin
puntuaciones. Sin pitch.

## Fase 2: Claude como única pantalla

La Agent API v1 ya está viva en producción (`/api/v1/health` responde
`ok`). Falta un conector MCP que la envuelva para poder pedir desde Claude
«¿qué seguimientos tengo hoy?» o «prepárame la contestación de Flecsa».
Necesita dos endpoints nuevos de solo lectura y borrador (seguimiento y
respuesta) y una clave de agente (`npm run agent:key:create`, que escribe
en producción: avisar antes).

## Fase 3 y siguientes

- Agenda con Google Calendar (huecos reales en lugar de `[hueco 1]`).
- Más fuentes de señales en el pipeline nocturno.
- Usar `messages.edited_final` (lo que Sergio envía de verdad) como
  ejemplos para afinar el tono de los borradores.
