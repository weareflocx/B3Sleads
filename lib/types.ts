// Tipos del modelo de datos (espejo de supabase/migrations/001_init.sql)

export type CompanySource = 'lusha_signal' | 'rss' | 'manual' | 'engaged';
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

export interface Company {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  hq_country: string | null;
  sector: string | null;
  source: CompanySource;
  created_at: string;
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

// Lead hidratado para el briefing (join de todas las tablas)
export interface BriefingLead {
  lead: Lead;
  company: Company;
  signal: Signal | null;
  scan: Scan | null;
  contact: Contact | null;
  message: Message | null;
}

export const STAGES: { key: LeadStage; label: string }[] = [
  { key: 'detected', label: 'Detectado' },
  { key: 'briefed', label: 'Briefed' },
  { key: 'contacted', label: 'Contactado' },
  { key: 'conversation', label: 'Conversación' },
  { key: 'call', label: 'Call' },
  { key: 'proposal', label: 'Propuesta' },
  { key: 'won', label: 'Cerrado' },
  { key: 'discarded', label: 'Descartado' },
];

export const DISCARD_REASONS = [
  'Fuera de ICP',
  'Marca ya resuelta',
  'Timing malo',
  'Otro',
] as const;
