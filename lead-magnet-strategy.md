# Eclipse Scan — estrategia del lead magnet

Diseñado con el framework de lead magnets de Hormozi ($100M Leads). Fecha: 12
de agosto de 2026, el día del eclipse total sobre España. Implementado en
`/eclipse` (esta misma app).

## Contexto

- **Core offer**: GTM by FLOC* — el pack de servicio para salir al mercado
  (estrategia, narrativa, lanzamiento). Ticket alto, requiere confianza.
- **Producto puente**: B3S Scanner — mide marcas sobre 100 en 9 componentes.
- **ICP**: founders de startups españolas early-stage, con ronda reciente o
  lanzamiento. Los mismos que alimentan el radar de B3S Leads.
- **Dolor en su lenguaje**: "no sé cómo se lee mi marca desde fuera" /
  "mi web cuenta qué hago pero no distingue".
- **Objeción principal al core offer**: "branding es humo, no sé qué me
  llevo" → el scan lo convierte en números y hallazgos concretos.

## Decisión: sí procede un lead magnet

El ticket de GTM es alto y el avatar necesita ver la mecánica antes de
comprar. Un audit gratuito es el tipo de LM más fuerte para servicios
(enseña el diagnóstico, vende el tratamiento) y el evento le da el hook
noticiable que un audit no suele tener.

## LM-A (implementado) — Eclipse Scan

- **Narrow problem**: saber, en 2 minutos, qué transmite tu marca hoy y qué
  no. Solución completa a ese problema estrecho: score /100 + una clave
  positiva + una negativa, al instante y con imagen compartible.
- **Tipo**: audit/assessment (revela el problema, no lo resuelve).
- **Naming/promesa**: "Escanea tu marca gratis: descubre qué brilla y qué se
  eclipsa" anclado al eclipse de HOY (specificity por evento, no por número).
- **Mecánica**: URL + email → el progreso ES el eclipse (la luna cubre el
  sol mientras el Scanner trabaja) → totalidad → resultado.
- **Coste en tiempo del lead**: ~2 min. El valor percibido (un análisis real
  de 9 componentes camino del email) excede con mucho ese coste.
- **Bridge al core offer**: el scan revela el problema B (la narrativa no
  distingue). El resultado lo dice y ofrece el después: "GTM by FLOC* es el
  sistema para salir al mercado con una marca que distingue".
- **Doble captura**: el email entra en la waitlist de B3S (producto) y en el
  pipeline de GTM (servicio). Un LM, dos funnels.
- **Viralidad**: el resultado es una imagen cuadrada con score, pensada para
  X/LinkedIn con post predefinido. Cada share trae al siguiente founder.

## Alternativas (no implementadas)

- **LM-B — Caso antes/después**: "Cómo una startup seed pasó de 46 a 71 en
  B3S en 6 semanas". Más fuerte en prueba, más lento de producir; requiere
  un caso publicable.
- **LM-C — La checklist del después**: los 9 componentes como checklist
  auto-evaluable en PDF. Barato, pero pierde el efecto wow del scan real y
  la imagen compartible.

## Quality checklist (LM-A)

- Resuelve un problema estrecho por completo: sí (foto de tu marca hoy).
- Vale el tiempo que cuesta: sí (2 min, resultado inmediato).
- Revela el problema que el core offer resuelve: sí, explícito en el copy.
- Fácil de consumir: sí (una pantalla, cero descargas para el resultado).
- MVP en <1 semana: hecho en un día.
- Naming específico: anclado al evento; sin "guía gratuita para escalar".

## Operación

- La waitlist vive en `eclipse_waitlist` (migración
  `20260812110000_eclipse_waitlist.sql`, pendiente de aplicar en Supabase).
- Freno de gasto: tope de 40 scans nuevos/día; pasado el tope, el lead queda
  registrado y pasa a "te llega por email". Idempotencia por dominio y día.
- El envío del análisis completo por email es MANUAL por ahora (no hay
  proveedor de email conectado): la lista se lee de la tabla.
- Métricas de éxito: emails/día, ratio scan→share, respuestas al email del
  análisis completo, reuniones GTM originadas.
