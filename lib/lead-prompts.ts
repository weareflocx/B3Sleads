// Prompts autocontenidos para trabajar el lead en un LLM externo (el Claude
// que Sergio ya paga, o su agente "Guanchito"). Cero coste de API: se copian
// y se pegan. Reúnen TODO lo que sabemos del lead + el análisis de marca.
//
// Dos usos:
//  - buildLeadContext(): el dossier del lead (para preguntar cosas).
//  - buildCallBriefPrompt(): instrucciones + dossier para generar un brief de
//    llamada con la estructura de los que Sergio hacía a mano (estilo Bokeroon).
import offer from '@/config/floc-offer.json';
import type { BriefingLead } from './types';
import { displayName } from './types';
import { buildPitch } from './pitch';
import { storedScanReport, reportDigest } from './scan-report';

function fundingLine(bl: BriefingLead): string | null {
  const f = bl.signal?.type === 'funding_round' ? bl.signal : null;
  if (f?.detail) {
    const d = f.detail;
    return [d.round, d.amount, (d.investors as string[] | undefined)?.join(', ')]
      .filter(Boolean)
      .join(' · ');
  }
  return bl.company?.funding_stage ?? null;
}

// El dossier: identidad, marca, scan y argumentario, en texto plano.
export function buildLeadContext(bl: BriefingLead): string {
  const c = bl.company;
  const k = bl.contact;
  const lines: string[] = [];

  lines.push('# DOSSIER DEL LEAD');
  if (c) {
    lines.push(`Empresa: ${c.name} (${c.domain})`);
    if (c.description) lines.push(`Qué hace: ${c.description}`);
    const meta = [c.sector, c.size ? `${c.size} personas` : null, c.city, c.hq_country]
      .filter(Boolean)
      .join(' · ');
    if (meta) lines.push(`Contexto: ${meta}`);
    const funding = fundingLine(bl);
    if (funding) lines.push(`Financiación: ${funding}`);
    if (c.icp_fit != null) lines.push(`Fit ICP: ${c.icp_fit}%${c.icp_reason ? ` — ${c.icp_reason}` : ''}`);
    if (c.competitors?.length) lines.push(`Competidores: ${c.competitors.map((x) => x.name).join(', ')}`);
    if (c.keywords?.length) lines.push(`Keywords: ${c.keywords.join(', ')}`);
  }
  if (k) {
    lines.push('');
    lines.push('## Founder');
    lines.push(`Nombre: ${displayName(k.full_name)}${k.role ? ` — ${k.role}` : ''}`);
    if (k.headline) lines.push(`Titular LinkedIn: ${k.headline}`);
    if (k.city) lines.push(`Ciudad: ${k.city}`);
    if (k.linkedin_url) lines.push(`LinkedIn: ${k.linkedin_url}`);
    if (k.email) lines.push(`Email: ${k.email}`);
    if (k.notes) lines.push(`Notas: ${k.notes}`);
  }

  // Análisis de marca del Scanner (lo específico e irrepetible)
  const report = storedScanReport(bl.scan?.result_raw);
  if (bl.scan?.score != null) {
    lines.push('');
    lines.push('## B3S Scanner');
    lines.push(`Score: ${Number(bl.scan.score)}/100`);
    if (report) lines.push(reportDigest(report));
  }

  // Argumentario ya derivado (determinista)
  if (c && bl.scan) {
    const pitch = buildPitch({ company: c, scan: bl.scan, fundingSignal: bl.signal });
    if (pitch.lectura.length) {
      lines.push('');
      lines.push('## Lectura de marca');
      pitch.lectura.forEach((l) => lines.push(`- ${l}`));
    }
    if (pitch.angulos.length) {
      lines.push('');
      lines.push('## Ángulos para abrir');
      pitch.angulos.forEach((a) => lines.push(`- ${a}`));
    }
  }

  return lines.join('\n');
}

// Contexto de FLOC* para el brief (qué resolvemos y con qué programas).
function offerContext(): string {
  const programs = offer.programs.map((p) => `- ${p.name} (${p.price}): ${p.scope} · ${p.for}`);
  return [
    '## FLOC* (contexto interno: en la llamada no se pitchea metodología ni precio)',
    offer.positioning,
    `Problema que resolvemos: ${offer.customer_problem}`,
    'Programas:',
    ...programs,
    `Prueba: ${offer.proof}`,
  ].join('\n');
}

// El brief de llamada: instrucciones + dossier. Versión 2, calcada del
// prompt maestro de Sergio (jul 2026): verificación contra las superficies
// vivas antes de escribir, postura founder-to-founder, y sobre todo un GUION
// seguible en vivo con preguntas literales y chuleta final. La diferencia
// con el maestro original es que aquí el dossier no se pega a mano: va
// relleno con lo que ya sabe la app.
export function buildCallBriefPrompt(bl: BriefingLead): string {
  const founder = displayName(bl.contact?.full_name) || 'el founder';
  const url = bl.company ? `https://${bl.company.domain}` : null;

  const instructions = `Eres el estratega de ventas de Sergio (FLOC*, estudio de diseño estratégico de marca para founders de startups). A partir del dossier de abajo, redacta un BRIEF DE LLAMADA para preparar una conversación con ${founder}. Documento interno, confidencial, founder-to-founder. No es un guion de venta agresiva.

Antes de escribir, VERIFICA. No te fíes del Scanner a ciegas.
${url ? `- Abre la web real del lead (${url}) y, si hay, la ficha de app o capturas. Compara lo que dice el Scanner con lo que hay vivo hoy.` : '- Este lead aún no tiene web en el dossier: trabaja solo con lo que hay y márcalo.'}
- Si el Scanner y la web se contradicen (p.ej. el scan dice "sin valores" y la web sí los tiene, o leyó otra versión o idioma), dilo explícito y no uses el score como diagnóstico. El fallo del scan suele ser en sí un hallazgo: señal de incoherencia entre superficies.
- Si no puedes navegar desde aquí, dilo en una línea al principio y trata TODO lo no confirmado como hipótesis. No lo disimules.
- Marca como HIPÓTESIS todo lo que no puedas confirmar. No inventes datos.

Voz. Declarativa, sin clichés de agencia, sin em dashes. Específica de esta marca: si una frase le valdría a cualquier startup, sobra. Apóyate en hallazgos concretos (frases literales de la web/app, features reales, el idioma que usan).

Regla de postura. Reconoce primero lo bueno que el lead ya tiene; entra por la distancia entre lo construido y lo que se ve, nunca por el score. Nunca lleves cifras del scanner a la sala si contradicen la realidad. No expliques qué es una marca a un founder con criterio.

Devuelve Markdown con estas secciones:

1. **Lo esencial en diez líneas** — el brief entero comprimido, por si solo se lee esto antes de descolgar.
2. **La idea que sostiene la llamada** — una sola frase que capture la grieta estratégica.
3. **Inteligencia del lead** — quién es, tracción real, estado, el pivote o tensión que casi nadie ha visto, qué revelan la web y la app (con detalles concretos), cómo es como operador, señal de compra si la hay en la bitácora.
4. **Síntesis del Scanner** — qué aguanta contra la realidad y qué no; el matiz a tener claro (si el scan leyó una superficie desactualizada o en otro idioma); y por qué el score no entra en la sala.
5. **El gancho** — una sola idea con la que entrar, por la distancia entre lo construido y lo que se ve.
6. **Dolor profundo (5 porqués)** — dolor declarado (o hipótesis), motivación ulterior en una frase, escenario pesadilla realista, su propio idioma literal (reflejarlo, no traducirlo a "branding").
7. **GUION DE LLAMADA** — la sección clave. Debe ser seguible en vivo:
   - Apertura: las palabras exactas para abrir, desarmar y ganar el derecho a diagnosticar.
   - Bloques de descubrimiento en orden (situación, grieta marca-empresa, autonomía/dependencia, visión y voz, decisión y timing), cada uno con las PREGUNTAS LITERALES numeradas que debe hacer Sergio, una por beat, con una nota breve de "qué escuchar". Que las verbalice ${founder}, no Sergio.
   - El puente: la frase de transición que refleja sus palabras, nombra la grieta y pide un sí.
   - Nota de cómo usar los 5 porqués como brújula durante la llamada, no como preguntas nuevas.
8. **Cierre** — qué programa de FLOC* encaja y por qué AHORA, con las palabras exactas del cierre, fricción cero, sin pitch de metodología ni cifras en frío. Justifica la elección de programa por el estado real del lead. Objetivo: segunda conversación con fecha.
9. **Manejo de objeciones** — 3 o 4 objeciones probables y cómo reconducir desde la posición de par, sin defender metodología ni soltar precio.
10. **Notas de riesgo** — dónde se rompe la llamada sola.
11. **Chuleta** — solo las preguntas del guion en orden, para mirar de reojo durante la llamada.`;

  return `${instructions}\n\n---\n\n${buildLeadContext(bl)}\n\n---\n\n${offerContext()}`;
}
