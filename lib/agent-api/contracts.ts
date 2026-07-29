import type { LeadStage, NoteKind } from '@/lib/types';
import { AgentApiError } from './errors';

export const API_LEAD_STAGES: LeadStage[] = [
  'detected',
  'briefed',
  'contacted',
  'conversation',
  'call',
  'proposal',
  'paused',
  'won',
  'lost',
  'discarded',
];

export interface LeadListQuery {
  limit: number;
  offset: number;
  stages: LeadStage[];
  ownerEmail?: string;
  hasLinkedIn?: boolean;
  q?: string;
}

export interface LeadPatch {
  stage?: LeadStage;
  discardReason?: string;
  ownerEmail?: string | null;
}

export interface CompatibleLeadListQuery {
  state?: 'activo' | 'reserva' | 'no_escaneable';
  stage?: LeadStage;
  limit: number;
  offset: number;
}

export interface LeadCreateInput {
  linkedin?: string;
  name?: string;
  domain?: string;
  note?: string;
}

export interface CompatibleNoteInput {
  domain?: string;
  leadId?: string;
  body: string;
  kind: NoteKind;
}

export interface SignalInput {
  domain: string;
  type: string;
  occurredAt: string;
  evidence: string;
  sourceUrl?: string;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentApiError(400, 'invalid_json', 'El body debe ser un objeto JSON.');
  }
  return value as Record<string, unknown>;
};

const boundedInteger = (
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number => {
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AgentApiError(400, 'invalid_query', `${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
};

export function parseLeadListQuery(request: Request): LeadListQuery {
  const params = new URL(request.url).searchParams;
  const stages = (params.get('stage') ?? '')
    .split(',')
    .map((stage) => stage.trim())
    .filter(Boolean);

  const invalidStage = stages.find((stage) => !API_LEAD_STAGES.includes(stage as LeadStage));
  if (invalidStage) {
    throw new AgentApiError(400, 'invalid_stage', `Etapa desconocida: ${invalidStage}.`, {
      allowed: API_LEAD_STAGES,
    });
  }

  const hasLinkedInRaw = params.get('has_linkedin');
  if (hasLinkedInRaw && !['true', 'false'].includes(hasLinkedInRaw)) {
    throw new AgentApiError(
      400,
      'invalid_query',
      'has_linkedin debe ser true o false.',
    );
  }

  const q = params.get('q')?.trim();
  if (q && q.length > 100) {
    throw new AgentApiError(400, 'invalid_query', 'q no puede superar 100 caracteres.');
  }

  return {
    limit: boundedInteger(params.get('limit'), 20, 1, 100, 'limit'),
    offset: boundedInteger(params.get('offset'), 0, 0, 100_000, 'offset'),
    stages: stages as LeadStage[],
    ownerEmail: params.get('owner_email')?.trim().toLowerCase() || undefined,
    hasLinkedIn: hasLinkedInRaw ? hasLinkedInRaw === 'true' : undefined,
    q: q || undefined,
  };
}

export function parseCompatibleLeadListQuery(request: Request): CompatibleLeadListQuery {
  const params = new URL(request.url).searchParams;
  const state = params.get('state')?.trim();
  if (state && !['activo', 'reserva', 'no_escaneable'].includes(state)) {
    throw new AgentApiError(400, 'invalid_state', `Estado de radar desconocido: ${state}.`, {
      allowed: ['activo', 'reserva', 'no_escaneable'],
    });
  }
  const stage = params.get('stage')?.trim();
  if (stage && !API_LEAD_STAGES.includes(stage as LeadStage)) {
    throw new AgentApiError(400, 'invalid_stage', `Etapa desconocida: ${stage}.`, {
      allowed: API_LEAD_STAGES,
    });
  }
  return {
    state: state as CompatibleLeadListQuery['state'],
    stage: stage as LeadStage | undefined,
    limit: boundedInteger(params.get('limit'), 200, 1, 500, 'limit'),
    offset: boundedInteger(params.get('offset'), 0, 0, 100_000, 'offset'),
  };
}

export function parseLeadCreate(value: unknown): LeadCreateInput {
  const body = record(value);
  const text = (name: string, max: number): string | undefined => {
    if (!(name in body) || body[name] == null || body[name] === '') return undefined;
    if (typeof body[name] !== 'string') {
      throw new AgentApiError(422, 'invalid_field', `${name} debe ser texto.`);
    }
    const result = body[name].trim();
    if (result.length > max) {
      throw new AgentApiError(422, 'invalid_field', `${name} no puede superar ${max} caracteres.`);
    }
    return result || undefined;
  };
  const result = {
    linkedin: text('linkedin', 500),
    name: text('name', 200),
    domain: text('domain', 253),
    note: text('note', 5_000),
  };
  if (!result.linkedin && !result.domain) {
    throw new AgentApiError(422, 'lead_identity_required', 'linkedin o domain son obligatorios.');
  }
  return result;
}

export function parseLeadPatch(value: unknown): LeadPatch {
  const body = record(value);
  const result: LeadPatch = {};

  if ('stage' in body) {
    if (typeof body.stage !== 'string' || !API_LEAD_STAGES.includes(body.stage as LeadStage)) {
      throw new AgentApiError(422, 'invalid_stage', 'La etapa no es válida.', {
        allowed: API_LEAD_STAGES,
      });
    }
    result.stage = body.stage as LeadStage;
  }

  if ('discard_reason' in body) {
    if (body.discard_reason != null && typeof body.discard_reason !== 'string') {
      throw new AgentApiError(422, 'invalid_discard_reason', 'discard_reason debe ser texto.');
    }
    result.discardReason =
      typeof body.discard_reason === 'string' ? body.discard_reason.trim() : undefined;
  }
  if ('discardReason' in body && !('discard_reason' in body)) {
    if (body.discardReason != null && typeof body.discardReason !== 'string') {
      throw new AgentApiError(422, 'invalid_discard_reason', 'discardReason debe ser texto.');
    }
    result.discardReason =
      typeof body.discardReason === 'string' ? body.discardReason.trim() : undefined;
  }

  if ('owner_email' in body) {
    if (body.owner_email !== null && typeof body.owner_email !== 'string') {
      throw new AgentApiError(422, 'invalid_owner_email', 'owner_email debe ser texto o null.');
    }
    const email = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AgentApiError(422, 'invalid_owner_email', 'owner_email no parece un email válido.');
    }
    result.ownerEmail = email || null;
  }

  if (result.stage === 'discarded' && !result.discardReason) {
    throw new AgentApiError(
      422,
      'discard_reason_required',
      'Descartar un lead exige discard_reason.',
    );
  }
  if (result.stage !== 'discarded' && result.discardReason) {
    throw new AgentApiError(
      422,
      'discard_reason_not_allowed',
      'discard_reason solo se acepta al mover el lead a discarded.',
    );
  }
  if (result.stage === undefined && result.ownerEmail === undefined) {
    throw new AgentApiError(
      422,
      'empty_update',
      'Incluye al menos stage u owner_email.',
    );
  }

  return result;
}

export function parseNoteInput(value: unknown): { body: string; kind: NoteKind } {
  const body = record(value);
  if (typeof body.body !== 'string' || !body.body.trim()) {
    throw new AgentApiError(422, 'note_body_required', 'body es obligatorio.');
  }
  const text = body.body.trim();
  if (text.length > 10_000) {
    throw new AgentApiError(422, 'note_too_long', 'body no puede superar 10.000 caracteres.');
  }
  const kind = body.kind ?? 'note';
  if (!['note', 'call_report', 'insight'].includes(String(kind))) {
    throw new AgentApiError(422, 'invalid_note_kind', 'kind debe ser note, call_report o insight.');
  }
  return { body: text, kind: kind as NoteKind };
}

export function parseCompatibleNoteInput(value: unknown): CompatibleNoteInput {
  const raw = record(value);
  const note = parseNoteInput(raw);
  const domain = typeof raw.domain === 'string' ? raw.domain.trim() : '';
  const leadId = typeof raw.leadId === 'string' ? raw.leadId.trim() : '';
  if (!domain && !leadId) {
    throw new AgentApiError(422, 'note_target_required', 'domain o leadId son obligatorios.');
  }
  if (domain.length > 253 || leadId.length > 200) {
    throw new AgentApiError(422, 'invalid_note_target', 'El destino de la nota no es válido.');
  }
  return { ...note, domain: domain || undefined, leadId: leadId || undefined };
}

export function parseSignalInput(value: unknown): SignalInput {
  const raw = record(value);
  const domain = typeof raw.domain === 'string' ? raw.domain.trim() : '';
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  const occurredAt = typeof raw.occurredAt === 'string' ? raw.occurredAt.trim() : '';
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
  const sourceUrl = typeof raw.sourceUrl === 'string' ? raw.sourceUrl.trim() : '';
  if (!domain || domain.length > 253) {
    throw new AgentApiError(422, 'domain_required', 'domain es obligatorio.');
  }
  if (!type || type.length > 100) {
    throw new AgentApiError(422, 'signal_type_required', 'type es obligatorio.');
  }
  const parsedDate = new Date(`${occurredAt}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredAt) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== occurredAt
  ) {
    throw new AgentApiError(422, 'invalid_occurred_at', 'occurredAt debe ser una fecha YYYY-MM-DD.');
  }
  if (evidence.length < 3 || evidence.length > 10_000) {
    throw new AgentApiError(422, 'invalid_evidence', 'evidence debe tener entre 3 y 10.000 caracteres.');
  }
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new AgentApiError(422, 'invalid_source_url', 'sourceUrl debe ser una URL HTTP(S).');
    }
  }
  return { domain, type, occurredAt, evidence, sourceUrl: sourceUrl || undefined };
}

export function parseScanInput(value: unknown): { leadId?: string } {
  const body = record(value);
  if ('lead_id' in body && typeof body.lead_id !== 'string') {
    throw new AgentApiError(422, 'invalid_lead_id', 'lead_id debe ser texto.');
  }
  const leadId = typeof body.lead_id === 'string' ? body.lead_id.trim() : '';
  if ('lead_id' in body && !leadId) {
    throw new AgentApiError(422, 'invalid_lead_id', 'lead_id no puede estar vacío.');
  }
  return { leadId: leadId || undefined };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AgentApiError(400, 'invalid_json', 'El body no contiene JSON válido.');
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[a-zA-Z0-9._:-]{8,200}$/.test(key)) {
    throw new AgentApiError(
      400,
      'idempotency_key_required',
      'Incluye Idempotency-Key con entre 8 y 200 caracteres seguros.',
    );
  }
  return key;
}

export function optionalIdempotencyKey(request: Request): string | undefined {
  if (!request.headers.get('idempotency-key')?.trim()) return undefined;
  return requireIdempotencyKey(request);
}
