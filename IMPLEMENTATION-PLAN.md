# Plan de implementación — Módulo Battle Cards

Respuesta a `SPEC Battle Cards v1.0` (2026-09-07). Escrito tras explorar el
repositorio y auditar los datos reales de producción. **No he escrito código
del módulo: espero aprobación.**

Cifras de la auditoría (producción, 2026-09-07):

| Dato | Valor |
| --- | --- |
| Scans publicados | 132 |
| Componentes analizados | 1.040 |
| Estudios existentes | 1 (familynetwork.pro) |
| Marcas en el estudio | 40 en 4 grupos |
| Notas "por qué está en el estudio" ya escritas | 25 |

---

## 1. Las cuatro dudas de la sección 11, respondidas

### 1.1 ¿La clasificación se almacena por estudio?

**Sí, por estudio.** La tabla `studies` tiene un índice único
`studies_company` sobre `company_id`: un estudio por cliente. Pero una marca
sí puede estar en varios estudios, porque cada cliente tiene el suyo y el
corpus de marcas (`companies`) es común. Herbalife puede ser competidor
directo para un cliente y arquetipo de categoría para otro.

Conclusión: el modelo de la spec es correcto y no se puede simplificar. La
clasificación cuelga del par (estudio, marca).

### 1.2 ¿La extracción de claims conserva el texto literal?

**Sí. La fase 7 es viable sin tocar el escaneo.** Medido sobre los 1.040
componentes de los 132 scans publicados:

| Campo en `scans.result_raw` | Cobertura | Contenido |
| --- | --- | --- |
| `components[].tiles[].evidencia` | 81% | Texto literal capturado de la web |
| `components[].evidence_refs[].snippet` | 80% | Fragmento con URL de origen |
| `components[].detected_content` | 75% | Lo detectado para ese componente |
| `components[].tiles[].motivo` | 75% | Razonamiento del Scanner (no literal) |

Longitud mediana de `evidencia`: 125 caracteres. Material más que suficiente.

**Matiz importante.** Hace unas semanas descarté una función parecida
("vocabulario saturado") porque el campo `terms` solo cubría el 6% de los
componentes. Ese campo sigue siendo pobre; lo que cambia es que aquí la
fuente es otra y sí está al 80%. Lo que no está probado es que el cruce de
n-gramas sobre ese texto produzca términos con significado en vez de ruido.
Por eso la fase 7 empieza con un script de sondeo, no con interfaz (§5.7).

### 1.3 ¿Hay librería de gráficos en el proyecto?

**No, y no hace falta añadirla.** Las dependencias son Next 15, React 19,
Tailwind 4, Supabase, el SDK de Anthropic, `geist`, `rss-parser` y
`html-to-image`. Todo lo gráfico está hecho a mano en SVG en línea: el anillo
de score, el sparkline del histórico, el campo de puntos de inversores.

Los mapas se harán igual, y eso además resuelve gratis la exportación 8.2:
el SVG que se exporta es el mismo nodo que se pinta, serializado.

**`html-to-image` no se usará.** Está en el proyecto de antes y ya nos falló
con gradientes y máscaras: producía imágenes en negro. Fue el motivo de
mover la tarjeta del Eclipse a generación en servidor.

### 1.4 ¿Los estudios tienen usuarios o son públicos por URL?

**Detrás de login, sin roles.** El middleware deja públicas solo `/`,
`/login`, `/api/health` y `/auth/*`; todo lo demás exige sesión de Supabase.
No hay permisos por usuario: cualquiera con sesión puede editar cualquier
estudio, y `updated_by_email` registra quién tocó por última vez.

Conclusión: la clasificación y los ejes se editan con el mismo modelo que hoy.
No hay que construir permisos. La URL con `?g=` no salta el login.

---

## 2. Un defecto bloqueante que hay que arreglar antes de la fase 2

Al auditar encontré que el estudio guardado no coincidía con la URL de la
spec. Investigando descubrí un fallo en los controles que subí hoy mismo
(commit `3097b6f`), y lo he reproducido:

> Oculté Vodafone y Orange con dos clics seguidos. Solo se guardó Orange.
> El primer cambio se perdió sin aviso.

**Causa.** Todo el estado del estudio vive en la URL. Cada control calcula el
estado nuevo a partir del `grupos` que le llegó del servidor, y ese valor no
se actualiza hasta que `router.replace` completa la navegación blanda y la
página se vuelve a renderizar contra la base de datos. Dos acciones dentro de
esa ventana (entre 200 y 500 ms en esta página, que hace varias consultas)
parten de la misma base y la segunda pisa a la primera. No es intermitente:
es determinista.

**Por qué bloquea la spec.** El criterio de aceptación de §5 es *"puedo
clasificar 20 marcas en menos de 3 minutos sin recargar la página"*. Son unos
9 segundos por marca con tres selectores cada una. Es exactamente el patrón
que rompe hoy. Construir la clasificación encima de esta arquitectura
garantiza que se pierdan cambios en silencio.

**Propuesta: fase 1.5, antes de la 2.** Un estado de cliente único para el
estudio (contexto React) con actualización optimista, y una cola de
persistencia que serializa las escrituras. La URL pasa a ser lo que siempre
debió ser: una forma de compartir y de entrar, no la memoria de trabajo. El
formato `?g=` no cambia, así que los enlaces que ya circulan siguen valiendo.

**Sobre tu estudio.** Hice copia antes de probar y lo restauré idéntico:
40 dominios, 25 notas, 0 ocultas, mismo orden. La copia está en el
scratchpad de la sesión. No he restaurado ni tocado nada más, porque el
estudio guardado tiene marcas que tú añadiste después de mi último commit
(`totalenergies.com`, `lucera.es`) y tres que ya no están (`nuskin.com`,
`terna.it`, `tim.it`). No sé si esas bajas fueron intencionadas o víctimas
del fallo. **Decide tú si hay que reponerlas.**

---

## 3. Tres contradicciones entre la spec y el código

### 3.1 Son diez dimensiones, no seis

La spec habla de seis (Propósito, Misión, Visión, Valores, Atributos,
Magnetismo). El Scanner devuelve **diez**: esas seis más Propuesta de valor,
Personalidad, Idea de marca y Coherencia. Magnetismo y Coherencia pesan el
doble (valen 20, no 10).

**Propuesta:** el CSV de §8.1 exporta las diez. Quitar cuatro columnas de
datos que ya tenemos no ayuda a nadie.

### 3.2 La fórmula del mapa de madurez no cuadra de escala

§6.4 dice *"ambos sobre 5"*. En el payload real los máximos son distintos:
Propósito 10, Visión 5, Magnetismo 20, Atributos 5, Valores 5. Restar medias
en escalas distintas daría un eje sin sentido.

**Propuesta:** usar los ratios 0–1 que `perfilDeMarca()` ya calcula
(`lib/benchmark.ts`), que normalizan por el máximo de cada componente:

```
significado = media(ratio Propósito, ratio Visión, ratio Magnetismo)   → 0..1
funcional   = media(ratio Atributos, ratio Valores)                    → 0..1
X           = 5 + (significado − funcional) × 5                        → 0..10
```

Conserva la intención de la spec y es correcto de escala.

### 3.3 El problema serio: no hay datos para el eje X en la mayoría de marcas

De las 38 marcas del estudio con scan, solo **9** tienen detectadas las cinco
dimensiones que la fórmula necesita.

| Dimensión | Detectada en |
| --- | --- |
| Propósito | 36 de 38 |
| Atributos | 36 de 38 |
| Valores | 31 de 38 |
| Magnetismo | 28 de 38 |
| **Visión** | **11 de 38** |

Si "no detectado" cuenta como cero, la Visión ausente en 27 marcas arrastra
el eje del significado hacia abajo y **casi todo el mapa sale "funcional"**.
Eso no sería una lectura de marca: sería una lectura de lo que el Scanner
alcanzó a leer. Es justo el error que este proyecto evita en todas partes:
no confundir un hueco de adquisición con un hueco de marca.

**Propuesta:**

- Promediar solo sobre las dimensiones detectadas.
- Exigir un mínimo: 2 de 3 en significado y 1 de 2 en funcional.
- Las marcas que no lleguen se pintan huecas y etiquetadas "lectura
  insuficiente", fuera de cualquier lectura de cuadrante.
- Al pasar el ratón, decir sobre cuántas dimensiones se calculó.

Con eso el mapa de madurez arranca con 9 marcas sólidas y unas cuantas
marcadas como incompletas, en vez de con 38 posiciones falsas. Es menos
vistoso y es lo único defendible delante del cliente.

### 3.4 Apunte menor: PE9 y PE10 no tienen nombre aquí

Las baldosas llegan con `id`, `estado`, `motivo` y `evidencia`, pero **sin
etiqueta de qué mide cada una**. Confirmado que existen PE1–PE10 (y PR, MG,
I, P, A, V, VA, C, M), pero B3S Leads no sabe que PE9 es el test del logo
tapado. Para nombrarlas haría falta el diccionario de la rúbrica del Scanner
(pedírselo a Jesús) o escribirlo a mano. No bloquea la fase 7, cuyo requisito
real es el cruce de vocabulario.

---

## 4. Modelo de datos: dónde va cada cosa

`studies` hoy: `id`, `company_id`, `grupos jsonb`, `updated_by_email`,
`updated_at`, `created_at`.

`grupos` es hoy `[{ nombre, dominios[], ocultas?[], notas? }]` y cumple tres
funciones: pertenencia, orden y ocultas. Se refleja en la URL.

**Propuesta: no tocar `grupos`. Añadir tres columnas.**

```sql
alter table studies
  add column marcas           jsonb not null default '{}'::jsonb,
  add column axes             jsonb not null default '[]'::jsonb,
  add column client_positions jsonb not null default '{}'::jsonb;
```

`marcas` va indexado por dominio, no anidado en el grupo:

```json
{
  "herbalife.com": {
    "role": "model_analogy",
    "layer": "register",
    "priority": "core",
    "note": "máx. 140",
    "legacy_note": "el texto original completo, si excedía",
    "axis_scores": { "eje_1": 7 },
    "verification": "pending"
  }
}
```

Tres razones para indexar por dominio y no meterlo dentro del grupo:

1. **La clasificación sobrevive a mover de grupo.** Es el mismo principio que
   ya aplica `fusionaNotas()` a las notas. Reclasificar cada vez que mueves
   una marca sería trabajo perdido.
2. **No engorda la URL.** La pertenencia cabe en `?g=`; siete campos por
   marca × 40 marcas, no.
3. **No rompe lo que funciona.** El formato `?g=`, los enlaces compartidos y
   todo lo del último commit siguen igual.

**Migración de las 25 notas existentes.** Van de `grupos[].notas[dominio]` a
`marcas[dominio].note`, truncadas a 140. Medido: de 25 notas, **3 pasan de
140** (la más larga, 224 caracteres). Esas tres conservan el texto íntegro en
`legacy_note`. La lectura de `grupos[].notas` se mantiene como recambio
durante una versión, para que un despliegue a medias no deje notas invisibles.

Mapeo del resto de entidades de la spec:

| Spec | Real |
| --- | --- |
| `study_id` | `studies.id` |
| `client_domain` | `studies.company_id` → `companies.domain` |
| `brand_domain` | clave de `studies.marcas` |
| `group` | `studies.grupos[].dominios` (ya existe) |
| Brand3 Score | `scans.score`, vía `perfilDeMarca()` consolidado |
| Seis dimensiones | Diez, vía `PerfilMarca.ratios` |
| URL del informe | `scans.ui_url` |

---

## 5. Fases, con archivos concretos

Un commit por fase. El proyecto no tiene tests automatizados; verifico por
medición del DOM en el navegador, como en los últimos cambios.

### Fase 1 — Modelo de datos y migración
- **Crear** `supabase/migrations/20260908xxxxxx_battle_cards.sql`: tres
  columnas y bloque de migración de notas.
- **Modificar** `lib/types.ts` (`Study`), `lib/data.ts` (`getEstudio` y
  nuevos `guardarClasificacion`, `guardarEjes`, `guardarPosiciones`).
- **Crear** `lib/battle-cards.ts`: tipos `Clasificacion`, `Eje`,
  `MarcaEstudio`, las tablas de etiquetas en español de §4 y los helpers de
  orden por prioridad.

### Fase 1.5 — Arreglar la carrera (§2 de este plan)
- **Crear** `app/(dashboard)/marcas/[domain]/estudio-estado.tsx`: contexto con
  estado optimista y cola de escritura.
- **Modificar** `grupo-estudio.tsx`, `nuevo-grupo.tsx`, `guardar-estudio.tsx`.
- Verificación: veinte acciones seguidas sin pausa, ninguna perdida.

### Fase 2 — Clasificación estructurada y filtros
- **Crear** `clasificacion.tsx` (tres `Select` + nota con contador),
  `filtros-estudio.tsx`.
- **Crear** `app/api/estudio/clasificacion/route.ts`.
- **Modificar** `grupo-estudio.tsx`, `marcas/[domain]/page.tsx`.
- **Absorber** `nota-marca.tsx` dentro de `clasificacion.tsx`.
- Reutilizo el `Select` de la casa (`app/(dashboard)/select.tsx`), no el
  nativo.

### Fase 3 — Ejes y puntuación
- **Crear** `ejes.tsx` (configuración), `tabla-ejes.tsx` (rejilla editable,
  obligatoria por §6.2), `app/api/estudio/ejes/route.ts`.

### Fase 4 — Mapa estratégico
- **Crear** `mapa.tsx`: SVG en línea, puntos con radio por score, color por
  capa, rombos para cliente hoy y objetivo unidos por línea discontinua,
  reparto de etiquetas para evitar solapes.
- Pestañas Grupos · Mapa · Vocabulario reutilizando `AnalysisTabs`, que ya se
  importa entre rutas.

### Fase 5 — Mapa de madurez
- **Modificar** `lib/benchmark.ts`: `posicionMadurez()` con la regla de
  cobertura mínima de §3.3.

### Fase 6 — Exportación CSV y SVG
- **Crear** `app/api/estudio/export/csv/route.ts` (UTF-8 con BOM).
- **Crear** `exportar-svg.tsx`: serializa el nodo SVG ya pintado. Sin
  dependencias nuevas.

### Fase 7 — Vocabulario cruzado
- **Crear** `scripts/spike-vocabulario.ts` **primero**: imprime el cruce real
  del grupo Multinivel por consola. Si el resultado es ruido, lo digo y
  replanteamos antes de construir interfaz.
- Luego `lib/vocabulario.ts` y `vocabulario.tsx`.

### Fase 8 — Exportación JSON
- **Crear** `app/api/estudio/export/json/route.ts`.

**No toco** `lib/scan-report.ts` (cálculo de dimensiones),
`lib/consolidated.ts` (agregación del score) ni nada del pipeline de scans.
El módulo lee.

---

## 6. Lo que necesito que decidas

1. **Las tres bajas del estudio** (`nuskin.com`, `terna.it`, `tim.it`):
   ¿fueron tuyas o hay que reponerlas?
2. **Fase 1.5 antes de la 2**, como propongo, o seguimos el orden de la spec
   asumiendo que se pierden cambios al clasificar rápido.
3. **Dimensiones en el CSV**: diez (recomiendo) o las seis de la spec.
4. **Mapa de madurez**: excluir las dimensiones no detectadas y marcar la
   marca como lectura insuficiente (recomiendo), o contarlas como cero.
5. **SVG para Figma**: texto editable con fuente sustituible (recomiendo, sin
   dependencias) o trazos reales, que exige añadir `opentype.js`.
6. **`verification`**: campo manual desde cero, o lo sembramos del estado del
   scan (publicado → `verified`, retenido → `pending`, sin scan → `no_source`)
   y se corrige a mano.

Con esas seis respuestas empiezo por la fase 1.
