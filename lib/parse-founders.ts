// Parser flexible para el alta en lote de founders.
//
// IMPORTANTE (spec §9): esto NO lee LinkedIn. Solo estructura texto que Sergio
// ya tiene delante y pega (URLs de perfil, dominios, notas). Cero scraping.
//
// Acepta una línea por founder, en cualquier orden y formato:
//   https://www.linkedin.com/in/jane-doe | Jane Doe | acme.io | comentó mi post
//   linkedin.com/in/maxweber  verdeo.eu
//   Ana Ruiz  linkedin.com/in/anaruiz  ana@studioruiz.com
// De cada línea saca: handle de LinkedIn, dominio de la marca, nombre y nota.
// Si una línea trae varias URLs de LinkedIn y nada más, sale una entrada por URL.

import { parseLinkedInHandle, humanizeHandle } from './types';

export interface ParsedEntry {
  raw: string;
  linkedin?: string; // URL normalizada del perfil
  handle?: string; // handle canónico
  name?: string; // explícito o humanizado desde el handle
  nameAuto: boolean; // true si el nombre se dedujo del handle
  company?: string; // nombre de empresa explícito (formato con "|")
  domain?: string; // dominio de la marca
  note?: string; // ángulo / contexto
  valid: boolean; // hay al menos handle o dominio
}

const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^\s|/?#]+)\/?/gi;
// Dominio: label(s) + TLD alfabético de 2+; admite protocolo/www y ruta.
const DOMAIN_RE =
  /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?:\/[^\s|]*)?/gi;

function normalizeDomain(d: string): string {
  return d
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/[.,;]+$/, '');
}

function entryFromParts(raw: string, handle?: string, domain?: string, text?: string): ParsedEntry {
  // El texto sobrante, partido por "|", da nombre y nota si vienen explícitos.
  const segments = (text ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  let name: string | undefined;
  let note: string | undefined;
  let company: string | undefined;
  if (segments.length === 1) {
    name = segments[0];
  } else if (segments.length >= 2) {
    name = segments[0];
    note = segments[segments.length - 1];
    if (segments.length >= 3) company = segments[1];
  }

  const nameAuto = !name && !!handle;
  if (nameAuto) name = humanizeHandle(handle!);

  return {
    raw,
    linkedin: handle ? `https://www.linkedin.com/in/${handle}` : undefined,
    handle,
    name: name || undefined,
    nameAuto,
    company,
    domain,
    note,
    valid: !!(handle || domain),
  };
}

export function parseFounderLines(input: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1) Handles de LinkedIn en la línea
    const handles: string[] = [];
    for (const m of line.matchAll(LINKEDIN_RE)) {
      const h = parseLinkedInHandle(`linkedin.com/in/${m[1]}`);
      if (h) handles.push(h);
    }

    // 2) Quitar las URLs de LinkedIn y buscar un dominio en lo que queda
    const withoutLinkedin = line.replace(LINKEDIN_RE, ' ');
    let domain: string | undefined;
    for (const m of withoutLinkedin.matchAll(DOMAIN_RE)) {
      const d = normalizeDomain(m[1]);
      if (d && !d.endsWith('linkedin.com')) {
        domain = d;
        break;
      }
    }

    // 3) Texto libre = línea sin URLs de LinkedIn ni el dominio detectado
    let text = withoutLinkedin;
    if (domain) {
      text = text.replace(DOMAIN_RE, (match) =>
        normalizeDomain(match) === domain ? ' ' : match,
      );
    }
    // Quitar restos de email (el "ana@" que queda tras extraer el dominio)
    text = text.replace(/[^\s|]*@[^\s|]*/g, ' ');
    // Limpiar separadores sueltos y espacios, conservando "|" para los segmentos
    text = text.replace(/\s{2,}/g, ' ').replace(/(^[\s|]+|[\s|]+$)/g, '').trim();

    // Varias URLs de LinkedIn sin más estructura → una entrada por perfil
    if (handles.length > 1 && !domain && !text) {
      for (const h of handles) out.push(entryFromParts(line, h));
      continue;
    }

    if (!handles.length && !domain) {
      out.push({ raw: line, nameAuto: false, valid: false });
      continue;
    }

    out.push(entryFromParts(line, handles[0], domain, text));
  }
  return out;
}
