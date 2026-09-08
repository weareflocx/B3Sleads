# Plan — La pestaña Mapas pasa de gráfico a herramienta

Respuesta a la petición del 2026-09-08. **No he implementado nada: espero
aprobación.** Un commit por bloque numerado.

## Lo que hay hoy

| Pieza | Archivo | Estado |
| --- | --- | --- |
| El mapa | `app/(dashboard)/marcas/[domain]/mapa.tsx` | 445 líneas, SVG a mano |
| El anillo | `app/(dashboard)/score-ring.tsx` | `ScoreRing` + `scoreColor`, SVG puro |
| El logo | `app/(dashboard)/company-logo.tsx` | cliente, cascada de 3 fuentes |
| Los datos | `lib/battle-cards.ts` (`MarcaEstudio`), `lib/benchmark.ts` | |
| Los puntos | `marcas/[domain]/page.tsx` líneas 120-150 | se calculan en servidor |
| Escribir | `estudio-estado.tsx` (`puntuar`, `clasificar`) | ya existen |

`PuntoMapa` hoy lleva dominio, nombre, score, x, y, capa, rol, nota. Le
faltan para lo que pides: **dimensiones, URL del informe y los dos valores de
eje sin normalizar**. Se añaden en `page.tsx`, que ya tiene `perfilDeMarca` y
`ultimoPublicable` a mano.

---

## Bloque 1 — Puntos con logo y anillo

- **Extraigo la geometría** del anillo a `score-ring.tsx` como
  `anilloDeScore(score, size)` → `{ r, circunferencia, relleno, color, grosor }`.
  `ScoreRing` pasa a usarla. Así el mapa dibuja el mismo anillo sin duplicar
  números ni poder desviarse de él.
- En el mapa, cada marca deja de ser un `<circle>` y pasa a un `<g>` con:
  anillo de fondo, arco de color, `<clipPath>` circular, `<image>` del logo y
  `<text>` con las iniciales debajo (visible solo si la imagen no carga, igual
  que hace `CompanyLogo`).
- **Tamaño por capa, fijo**: competitivo 38, registro 30, anti-referencia 26.
  El score deja de ser el tamaño y pasa a ser el arco.
- Cliente: rombo con el anillo real detrás para "hoy"; rombo de trazo
  discontinuo y sin anillo para "objetivo".

**Decisión que necesito señalarte.** El logo dentro del SVG va como `<image>`
apuntando a la URL externa (DuckDuckGo o Google). Eso se ve bien en pantalla,
pero **Figma no descarga imágenes externas**, así que en el bloque 6 hará
falta convertirlas. Lo trato allí.

Archivos: `score-ring.tsx`, `mapa.tsx`, `page.tsx` (dimensiones y `report_url`
en `PuntoMapa`).

---

## Bloque 2 — Hover, panel y `external_card_url`

- **Hover**: tarjeta flotante siguiendo el ratón con nombre, dominio, score,
  rol, capa, prioridad, nota y los dos valores de eje. Sustituye a la caja fija
  de debajo del mapa que hay ahora.
- **Clic**: panel a la derecha. Cuando se abre, la zona del mapa pasa a
  `grid-cols-[1fr_320px]`. El SVG es responsivo por `viewBox`, así que se
  reescala solo y el reparto de etiquetas se recalcula: no hay que tocar
  coordenadas.
- El panel lleva lo del hover más: las diez dimensiones en barras (reusando
  `scoreColor` para el tono), los dos ejes en `input[type=range]`, enlace al
  informe B3S y enlace a la ficha externa.
- **Sliders**: mueven el punto mientras arrastras y guardan al soltar. Para eso
  `puntuar()` en `estudio-estado.tsx` gana un tercer argumento
  `{ persistir?: boolean }`: durante el arrastre actualiza solo el estado, al
  soltar escribe. Sin eso, arrastrar de 2 a 8 dispararía seis peticiones.
- **`external_card_url`**: campo nuevo en `MarcaEstudio`. Sin migración, es
  jsonb. Toca `battle-cards.ts` (interfaz + `saneaParcheMarca`, validando que
  sea `http(s)`), `export-estudio.ts` y `import-estudio.ts` para que viaje en
  el JSON, la tabla de clasificación (columna nueva) y el panel.

Archivos: `mapa.tsx`, `panel-marca.tsx` (nuevo), `estudio-estado.tsx`,
`battle-cards.ts`, `tabla-clasificacion.tsx`, `export-estudio.ts`,
`import-estudio.ts`, `app/api/estudio/export/json/route.ts`.

---

## Bloque 3 — Rejilla, valores y cuadrantes

- Rejilla cada unidad (11 líneas por eje), las de 5 más marcadas.
- Números 0, 5 y 10 en los bordes de los dos ejes.
- Etiquetas de extremo pegadas a su extremo; título del eje X centrado abajo y
  el del eje Y centrado a la izquierda con `transform="rotate(-90)"`.
- Etiqueta de cuadrante discreta en cada esquina, combinando extremos
  ("Habla de red · Modelo explicado").
- **Márgenes**: de `{34,30,40,34}` a `{28,28,64,64}` para que quepan números y
  títulos. El lienzo sigue en 800×500 (16:10) para que el export salga a
  1600×1000 sin deformar.

Archivo: `mapa.tsx`.

---

## Bloque 4 — Leyenda

Bloque propio bajo el mapa: los tres puntos de capa con el mismo aspecto que
en el mapa (anillo, no círculo plano), el rombo del cliente, la línea
discontinua hoy → objetivo, y el contador de etiquetas ocultas. Fuera "el
tamaño es el score".

Archivo: `mapa.tsx`.

---

## Bloque 5 — Etiquetas que se apartan

Hoy: cuatro huecos candidatos y, si ninguno cabe, se oculta. Pasa a: los
cuatro huecos, y si ninguno cabe, se busca en anillos crecientes alrededor del
punto (8 direcciones × 3 distancias). Cuando la etiqueta queda a más de ~14px
del punto se dibuja una **línea guía** fina del borde del anillo a la etiqueta.
Solo se oculta si tampoco cabe así, y sigue saliendo en hover.

Archivo: `mapa.tsx`.

---

## Bloque 6 — Exportación SVG

El export ya resuelve las variables CSS. Le falta:

- **Los logos.** Figma no descarga URLs externas, y convertirlas en el
  navegador choca con CORS: ni DuckDuckGo ni Google mandan cabecera para que
  podamos leer sus bytes. Propongo `app/api/logo/[domain]/route.ts`: recibe
  **solo un dominio**, nunca una URL, lo busca en `companies`, prueba la misma
  cascada del lado servidor y devuelve la imagen. Con eso el navegador puede
  leerla y convertirla a `data:` al exportar.
  Restringir la entrada a dominios que ya están en la base es lo que evita
  convertir el proxy en un pasamanos para pedir cualquier URL desde nuestro
  servidor.
  Si el logo no se consigue, va la inicial, como acordamos.
- Rejilla, leyenda y etiquetas de cuadrante entran solas al ser parte del SVG,
  salvo la leyenda, que hoy es HTML: **la dibujo también dentro del SVG**, en
  una banda inferior que solo aparece en el archivo exportado.
- Fondo transparente y texto editable ya funcionan.

Archivos: `mapa.tsx`, `app/api/logo/[domain]/route.ts` (nuevo).

---

## Lo que no toco

El scoring, la pestaña Montaje, la composición de grupos y el cálculo del mapa
de madurez. El mapa lee; lo único que escribe son las dos puntuaciones de eje
y `external_card_url`, por los caminos que ya existen.

## Riesgos

1. **Rendimiento del hover.** 19 marcas con anillo, logo y clip son ~100 nodos
   SVG más. Es poco, pero el hover no puede re-renderizar el mapa entero: la
   tarjeta flotante irá en un div aparte, no dentro del SVG.
2. **Logos que no cargan.** La cascada actual falla en bastantes dominios. En
   el mapa se verá la inicial, que es el mismo comportamiento que en las
   listas, así que no será una sorpresa.
3. **El panel encoge el mapa.** A 320px de panel, en una pantalla de 1280 el
   mapa se queda en unos 600px de ancho. Es suficiente, pero las etiquetas se
   reparten distinto al abrirlo. Lo aviso porque se nota.

## Una pregunta

El bloque 3 pide números 0, 5 y 10 en los bordes. **En el mapa de madurez el
eje Y es el Brand3 Score (0–100), no 0–10.** Ahí pondré 0, 50 y 100, y la
rejilla cada 10. Dímelo si prefieres otra cosa.
