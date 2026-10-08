import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasDesdeInvitacion, fechaInvitacion, invitacionesPendientes } from '../lib/invitacion';
import { resumen, seguimientos } from '../lib/briefing';
import type { BriefingLead, Lead } from '../lib/types';

const lead = (o: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36).slice(2), company_id: 'c', contact_id: null, scan_id: null, stage: 'invited', priority_score: null, discard_reason: null, updated_at: '2026-10-01T10:00:00Z', ...o }) as Lead;
const bl = (l: Lead): BriefingLead =>
  ({ lead: l, company: { id: 'c', domain: 'acme.io', name: 'Acme' }, signal: null, signals: [], scan: null, contact: null, message: null }) as unknown as BriefingLead;

const HOY = new Date('2026-10-08T12:00:00Z');

test('la fecha de la invitación es invited_at; sin migración, updated_at', () => {
  assert.equal(fechaInvitacion(lead({ invited_at: '2026-09-30T09:00:00Z' })), '2026-09-30T09:00:00Z');
  assert.equal(fechaInvitacion(lead({})), '2026-10-01T10:00:00Z');
  assert.equal(diasDesdeInvitacion(lead({ invited_at: '2026-09-30T09:00:00Z' }), HOY), 8);
});

test('una nota o un scan que mueven updated_at no reinician la cuenta', () => {
  const l = lead({ invited_at: '2026-09-24T09:00:00Z', updated_at: '2026-10-08T09:00:00Z' });
  assert.equal(diasDesdeInvitacion(l, HOY), 14);
});

test('pendientes: solo las invitadas, la más antigua primero', () => {
  const r = invitacionesPendientes(
    [
      bl(lead({ invited_at: '2026-10-07T09:00:00Z' })),
      bl(lead({ stage: 'connected', invited_at: '2026-09-01T09:00:00Z' })),
      bl(lead({ invited_at: '2026-09-28T09:00:00Z' })),
      bl(lead({ stage: 'detected' })),
    ],
    HOY,
  );
  assert.deepEqual(r.map((x) => x.days), [10, 1]);
});

test('invitar no dispara el seguimiento de "contactado sin respuesta"', () => {
  const r = seguimientos([bl(lead({ invited_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' }))], HOY);
  assert.equal(r.length, 0);
});

test('la frase del día abre con quien aceptó y cuenta las invitaciones', () => {
  const f = resumen({ cola: 2, novedades: 0, seguimientos: 0, caducan: 0, conectados: 1, invitaciones: 3 });
  assert.equal(f, '1 founder aceptó tu invitación y espera el mensaje, 2 leads con señal viva, 3 invitaciones pendientes.');
  assert.equal(resumen({ cola: 0, novedades: 0, seguimientos: 0, caducan: 0 }).startsWith('Día tranquilo'), true);
});
