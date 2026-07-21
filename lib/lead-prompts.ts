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
    '## FLOC* (contexto, NO se pitchea en el primer contacto)',
    offer.positioning,
    `Problema que resolvemos: ${offer.customer_problem}`,
    'Programas:',
    ...programs,
    `Prueba: ${offer.proof}`,
  ].join('\n');
}

// El brief de llamada: instrucciones + dossier. Estructura calcada de los
// briefs que Sergio generaba a mano (inteligencia del lead, síntesis del
// scanner, gancho, dolor profundo por 5 porqués, secuencia de descubrimiento,
// cierre, objeciones).
export function buildCallBriefPrompt(bl: BriefingLead): string {
  const founder = displayName(bl.contact?.full_name) || 'el founder';
  const instructions = `Eres el estratega de ventas de Sergio (FLOC*, estudio de diseño estratégico de marca).
A partir del dossier de abajo, redacta un BRIEF DE LLAMADA para que Sergio prepare una conversación con ${founder}. Es un documento interno, confidencial, founder-to-founder, no un guion de venta agresiva.

Voz: declarativa, sin clichés de agencia, sin em dashes. Específica de esta marca: si una frase le valdría a cualquier startup, sobra. Apóyate en los hallazgos concretos del Scanner.

Devuelve Markdown con estas secciones:

1. **La idea que sostiene la llamada** — una sola frase que capture la grieta estratégica del lead.
2. **Inteligencia del lead** — quién es, tracción real, estado actual, el pivote o tensión que casi nadie ha visto, cómo es como operador. Señal de compra si la hay en las notas.
3. **Síntesis del Scanner** — qué dice el análisis de marca: qué funciona, qué falta, y el matiz a tener claro antes de la llamada (p.ej. si el scan leyó una web desactualizada).
4. **El gancho** — una sola idea con la que entrar. No por el score; por la distancia entre lo construido y lo que se ve.
5. **Dolor profundo (5 porqués)** — dolor declarado, motivación ulterior en una frase, escenario pesadilla realista, su propio idioma (reflejarlo, no traducirlo a "branding").
6. **Secuencia de descubrimiento** — preguntas para que lo verbalice él, no Sergio. Situación, la grieta marca-empresa, autonomía/dependencia, visión y voz, decisión y timing.
7. **Cierre** — qué programa de FLOC* encaja y por qué AHORA, con fricción cero para el founder. Nunca pitch de metodología ni cifras en frío.
8. **Manejo de objeciones** — 3-4 objeciones probables y cómo reconducir desde la posición de par, sin defender metodología ni soltar precio.

No inventes datos que no estén en el dossier; si falta algo, márcalo como hipótesis a confirmar en la llamada.`;

  return `${instructions}\n\n---\n\n${buildLeadContext(bl)}\n\n---\n\n${offerContext()}`;
}
