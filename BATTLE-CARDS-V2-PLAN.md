# Plan — Battle Cards, segunda iteración

Respuesta a la petición del 2026-09-09. **No he implementado nada: espero
aprobación.** Un commit por bloque.

## Lo que he leído

| Qué | Dónde | Estado |
| --- | --- | --- |
| Dimensiones por marca | `lib/benchmark.ts` → `perfilDeMarca()` | ratios 0–1 + `sinRastro` |
| Medias por grupo | `lib/benchmark.ts` → `compara()` | **ya existe**, con `n` |
| Evidencia del scan | `scans.result_raw.components[].tiles[]` | una cita literal por baldosa |
| Score de un componente | del Scanner | **= nº de baldosas encendidas** |
| Recálculo | `lib/consolidated.ts` → `consolidatedScore()` | delta de puntos, exacto |
| Exportación | `lib/export-estudio.ts` + `app/api/estudio/export/*` | CSV, JSON y SVG |
| API del Scanner | `https://b3s.fly.dev/api/v1/openapi.json` | consultada hoy, en pie |

---

## Tres hallazgos que cambian el alcance

### 1. El Scanner NO acepta región (bloque 4)

Consulté su OpenAPI hoy. Crear un scan admite exactamente cuatro campos:

```
url · brand_name · language · allow_degraded_fallback
```

No hay región, ni país, ni proxy, ni cabeceras. **La mitad del bloque 4 no se
puede construir desde aquí**: hace falta que Jesús añada el parámetro y la
salida de red correspondiente.

La otra mitad sí, y entera: la "URL de entrada" es el propio campo `url`, que
ya aceptamos. Lo que falta es guardarla con la marca y reusarla al reescanear.
Con eso, `primerica.com` con `/public/` funciona hoy.

Lo que sí puedo hacer con los bloqueos: **detectarlos y decirlos**. El scan
retenido ya trae el motivo en `acquisition_gate.warnings[].obstruction` (ahí
salen `cookie_banner`, `paywall`, `login`, `captcha`). Añadir 403 y Cloudflare
a ese diccionario es trabajo nuestro. Lo que no podré ofrecer es "prueba desde
EU", porque no hay desde dónde.

**Propuesta:** hacer la URL de entrada y el aviso de bloqueo ahora, dejar la
región fuera y redactarte el mensaje para Jesús.

### 2. El bloque 3 es viable, y lo he verificado con tu caso de prueba

Temía que el score no fuera recalculable sin el Scanner. Sí lo es, y de forma
exacta:

- El score de un componente **es el número de baldosas encendidas**.
  Comprobado en 695 de 699 componentes del corpus.
- En el scan de `familynetwork.pro`, **todas las baldosas encendidas tienen su
  propia cita literal**. Las diez dimensiones: encendidas == con evidencia.
- Misión tiene M1, M2, M3 y M4 encendidas y **las cuatro hablan de FamilyPro**.
  M5 está apagada.

Es decir: excluir esas cuatro citas baja Misión de 4 a 0, que es exactamente lo
que pides. La unidad de exclusión natural es **la baldosa**, no un bloque de
texto suelto: es la baldosa la que puntúa.

El score global se recompone con `consolidatedScore()`, que ya aplica el delta
de puntos con Magnetismo y Coherencia pesando el doble.

**Un apunte.** El Scanner tiene endpoints de revisión de evidencia por baldosa
(`evidence-claim-tile-reviews`). Sería el sitio natural para esto a largo
plazo, pero exigen `review_packet_fingerprint`, `expected_current_event_id` y
`evaluator_version`, y varios de sus hermanos se llaman `-shadow`. Es
experimental. Propongo hacerlo local y preguntarle a Jesús si ese camino está
para usarse.

### 3. "Cero" y "sin rastro" no son lo mismo, y afecta a tus criterios

Este es el que más cambia lo que vas a ver. Medido hoy sobre Multinivel, con
las 19 marcas visibles:

| Dimensión | Cliente | Media | Marcas en 0 | Sin rastro |
| --- | --- | --- | --- | --- |
| Propósito | **0** | 57 | **0** | 0 |
| Visión | **sin rastro** | 53 | 1 | 10 |
| Magnetismo | **sin rastro** | 56 | 0 | 2 |
| Idea de marca | 50 | 43 | 0 | 0 |

Tu criterio dice "Propósito, Visión y Magnetismo del cliente están en 0".
**Solo Propósito lo está de verdad.** En Visión y Magnetismo el Scanner no
encontró nada que medir, que en este proyecto no tratamos como un cero: un
hueco de lectura no es un hueco de marca.

Y hay una segunda consecuencia. Hoy `perfilDeMarca()` mete un 0 en `ratios`
cuando algo no se detectó, así que la media actual de la Matriz los cuenta.
Excluyéndolos, como pide tu bloque 1 ("ignora nulos"), **las medias cambian**:
Misión pasa de 64 a 76, Visión de 25 a 53.

**Propuesta:** la tabla ofrece las dos lecturas con un interruptor, porque son
dos preguntas distintas —"qué dicen las que lo dicen" y "cuántas lo dicen"— y
enseña siempre `n` y cuántas están sin rastro. La alerta del bloque 2 distingue
tres estados: *cero medido*, *sin rastro* y *por debajo de la media*.

Tu número de referencia, Idea de marca, sale **43 y no 44** con las 19 marcas
visibles. La diferencia es a quién metes: con las descartadas dentro cambia. Es
justo lo que controlan los filtros del bloque 1.

---

## Bloque a bloque

### 1 · Lectura de categoría por dimensión

Pestaña nueva **Dimensiones**, entre Mapas y Comparación. La Comparación ya
tiene la Matriz y meter esto dentro la haría ilegible.

- **Crear** `lib/dimensiones.ts`: `mediasPorGrupo()` sobre `compara()`, con
  filtro por capa y prioridad y las dos políticas de nulos.
- **Crear** `marcas/[domain]/dimensiones.tsx`: tabla, filtros y radar.
- **Crear** `marcas/[domain]/radar.tsx`: decágono en SVG a mano, una línea por
  grupo más el cliente, con interruptor por línea. Sin librería, como el resto.
- **Modificar** `marcas/[domain]/page.tsx`: la pestaña.

### 2 · Alertas de posición del cliente

- **En** `lib/dimensiones.ts`: `alertasDelCliente()` con los tres estados,
  ordenadas por distancia a la media y los ceros medidos primero.
- **En** `dimensiones.tsx`: el bloque, bajo la tabla.

Una línea por alerta, sin adjetivos: `Propósito: cliente 0 · media
competitivo 57 · ninguna de 19 marcas en 0`.

### 3 · Exclusión de evidencia

- **Migración** `20260909xxxxxx_evidencias_excluidas.sql`: tabla
  `evidence_exclusions` (company_id, scan_id, component_key, tile_id, motivo,
  excluded_by_email, excluded_at) e índice único por baldosa.
- **Crear** `app/api/scan/evidencia/route.ts`: POST excluye, DELETE restaura.
- **Crear** `lib/depuracion.ts`: aplica las exclusiones a las dimensiones
  (apaga la baldosa, resta un punto) y llama a `consolidatedScore()`.
- **Modificar** `companies/[domain]/analysis-tabs.tsx`: el control por cita, el
  score depurado junto al original y el bloque plegado de excluidas.
- **Modificar** las dos fichas para pasar las exclusiones.

No toco `lib/scan-report.ts` ni el scan guardado: la exclusión es una capa
encima, como la curación.

### 4 · URL de entrada y aviso de bloqueo

- **Modificar** `lib/battle-cards.ts`: `entry_url` en `MarcaEstudio`.
- **Modificar** `grupo-estudio.tsx`: campo opcional al dar de alta.
- **Modificar** `app/api/estudio/marca/route.ts` y `scan-button.tsx`: usarla al
  escanear y al reescanear.
- **Modificar** `lib/scan-report.ts`: 403, Cloudflare y redirección al
  diccionario de obstrucciones, con la sugerencia en el texto.
- **Fuera:** la región. Te dejo el mensaje para Jesús.

### 5 · Enlaces y copiar dominios

Lo más barato de todo. El Markdown ya existe en `{ui_url}.md`
(`lib/brand3.ts:459` lo usa para importar).

- **Modificar** `grupo-estudio.tsx`: enlaces «Informe» y «Markdown», el campo
  de ficha externa editable en la fila, y el botón de copiar dominios.

### 6 · Alerta de código de categoría

Ya existe media: `clienteTambien`, `propio` y `UMBRAL_ALERTA` están en
`lib/vocabulario.ts` y el aviso se pinta. Falta lo visual y el CSV.

- **Modificar** `lib/vocabulario.ts`: los términos con alerta, primero.
- **Modificar** `vocabulario.tsx`: resalte y contador «cliente + N».
- **Modificar** `lib/export-estudio.ts`: columna `client_uses`.

---

## Dudas

1. **La región del bloque 4.** ¿Lo dejo fuera y te paso el mensaje para Jesús,
   o prefieres que lo pare todo hasta que exista?
2. **Los nulos del bloque 1.** ¿Interruptor con las dos lecturas, como
   propongo, o fijo una sola? Si fijo una, ¿cuál manda en las alertas?
3. **La pestaña.** ¿Dimensiones aparte, como propongo, o dentro de Comparación
   aunque quede larga?
4. **La unidad de exclusión.** La baldosa es lo que puntúa, así que excluir es
   apagarla. Las `evidence_refs` no puntúan: se pueden ocultar de la cita, pero
   no mueven el score. ¿Las incluyo en el control o las dejo fuera?
