// Generación de mensajes y extracción de rondas con Claude API (spec §7)
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import type { BriefingLead } from './types';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');
  return new Anthropic();
}

function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts', name), 'utf-8');
}

interface IcpConfig {
  profile: string;
  positive: string[];
  negative: string[];
}

export function loadIcp(): IcpConfig {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'icp.json'), 'utf-8'));
}

// Prompt de extracción con los criterios ICP editables inyectados
function buildExtractPrompt(): string {
  const icp = loadIcp();
  const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
  return loadPrompt('funding-extract.md')
    .replace('{{ICP_PROFILE}}', icp.profile)
    .replace('{{ICP_POSITIVE}}', bullets(icp.positive))
    .replace('{{ICP_NEGATIVE}}', bullets(icp.negative));
}

// ---------- Redacción de mensajes ----------

export interface DraftInput {
  companyName: string;
  domain: string;
  hqCountry: string | null;
  signalSummary: string; // "Seed 2.4M€ hace 4 días, Kfund"
  scannerFindings: string; // 1-2 gaps concretos del Scanner
  personalAngle: string | null; // contacts.notes
  contactName: string | null;
  channel: 'linkedin' | 'email';
  lang: 'en' | 'es';
}

export async function generateDraft(input: DraftInput): Promise<string> {
  const system = loadPrompt('message-system.md');
  const user = [
    `Empresa: ${input.companyName} (${input.domain})`,
    input.hqCountry ? `País: ${input.hqCountry}` : null,
    `Señal: ${input.signalSummary}`,
    `Hallazgos del Scanner sobre su marca:\n${input.scannerFindings}`,
    input.personalAngle ? `Ángulo personal (del perfil del founder): ${input.personalAngle}` : null,
    input.contactName ? `Destinatario: ${input.contactName}` : null,
    `Canal: ${input.channel === 'linkedin' ? 'LinkedIn (max 500 caracteres)' : 'email corto'}`,
    `Idioma: ${input.lang === 'es' ? 'español' : 'inglés'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Respuesta sin texto');
  return block.text.trim();
}

export function draftInputFromLead(bl: BriefingLead): DraftInput {
  // El borrador se apoya en la marca (dominio + Scanner), así que exige empresa.
  if (!bl.company) throw new Error('No se puede redactar sin empresa: añade el dominio del founder');
  const detail = bl.signal?.detail ?? {};
  const parts = [detail.round, detail.amount, (detail.investors as string[] | undefined)?.join(', ')]
    .filter(Boolean)
    .join(' · ');
  const tldrText =
    typeof bl.scan?.tldr === 'string' ? bl.scan.tldr : JSON.stringify(bl.scan?.tldr ?? {});
  const isSpanish = (bl.company.hq_country ?? '').toLowerCase().match(/spain|españa|es\b/);
  return {
    companyName: bl.company.name,
    domain: bl.company.domain,
    hqCountry: bl.company.hq_country,
    signalSummary: parts || 'señal de momento detectada',
    scannerFindings: tldrText.slice(0, 3000),
    personalAngle: bl.contact?.notes ?? null,
    contactName: bl.contact?.full_name ?? null,
    channel: 'linkedin',
    lang: isSpanish ? 'es' : 'en',
  };
}

// ---------- QA de muestra (patrón Explee: verificar antes de aceptar) ----------

export interface QaResult {
  on_icp: number;
  total: number;
  notes: string;
}

// Revisa una muestra de candidatos ya extraídos y devuelve cuántos encajan
// de verdad en el ICP. Se registra en el log del run como control de calidad.
export async function qaSample(
  candidates: { company_name: string | null; sector: string | null; round: string | null; summary: string }[],
): Promise<QaResult | null> {
  if (!candidates.length) return null;
  const icp = loadIcp();
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `Eres el control de calidad de un pipeline de leads. ICP: ${icp.profile}\nNegativos: ${icp.negative.join('; ')}\nRecibes una muestra de candidatos aceptados. Devuelve SOLO JSON: {"on_icp": <int cuántos encajan>, "total": <int>, "notes": "<una frase sobre el ruido detectado>"}`,
    messages: [
      {
        role: 'user',
        content: candidates
          .map((c, i) => `${i + 1}. ${c.company_name} · ${c.sector} · ${c.round} · ${c.summary}`)
          .join('\n'),
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;
  try {
    const json = block.text.match(/\{[\s\S]*\}/)?.[0];
    return json ? (JSON.parse(json) as QaResult) : null;
  } catch {
    return null;
  }
}

// ---------- Extracción de rondas desde RSS ----------

export interface FundingExtraction {
  is_funding: boolean;
  fits_icp: boolean;
  company_name: string | null;
  company_domain: string | null;
  sector: string | null;
  hq_country: string | null;
  round: string | null;
  amount: string | null;
  investors: string[];
}

export async function extractFunding(title: string, content: string, sourceUrl: string): Promise<FundingExtraction | null> {
  const system = buildExtractPrompt();
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: [
      {
        role: 'user',
        content: `TITULAR: ${title}\n\nTEXTO: ${content}\n\nURL: ${sourceUrl}\n\nResponde SOLO con el JSON.`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;
  try {
    const json = block.text.match(/\{[\s\S]*\}/)?.[0];
    return json ? (JSON.parse(json) as FundingExtraction) : null;
  } catch {
    return null;
  }
}
