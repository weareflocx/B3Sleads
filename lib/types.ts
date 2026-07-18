// Tipos del modelo de datos (espejo de supabase/migrations/001_init.sql)

import { GIVEN_NAMES } from './names';

export type CompanySource =
  | 'lusha_signal'
  | 'rss'
  | 'manual'
  | 'engaged'
  | 'explee'
  | 'linkedin';
export type ContactSource = 'explee' | 'linkedin' | 'lusha' | 'engaged' | 'manual';
export type SignalType = 'funding_round' | 'hiring' | 'launch' | 'rebrand' | 'engagement';
export type ScanStatus = 'queued' | 'running' | 'ready' | 'failed';
export type LeadStage =
  | 'detected'
  | 'briefed'
  | 'contacted'
  | 'conversation'
  | 'call'
  | 'proposal'
  | 'won'
  | 'lost'
  | 'discarded';
export type MessageChannel = 'linkedin' | 'email';

export interface Competitor {
  name: string;
  domain?: string;
}

// Ficha de compañía estilo Explee: identidad + research + fit.
export interface Company {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  hq_country: string | null;
  sector: string | null;
  source: CompanySource;
  created_at: string;
  // Ficha (migración 002)
  linkedin_url: string | null;
  size: string | null;
  city: string | null;
  founded_year: number | null;
  funding_stage: string | null;
  determinants: string[] | null;
  competitors: Competitor[] | null;
  keywords: string[] | null;
  icp_fit: number | null;
  icp_reason: string | null;
}

export interface SignalDetail {
  amount?: string;
  round?: string;
  investors?: string[];
  source_url?: string;
  [key: string]: unknown;
}

export interface Signal {
  id: string;
  company_id: string;
  type: SignalType;
  detail: SignalDetail | null;
  detected_at: string;
}

export interface Scan {
  id: string;
  company_id: string;
  scanner_job_id: number;
  status: ScanStatus;
  score: number | null;
  tldr: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  result_raw: Record<string, unknown> | null;
  ui_url: string | null;
  created_at: string;
  completed_at: string | null;
}

// El founder. linkedin_url es el canal: por ahí se le escribe (a mano).
export interface Contact {
  id: string;
  company_id: string;
  lusha_id: string | null;
  full_name: string;
  role: string | null;
  email: string | null;
  linkedin_url: string | null;
  notes: string | null;
  enriched_at: string | null;
  // Migración 002
  linkedin_handle: string | null; // identidad canónica, sobrevive a cambios de empresa
  headline: string | null;
  source: ContactSource | null;
  last_touch_at: string | null;
  email_verified: boolean;
}

export interface Lead {
  id: string;
  company_id: string;
  contact_id: string | null;
  scan_id: string | null;
  stage: LeadStage;
  priority_score: number | null;
  discard_reason: string | null;
  updated_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  channel: MessageChannel;
  lang: string;
  draft: string;
  edited_final: string | null;
  sent_at: string | null;
  replied: boolean;
  created_at: string;
}

// Lead hidratado para el briefing (join de todas las tablas).
// company es opcional: un founder añadido desde LinkedIn puede no tener aún
// empresa/dominio (hasta entonces no se puede escanear su marca).
export interface BriefingLead {
  lead: Lead;
  company: Company | null;
  signal: Signal | null;
  scan: Scan | null;
  contact: Contact | null;
  message: Message | null;
}

// Etapas que se ofrecen en la UI. 'briefed' NO está: es un estado interno
// del pipeline nocturno (dossier preparado) que se muestra como 'Detectado'.
export const STAGES: { key: LeadStage; label: string }[] = [
  { key: 'detected', label: 'Detectado' },
  { key: 'contacted', label: 'Contactado' },
  { key: 'conversation', label: 'Conversación' },
  { key: 'call', label: 'Call' },
  { key: 'proposal', label: 'Propuesta' },
  { key: 'won', label: 'Cerrado' },
  { key: 'discarded', label: 'Descartado' },
];

// Etiqueta legible de cualquier etapa, incluidas las internas ('briefed' =
// dossier listo del pipeline → se cuenta como 'Detectado'; 'lost' = Perdido).
export function stageLabel(stage: LeadStage): string {
  if (stage === 'briefed') return 'Detectado';
  if (stage === 'lost') return 'Perdido';
  return STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export const DISCARD_REASONS = [
  'Fuera de ICP',
  'Marca ya resuelta',
  'Timing malo',
  'Sin LinkedIn del founder',
  'Otro',
] as const;

// ---------- LinkedIn: parsing manual, nunca automatizado ----------
// Extrae el handle canónico de una URL de perfil. Acepta las formas que
// Sergio copia del navegador. Devuelve null si no es un perfil.
export function parseLinkedInHandle(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (m) return decodeURIComponent(m[1]).toLowerCase();
  // Handle pelado: "sergiogarcia" o "@sergiogarcia"
  if (/^@?[a-z0-9\-_%]{3,100}$/i.test(raw)) return raw.replace(/^@/, '').toLowerCase();
  return null;
}

export function linkedInUrlFromHandle(handle: string): string {
  return `https://www.linkedin.com/in/${handle}`;
}

// "joaocurado" → ["joao", "curado"] si el prefijo es un nombre de pila
// conocido (prefijo más largo primero; el resto debe tener ≥4 letras para
// no partir apellidos tipo "jansen"). Si hay duda, no se parte.
function splitConcatenated(token: string): string[] {
  const t = token.toLowerCase();
  if (t.length < 7 || GIVEN_NAMES.has(t)) return [token];
  for (let i = Math.min(t.length - 4, 12); i >= 3; i--) {
    if (GIVEN_NAMES.has(t.slice(0, i))) return [t.slice(0, i), t.slice(i)];
  }
  return [token];
}

// "javier-palomino-fernandez-4b8a9" → "Javier Palomino Fernandez".
// Descarta los sufijos con dígitos que LinkedIn añade a los handles y
// parte nombres pegados sin guion ("manojphatak" → "Manoj Phatak").
export function humanizeHandle(handle: string): string {
  let parts = handle.split('-').filter((p) => p && !/\d/.test(p));
  if (parts.length === 1) parts = splitConcatenated(parts[0]);
  return (
    parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ') || handle
  );
}

// Nombre para mostrar: si lo guardado parece un handle (minúsculas con
// guiones, sin espacios), se humaniza. Si ya es un nombre, se respeta.
export function displayName(name: string | null | undefined): string {
  if (!name) return '';
  if (!name.includes(' ') && /^[a-z0-9%._-]+$/.test(name)) return humanizeHandle(name);
  return name;
}
