# Auditoría B3S Leads · 30/09/2026

Tres pasadas en paralelo sobre todo el repo: pantallas y coherencia, datos y
robustez, y flujo de producto (lo que usamos cada día para captar). Más de
100 hallazgos; aquí están cruzados, sin duplicados y ordenados por días.
Cada línea dice qué pasa y dónde. Se marca `[x]` al subirlo.

Esfuerzo: S (< medio día), M (1-2 días), L (más).

## Ya hecho hoy
- [x] La tarjeta-imagen usa el logo automático, sin deformar (`brand-card.tsx`).
- [x] Un scan colgado ya no bloquea el botón de scan; rescate que solo cierra con respuesta del Scanner (`b3s-scan-storage.ts`).
- [x] Ordenar marcas del estudio arrastrando, también entre grupos.
- [x] Comprobado: los registros nuevos están desactivados en Supabase. Nadie de fuera puede entrar desde "Empezar" de la landing.

## 01/10 · Fuera del plan
- [x] **Subir en lote** (tabla o CSV, vista previa, deduplicado, sin scans).
- [ ] **Mapa de marcas** por país y ciudad: la subida en lote ya los guarda (`hq_country`, `city`); falta pedirlos también en el alta normal y en la ficha.

## Día 1 · Errores que guardan o enseñan datos falsos (S cada uno)
- [x] **Regenerar borrador no se guarda**: `api/messages/regenerate` usa el cliente anónimo y el insert falla en silencio.
- [x] **"Regenerar" corrompe lo enviado**: la tarjeta sigue apuntando al mensaje viejo y guarda el texto nuevo de la IA como `edited_final` (lo que el humano envió) (`briefing/lead-card.tsx:113-138`).
- [x] **Idioma del borrador**: `/spain|españa|es\b/` casa con "United States", "Wales", "Philippines"… y salen borradores en español a empresas de EE. UU. (`lib/claude.ts:97`). El nocturno usa otra regla.
- [x] **Importar informe por URL revienta** en la página de inversor y en la marca del estudio: no se manda `companyId` (`scan-button.tsx:168`, `api/scans/import:60`).
- [x] **La ficha dice "Scan en marcha" con un scan fallido** (`companies/[domain]/page.tsx:541`) y el briefing enseña el estado crudo en inglés ("Brand3: scan failed…") y JSON del tldr (`lead-card.tsx:38,222`).
- [x] **El scan lanzado desde el estudio no actualiza `leads.scan_id`**: si la marca también es lead, la ficha sigue con el scan viejo (`api/estudio/marca`).
- [x] **"Reescanear" el mismo día repite el mismo trabajo** del Scanner por la clave de idempotencia por día (`api/estudio/marca:87`).
- [x] **Las tres marcas rescatadas desde local** completadas por la API el 01/10 (Utopicum, Studiofreight, Locomotive sept.). Ahora cualquier scan cerrado por la vía pública se completa solo al abrir su ficha.
- [x] Extra: importar un informe de otra marca se rechaza (antes se colgaba de la ficha equivocada); errores visibles en la tarjeta del briefing en vez de `alert()`; "Copiar y abrir LinkedIn" ya no lo bloquea Safari.

## Día 2 · Un solo estado del scan y una sola nota en toda la app (M)
La misma marca dice "listo 62" en la ficha, "retenido" en Startups y "fuera de la cola" en el briefing, porque la ficha usa el último scan con nota y el resto el último scan a secas.
- [ ] `hydrateLeads` expone el último scan y el último publicable; todas las pantallas leen la nota del publicable.
- [ ] Una función `estadoScan()` y un `<ScanBadge>` con vocabulario fijo: listo · escaneando · retenido · bloqueado · falló · sin scan. Hoy hay ocho redacciones distintas.
- [ ] Una sola regla de "colgado" (`data.ts` ignora `blocked`: un bloqueado sale "escaneando…" para siempre en el estudio) y acción **continuar** para bloqueados.
- [ ] Umbrales, colores y etiquetas de nota en un solo sitio (`lib/score-bands.ts`): hoy un 55 es rojo en la home y azul en su anillo; "funcional, indistinguible" vs "funciona, aún no distingue".
- [ ] Nota consolidada (con curación) en todas partes, no solo en ficha y estudio.

## Día 3 · Borradores que cumplen `message-system.md` (S cada uno)
- [ ] **Revisor automático del borrador**: rayas, lista negra, 500 caracteres, mención de FLOC o servicios, "vi que". Reintenta una vez o avisa en la tarjeta.
- [ ] **El ángulo de reserva es copy de agencia** ("El momento es ahora…", `lib/pitch.ts:251-276`). Pasarlo a observación + pregunta.
- [ ] Quitar rayas de nuestros propios prompts (`lib/lead-prompts.ts:44,51,167-172`).
- [ ] No pasar al redactor el plan de arreglo de cada hueco (`scan-report.ts:579`): empuja a proponer soluciones.
- [ ] El borrador usa las dimensiones curadas, como la ficha (`lib/claude.ts:91`, `founders/page.tsx:16`).
- [ ] Borradores nocturnos sin destinatario: regenerar al añadir el contacto o marcarlos.
- [ ] Openers que suenan a auditoría desde arriba ("Su web explica bien qué hacen, pero no por qué existen", `pitch.ts:27,67`).

## Día 4 · B3S Studio a la vista (S-M)
Hoy solo se llega al estudio desde el banner de "Cerrado", y la landing lo vende como preparación de la primera reunión.
- [ ] Entrada **Studio** en la barra lateral y página con la lista de estudios.
- [ ] "Abrir estudio" en la cabecera de cada ficha, en cualquier etapa.
- [ ] Los competidores (sin lead) se encuentran en la búsqueda, tienen ficha y se ofrecen en otros estudios.
- [ ] Chips de competidores de la ficha enlazados ("añadir al estudio").
- [ ] Términos de Atributos/Valores también en la página de marca del estudio.

## Día 5 · Que nada se quede a medias sin nadie mirando (M)
- [ ] **Barrido programado** (Netlify Scheduled Function cada 10-15 min) que sincroniza los scans en marcha. Hoy solo avanzan si hay una pestaña abierta. De paso, re-trae por API los informes importados por la vía pública.
- [ ] Un solo scan activo por marca (índice único): dos pestañas lanzan hoy dos scans de pago.
- [x] Plazo por llamada en la sincronización (4 s estado + 5 s informe; vía pública directa con 3,5 s). Falta el rescate de colgados dentro de lanzar.
- [x] La barra del scan sale siempre que está en curso (iPronics, 01/10).
- [ ] El entorno local no escribe en producción sin permiso explícito, y `next dev` solo en 127.0.0.1.
- [ ] Refuerzo de acceso: lista de emails permitidos en el middleware (por si alguien reactiva registros) y `shouldCreateUser:false`.
- [ ] Seguridad de la base (SQL a aplicar en Supabase): vista `scans_ligeros` con `security_invoker`, RLS en `investors` y `component_selections`, revocar las RPC `estudio_*` a anon.

## Siguiente semana · Captación diaria
- [ ] Borrador editable y "copiar y abrir LinkedIn" en la propia ficha.
- [ ] "Pegar borrador" para lo que se redacta en Claude aparte.
- [ ] Tras copiar: "¿Enviado? Marcar contactado · seguimiento en 5 días".
- [ ] Seguimientos con fecha (`next_action_at`), posponer y borrador de seguimiento.
- [ ] Sección "Esperando respuesta" (hoy un contactado desaparece 5 días de todas las listas).
- [ ] Motivo de descarte en Founders y Pipeline (hoy todo es "Otro"); etapa "Perdido".
- [ ] Filtro "Mis leads / Todos", filtros y vistas guardadas, acciones masivas.
- [ ] Reescanear lo de más de 90 días.
- [ ] Historial de actividad (`lead_events`) y exportación de leads.
- [ ] Errores visibles en todos los botones (hoy seis acciones fallan en silencio) y fuera los `alert()`.
- [ ] Móvil: etapa en el pipeline sin arrastre, subir/bajar en el estudio, edición sin hover.
- [ ] `loading.tsx`, `error.tsx` y 404 en español.

## Decisiones tuyas
1. ~~**"Startups" → "Marcas"**~~ Hecho el 01/10 (textos; la dirección /startups se mantiene).
2. **ICP y registro del mensaje**: `icp.json` excluye agencias y empresas de más de 50 personas, y `message-system.md` es de founder a founder. Si ahora vamos a por agencias o marcas establecidas, hace falta un segmento y una segunda voz.
3. **Crédito "B3S Scanner by FLOC\*" en la tarjeta**: las reglas dicen no mencionar FLOC en el primer mensaje. ¿Versión sin crédito para primer contacto?
4. **Migraciones pendientes** de aplicar en Supabase: `20260909120000_scans_ligeros.sql` y `20260911090000_battle_cards_claims.sql`, más las de seguridad del día 5.
5. Los otros **4 scans colgados** (acurio.vc, lanai.vc, masia.vc, pagemind.ai): se rescatan con el barrido del día 5 o antes si quieres.
