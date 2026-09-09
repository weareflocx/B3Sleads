# Revisión de la plataforma — 2026-09-09

Repaso completo: errores, velocidad de carga, logos y avatares, compilación,
UX y lo que toca después. Cuatro commits, todo medido antes y después.

## Lo que se ha arreglado

### Velocidad

| Qué | Antes | Después | Cómo |
| --- | --- | --- | --- |
| Cola de leads (Briefing, Pipeline, Startups, Home…) | 555 ms | 210 ms | Las listas piden el scan **sin informe** y solo el que apunta cada lead. Antes cada pantalla bajaba los 173 scans con sus 8,5 MB de informes para enseñar un número y una frase. |
| Ficha de empresa | 864 ms | 262 ms | `getCompanyFiche` va directa a la empresa y a sus leads; antes cargaba la cola entera y se quedaba con una fila. |
| Home y Founders | 2–3 cargas iguales por visita | 1 | `getBriefingLeads` y `getStartups` memorizadas por petición (React `cache`). |
| Página Founders | **3,2 MB** de HTML | 0,7 MB | Serializaba el informe entero de cada scan en las props de las tarjetas, que solo leen score y estado. |
| Estudio de marca | 7,8 MB de informes por visita | ~3,3 MB (**pendiente de aplicar la vista**) | `result_raw.acquisition_summary` es el 57% de cada informe y la app no lo lee en ningún sitio. La vista `scans_ligeros` lo quita al servir. |

Tiempos medidos en caliente contra la base de producción, desde local.

### Logos y avatares

Medí las fuentes sobre las 115 marcas del catálogo:

- DuckDuckGo (la primera de la cascada) contesta a 96, pero **muchas a 16 o
  32 píxeles** cuando Google o la propia web tienen 128 o 192. Por ese orden
  la mitad de los logos salían borrosos (iliad, movyn, leeters…).
- Google devuelve un globo genérico de 16×16 para 8 dominios, que se pintaba
  como si fuera el logo.
- Cada tarjeta pagaba 2–3 peticiones externas y cada fallo era un 404 en la
  consola: entre 26 y 31 errores por pantalla.

Ahora `/api/logo/[dominio]` pide a la vez la web (apple-touch-icon, icon,
rutas por convención), Google, gstatic y DuckDuckGo, mide cada imagen por su
cabecera (`lib/imagen.ts`) y sirve la mayor, cacheada una semana en el CDN.
Por debajo de 24 píxeles no hay logo: quedan las iniciales. Sin logo responde
204, no 404: consola limpia.

De paso, **el SVG exportado del mapa lleva los logos embebidos** (bloque 6 del
plan del mapa). Antes Figma lo abría sin ellos.

Los avatares de founders no tenían problema: son monogramas deterministas y
solo se enseña la foto pegada a mano si carga.

### Errores y datos

- **Cuatro scans llevaban desde julio "en marcha"**: las tarjetas decían
  "escaneando…" para siempre. Un scan con más de seis horas en marcha se
  enseña como fallido. Los cuatro registros siguen en la tabla; el sync los
  cierra si el informe existe.
- **Una empresa con dominio `vig sec drone`** (Rubén Gil, contactado en
  julio). Entró por el alta de founders, que no validaba. Corregida a
  `vigsecdrone.com` y nombre `VigSec Drone` (formación de pilotos de dron,
  AESA). Había **cinco copias** de la normalización de dominios y ninguna
  comprobaba el resultado: ahora todas las entradas pasan por
  `lib/dominio.ts` y lo que no es un dominio se rechaza con mensaje.
- **Dos tests fallaban desde el commit 7acbc63** (esperaban la ponderación
  antigua del consolidado). Alineados con la real; 27/27 en verde.
- `npx tsc` limpio, `npm run build` limpio. No hay `eslint` configurado
  (`next lint` pide crearlo): ver recomendaciones.

### UX

- Todos los botones responden al pulsarlos (scale 0.97, 160 ms, solo
  transform). No había ninguna señal de pulsación en la app.
- La cabecera del estudio de marca se salía de la pantalla en móvil (los
  enlaces CSV/JSON); ahora bajan de línea.
- Sin errores de JavaScript en ninguna pantalla del dashboard (home,
  briefing, pipeline, founders, startups, leaderboard, settings, ficha,
  estudio y sus seis pestañas).

## Pendiente de ti

1. **Aplicar la vista** `supabase/migrations/20260909120000_scans_ligeros.sql`
   en el SQL editor de Supabase (una sentencia). Hasta entonces el código
   usa la tabla: funciona igual, solo pesa más.
2. Decidir qué hacer con los **cuatro scans colgados** (ids en
   `scans` con status `running` y `created_at` de julio/agosto). Se pueden
   dejar: ya no se enseñan como activos.

## Recomendaciones

Por orden de valor por hora de trabajo.

1. **Suspense en el estudio de marca.** Es la página más pesada (1,5–2 s en
   producción con 44 marcas) y se pinta de golpe. Con `loading.tsx` y las
   pestañas pesadas (Dimensiones, Comparación) en `<Suspense>`, la cabecera
   y el Montaje salen al instante.
2. **ESLint.** No hay configuración y Next 16 retira `next lint`. Diez
   minutos: `npx @next/codemod@canary next-lint-to-eslint-cli .` y el plugin
   de Next. Los `alert()` de `lead-card.tsx` y `founder-row.tsx` deberían
   ser un aviso en la propia tarjeta.
3. **Dependencias.** Next 15.5 → 16 es un salto mayor (Turbopack por
   defecto, `params` ya async: eso ya está hecho). `@anthropic-ai/sdk` va
   67 versiones por detrás; conviene subirlo antes de tocar el redactor.
4. **Logos subidos a mano en el SVG.** Los de Supabase Storage se embeben
   bien; si alguno vive en otro dominio sin CORS, esa marca sale con
   iniciales en el archivo. Si pasa, la solución es servirlos también por
   `/api/logo`.
5. **`getBriefingLeads` en una sola consulta.** PostgREST admite el select
   embebido (`leads(*, company:companies(*), contact:contacts(*), …)`):
   un viaje en vez de dos, 250 ms en vez de 360 en frío. Lo medí y funciona;
   no lo he metido porque cambia la forma de todos los hidratados y era
   mejor hacerlo con calma.

## Siguientes features (de lo que ya está planificado)

- **Battle Cards v2, bloques 2–6** (`BATTLE-CARDS-V2-PLAN.md`): alertas de
  posición del cliente (siguiente), exclusión de evidencia por baldosa, URL
  de entrada y aviso de bloqueo, enlaces al informe y copiar dominios,
  alerta de vocabulario en el CSV.
- **Mapa, bloques 2 y 5** (`MAP-UX-PLAN.md`): panel lateral con barras por
  dimensión y ficha externa; líneas guía para las etiquetas en vez de
  ocultarlas.
- **Para Jesús (Scanner):** parámetro de región en `POST /scans`, madurez de
  `evidence-claim-tile-reviews`, y las retenciones falsas en sitios grandes
  (Movistar: 19 páginas nuevas frente a 7 perdidas y se retiene igual).

## Lo que NO se ha tocado

El algoritmo de scoring, el consolidado y la curación. Los cambios de datos
son de lectura (qué columnas se piden y desde dónde), no de cálculo.
