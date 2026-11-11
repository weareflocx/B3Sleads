# Propuesta: seguimientos y respuestas en B3S Leads

Para: Jesús · De: Sergio · Fecha: 2026-11-11
Rama: `feat/seguimientos-y-respuestas` (sale de `main` en `5d6aeaf`)

## Cambios tras tu revisión (2026-11-11)

| Lo que pediste | Qué se ha hecho |
|---|---|
| 1. Commit y PR en borrador ya | Hecho: este documento va en el PR |
| 2. Guardar el borrador original | `draft` = lo que propuso la app, `edited_final` = lo enviado (`filaDeEnvio`). Si el texto viene de «Copiar prompt» o escrito a mano, no hay original: `draft` = lo enviado y la bitácora dice «Texto escrito fuera de la app». Esos envíos no sirven para medir cuánto se reescribe |
| 3. Probar las escrituras en BD real | **Pendiente.** Necesita un lead de prueba en producción. Ver «Prueba de escrituras» abajo |
| 4. Conteo de toques | Una contestación no cuenta como toque (`kind = 'reply'`, `toquesDe`). Si el founder ha contestado alguna vez (`messages.replied`), el plan es siempre reactivar, nunca aparcar, aunque la etapa siga en Contactado. No necesita la migración: `replied` ya existe |
| Punto 1: columna `kind` | `supabase/migrations/20261111100000_messages_kind.sql`, para que la apliques tú. Aditiva, nullable, con check (`first`, `followup`, `reply`). Sin backfill: hasta ahora solo se creaban primeros mensajes, así que null = `first`. Si falta, `registraEnvio` guarda sin ella |
| Punto 2: `paused_at` | Quitado «vuelve al radar» de la pantalla y de la documentación |
| Punto 3: `discard_reason` | Sin cambios |
| Punto 4: ¿el modo `prompt` escribe? | **Escribía**, y ya no. Antes guardaba la respuesta en la bitácora antes de mirar el modo. Ahora el modo `prompt` solo lee y devuelve `guardada: false`. Guardar queda en «Leer respuesta», que guarda incluso sin clave de Claude. Comprobado en demo |
| Punto 5: scan dudoso | Puerta provisional `motivoScanDudoso`: sin scan, scan sin terminar, nota retenida, sin informe por componentes, o la mitad o más de los componentes sin detectar. Con scan dudoso no se pasan hallazgos al modelo y los prompts piden apoyarse en la señal. Se sustituye por la señal del Scanner cuando la tengas |

**Ojo con la puerta del scan:** un lead que solo tiene el resumen del scan
(`tldr`), sin informe por componentes, cuenta como dudoso. Es la opción
conservadora, pero si en producción hay muchos así, casi todos los
seguimientos irán por la señal. Valora si te parece demasiado estricta.

### Prueba de escrituras

La propuesta para el punto 3, a falta de tu visto bueno:

1. Un lead de prueba en producción: empresa `prueba-seguimientos.test`,
   contacto ficticio, etapa Contactado, nombre que deje claro que es una
   prueba.
2. Desde la app (local contra producción): marcar un seguimiento como
   enviado, pegar una respuesta con «Leer respuesta» y marcar la
   contestación como enviada.
3. Comprobar en Supabase: dos filas en `messages` con `draft`,
   `edited_final` y `kind`, `replied = true` en las anteriores, las notas
   de la bitácora, `contacts.notes` y `leads.updated_at`.
4. Repetir antes y después de aplicar la migración de `kind`, para probar
   también la vía sin la columna.
5. Dejar el lead en Descartado con motivo «Otro», o borrarlo tú. Yo no
   borro datos de producción.

**Tests:** 139 pasan (5 nuevos). `tsc` limpio en el código nuevo.

## En una línea

La app prepara hoy el primer mensaje y ahí se acaba. Esta propuesta cubre
lo que viene después: redactar los seguimientos y leer lo que contesta el
founder. Está implementado en una rama, con una migración aditiva opcional y
sin tocar LinkedIn. Falta tu valoración y una prueba con leads reales antes de
integrarlo.

**Lo que te pido:** que revises el enfoque y los puntos abiertos del final,
y me digas si lo integramos tal cual, con cambios, o no.

## De dónde sale

Un post de Pablo Rodríguez describe la captación como ocho pasos que Claude
puede hacer de principio a fin: encontrar al ICP, detectar señales,
investigar, elegir el ángulo, escribir el mensaje, hacer seguimientos,
responder y agendar.

Al cruzarlo con B3S Leads, los pasos 1 a 5 ya están hechos. Los pasos 6, 7
y 8 no existen. Nuestra versión cambia una cosa respecto al post: **la app
y Claude preparan el texto, y el envío lo hace una persona en LinkedIn**
(CLAUDE.md, spec §9). Nada de esto lee ni escribe en LinkedIn.

| Paso | Estado | Dónde vive |
|---|---|---|
| 1. Encontrar al ICP | Hecho | `pipeline/nightly.ts`, Explee, `config/icp.json` |
| 2. Señales de compra | Hecho | `lib/radar.ts` |
| 3. Investigar | Hecho | Ficha de compañía y founder |
| 4. Ángulo | Hecho | Hallazgos del Scanner, `lib/pitch.ts` |
| 5. Primer mensaje | Hecho | `prompts/message-system.md`, `lib/claude.ts` |
| 6. Seguimientos | **Esta propuesta** | Briefing |
| 7. Responder y cualificar | **Esta propuesta** | Ficha de compañía |
| 8. Agendar | A medias en esta propuesta | `config/floc-offer.json` |

## Por qué hacerlo

1. **La app se queda corta justo donde se decide la conversación.** Todo el
   trabajo de señal, scan y ficha desemboca en un primer mensaje. Si no hay
   respuesta, lo que pase después depende de la memoria de quien envía.
2. **El aviso ya existe, la ayuda no.** «Seguimientos que tocan» lista los
   leads con 5 días sin respuesta, pero deja a Sergio ante una página en
   blanco. Es el punto donde los seguimientos se abandonan.
3. **No hay regla de cuándo parar.** Sin ella se insiste de más o se deja
   de insistir demasiado pronto. La propuesta fija tres mensajes y aparcar.
4. **Las respuestas no entran en el sistema.** Lo que contesta un founder
   vive solo en LinkedIn. El dossier, el argumentario y el brief de llamada
   beben de la bitácora y de `contacts.notes`, y hoy no saben qué dijo.
5. **El momento encaja.** El informe de rondas de octubre sale en LinkedIn
   con DMs previos a 24 startups. Eso va a generar respuestas y
   seguimientos en las próximas semanas.
6. **Cierra el ciclo como producto.** Si B3S Platform se enseña a agencias,
   un producto que termina en el primer mensaje se queda a medias.
7. **Cuesta poco integrarlo.** Una migración aditiva que el código no
   necesita para funcionar, sin dependencias nuevas, con los mismos
   patrones que el primer mensaje.

## Qué hace

### Seguimientos (paso 6), en el briefing

Cada fila de «Seguimientos que tocan» tiene un botón «Redactar». El tipo
de mensaje lo decide el código, no el modelo (`planSeguimiento`):

| Situación | Qué propone | Tope |
|---|---|---|
| Un mensaje enviado, 5 días sin respuesta | Segundo toque: un hallazgo nuevo del scan, distinto del primero | 300 |
| Dos mensajes enviados | Último toque: una idea útil y cierre sin pedir nada | 300 |
| Tres mensajes enviados | No redacta. Propone aparcar («Sin respuesta tras 3 mensajes») | n/a |
| Conversación, call o propuesta parada 7 días | Reactivar, con la bitácora como contexto | 400 |

Sergio edita, pulsa «Copiar y abrir LinkedIn», envía a mano y marca
«Enviado». Al marcarlo se guarda el texto como mensaje enviado, se anota
en la bitácora y la cuenta de 5 días empieza de nuevo.

### Respuesta del founder (paso 7), en la ficha

Panel nuevo en la ficha, visible desde «Invitado» hasta «En pausa». Sergio
pega lo que le han contestado y la app:

1. Guarda la respuesta literal en la bitácora (antes de llamar al modelo).
2. La clasifica: interesado, pregunta u objeción, remite a otra persona,
   ahora no, no le interesa, cortesía.
3. Resume qué revela sobre necesidad, momento y decisión, y lo anota.
4. Propone la etapa. La regla está en código (`etapaPara`) y **solo se
   aplica si Sergio pulsa el botón**.
5. Redacta una contestación (máx. 500) para revisar y enviar a mano.

### Agendar (paso 8), a medias

`config/floc-offer.json` tiene un bloque nuevo `call` (descripción,
20 minutos, `booking_url`). Con enlace, el borrador lo usa. Sin enlace,
deja `[hueco 1]` y `[hueco 2]` para rellenar a mano. No hay integración
con calendario.

### Sin clave de API

Las dos herramientas tienen «Copiar prompt ⧉»: reglas y contexto en un
texto para pegar en el Claude de Sergio. Es el mismo patrón que el brief
de llamada. Sin `ANTHROPIC_API_KEY` la ruta devuelve 503 con un aviso que
remite a ese botón.

### Reglas de los prompts nuevos

- Nunca «¿pudiste ver mi mensaje?» ni variantes.
- Nunca afirmar que algo «no existe» en su web. El Scanner puede fallar
  (caso Flecsa): los huecos se formulan como pregunta.
- Sin puntuaciones, sin pitch de servicios, sin em dashes.
- La respuesta del founder se pasa al modelo marcada como dato, no como
  instrucción.

## Qué cambia en el código

Unas 1.200 líneas nuevas, contando tests, prompts y documentación.

**Nuevos**

| Fichero | Qué es |
|---|---|
| `prompts/followup-system.md` | Reglas del redactor de seguimientos |
| `prompts/reply-system.md` | Reglas para leer una respuesta. Devuelve JSON |
| `lib/seguimiento.ts` | Lógica pura: plan, conteo de envíos, contextos, etapa, parseo |
| `lib/seguimiento-lead.ts` | Reúne ficha, mensajes y bitácora de un lead (servidor) |
| `app/api/messages/seguimiento/route.ts` | `POST {leadId, modo?: borrador, prompt o enviado, texto?, como?}` |
| `app/api/messages/respuesta/route.ts` | `POST {leadId, respuesta, modo?: leer o prompt}` |
| `app/(dashboard)/briefing/seguimientos.tsx` | Filas de seguimiento con borrador |
| `app/(dashboard)/companies/[domain]/respuesta-founder.tsx` | Panel de respuesta |
| `tests/seguimiento.test.ts` | 13 tests de la lógica pura |
| `docs/captacion-8-pasos.md` | Mapa de los 8 pasos y fases |

**Modificados** (218 líneas añadidas, 34 quitadas)

| Fichero | Cambio |
|---|---|
| `lib/claude.ts` | `generateFollowUp`, `readReply`, `promptCopiable`, `claudeConfigurado` |
| `lib/data.ts` | `getLeadMessages`, `registraEnvio`, `registraRespuesta` |
| `app/(dashboard)/briefing/page.tsx` | La lista en línea pasa a ser `<Seguimientos />` |
| `app/(dashboard)/companies/[domain]/page.tsx` | Sección «Respuesta del founder» |
| `config/floc-offer.json` | Bloque `call` |
| `lib/demo-data.ts` | Un lead contactado hace 6 días, para ver la función en demo |

**Lo que no cambia**

- Una sola migración, aditiva y opcional (`messages.kind`). El resto usa
  `messages` y `notes` como están.
- Sin dependencias nuevas. Mismo SDK, mismo `CLAUDE_MODEL`.
- La Agent API v1 no se toca.
- Las dos rutas pasan por `requireUser`, como el resto.
- Nada de LinkedIn: ni lectura ni envío.

**Decisiones que conviene que conozcas**

- **Los envíos se cuentan por `sent_at` distinto, no por fila.** Al pasar a
  «Contactado», `updateLeadStage` marca el mismo `sent_at` en todos los
  borradores sin enviar del lead. Contar filas inflaría los toques.
- **Un seguimiento enviado es una fila más en `messages`** con `sent_at`
  ya puesto. No hay columna que distinga primer mensaje, seguimiento y
  contestación. Se distinguen por orden y por la nota de la bitácora.
- **Aparcar reutiliza `discard_reason`** para guardar el motivo de la
  pausa, vía el `PATCH /api/leads` que ya existe.
- **Guardar una respuesta es idempotente** contra las cinco últimas notas
  del lead, para poder releerla sin duplicarla.
- **La etapa no la decide el modelo.** El modelo clasifica. El código
  traduce clase a etapa y valida el motivo de descarte contra
  `DISCARD_REASONS`.

## Qué está probado y qué no

**Probado**

- `npm test`: 134 pasan, 0 fallan (13 nuevos).
- `tsc --noEmit`: sin errores en el código nuevo. Salen errores viejos de
  `.next/types` por `scans-lote`, de otra rama.
- Flujo en pantalla en modo demo (puerto 3001): redactar, aviso sin clave,
  «Copiar prompt», lectura simulada, cambio de etapa, «Enviado».

**Sin probar**

- **La llamada real a Claude.** La clave local está vacía.
- **Las escrituras en base de datos** (`registraEnvio`,
  `registraRespuesta`). El modo demo no escribe.
- **La calidad de los borradores con leads reales.** Es lo que más importa
  y lo que menos sé.
- `next lint` no está configurado en el repo. No se ha pasado.

## Límites y riesgos

- **Depende del Scanner.** El segundo toque se apoya en un hallazgo nuevo
  del scan. Con una extracción degradada, el borrador puede salir bien
  escrito sobre un dato falso. La regla de preguntar en lugar de afirmar
  lo amortigua, no lo arregla. Ver la incidencia de Flecsa.
- **Pegar la respuesta es un paso extra.** Si Sergio contesta desde el
  móvil en LinkedIn, el panel no se usa. Solo se sostiene si el borrador
  es mejor que el que él escribiría.
- **La clasificación aporta poco con un solo usuario.** Sergio ya sabe si
  alguien está interesado. Gana sentido cuando lo use más gente.
- **No se mide cuánto se edita el borrador.** `registraEnvio` guarda el
  texto final en `draft` y en `edited_final`. Mandar también el borrador
  original desde el cliente es un cambio pequeño y permitiría medirlo.
- **Con poco volumen ahorra poco tiempo.** No he mirado cuántos leads hay
  hoy en seguimiento. Con cuatro o cinco por semana, lo que se gana es
  constancia, no horas.

## Cómo aplicarlo

1. **Prueba de calidad, antes de integrar.** Tres a cinco leads reales en
   seguimiento, con «Copiar prompt» (no necesita clave ni escribe en la
   base de datos). Criterio: la mayoría de los borradores se pueden enviar
   con un retoque mínimo. Si no, se ajusta el prompt antes de seguir.
2. **PR en borrador para tu revisión.** Un commit con todo lo de arriba.
   `lead-magnet-informe-rondas.md` está sin seguimiento en la raíz y no
   forma parte de este cambio.
3. **Tus cambios.** Sobre todo en los puntos abiertos de abajo.
4. **Integrar y desplegar.** Aplicar la migración de `kind` (no bloquea:
   el código funciona sin ella). Usa la misma
   `ANTHROPIC_API_KEY` y el mismo `CLAUDE_MODEL` que el primer mensaje.
5. **Configurar la agenda.** Poner el enlace en `call.booking_url` de
   `config/floc-offer.json`, o dejarlo vacío y usar los dos huecos.
6. **Dos semanas de uso y revisar.** Cuántos seguimientos se han enviado
   desde la app, cuántas respuestas se han pegado y si los borradores se
   envían o se reescriben. Con eso se decide si merece la pena seguir.

## Puntos abiertos para ti

1. **¿Fila en `messages` sin distinguir el tipo, o columna nueva?** Hoy no
   hace falta migración. Una columna `kind` daría informes más limpios,
   pero es una migración en producción.
2. **«Vuelve al radar si aparece una señal nueva».** Depende de
   `paused_at`, que en el código figura como columna opcional. No he
   comprobado si está aplicada en producción.
3. **¿Te vale reutilizar `discard_reason` para el motivo de la pausa?**
4. **¿Cómo quieres hacer la prueba con datos reales?** El dev local
   escribe en el Supabase de producción. «Copiar prompt» de seguimiento
   solo lee, pero pegar una respuesta sí escribe en la bitácora.
5. **Fiabilidad del scan como fuente del segundo toque.** ¿Hay alguna
   señal de «extracción degradada» que podamos usar para no redactar
   sobre un scan dudoso?

## Lo que vendría después (sin empezar)

- **Fase 2: manejarlo desde Claude.** Un conector MCP sobre la Agent API
  v1, que ya responde en producción. Necesita dos endpoints nuevos y una
  clave de agente, que escribe en producción. Mi recomendación es no
  empezarla hasta ver que la fase 1 se usa.
- **Fase 3:** huecos reales con Google Calendar, más fuentes de señales y
  usar los mensajes enviados de verdad como ejemplos de tono.
