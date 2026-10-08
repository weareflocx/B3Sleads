import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAUSA_NO_ACEPTA, diasDesdeInvitacion, fechaInvitacion, invitacion, invitacionesPendientes, nivelInvitacion, vuelvenAlRadar } from '../lib/invitacion';
import { resumen, seguimientos } from '../lib/briefing';
import type { BriefingLead, Lead, Signal } from '../lib/types';

const lead = (o: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36).slice(2), company_id: 'c', contact_id: null, scan_id: null, stage: 'invited', priority_score: null, discard_reason: null, updated_at: '2026-10-01T10:00:00Z', ...o }) as Lead;
const bl = (l: Lead, signals: Partial<Signal>[] = []): BriefingLead =>
  ({ lead: l, company: { id: 'c', domain: 'acme.io', name: 'Acme' }, signal: null, signals: signals.map((x) => ({ id: 's', company_id: 'c', type: 'funding_round', detail: {}, ...x })), scan: null, contact: null, message: null }) as unknown as BriefingLead;

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
  const f = resumen({ cola: 2, novedades: 0, seguimientos: 0, caducan: 0, conectados: 1, invitaciones: 3, vuelven: 1 });
  assert.equal(f, '1 founder aceptó tu invitación y espera el mensaje, 2 leads con señal viva, 3 invitaciones por revisar, 1 marca que no aceptó vuelve al radar.');
  assert.equal(resumen({ cola: 0, novedades: 0, seguimientos: 0, caducan: 0 }).startsWith('Día tranquilo'), true);
});

test('avisos: a los 7 días mirar, a los 14 otra vía, a los 21 retirar', () => {
  assert.equal(nivelInvitacion(6), 'reciente');
  assert.equal(nivelInvitacion(7), 'revisar');
  assert.equal(nivelInvitacion(14), 'otra_via');
  assert.equal(nivelInvitacion(21), 'retirar');
  assert.equal(invitacion(bl(lead({ invited_at: '2026-10-05T09:00:00Z' })), HOY).activa, false);
  assert.equal(invitacion(bl(lead({ invited_at: '2026-09-30T09:00:00Z' })), HOY).activa, true);
});

test('"Sigue pendiente" calla el aviso una semana y luego vuelve', () => {
  const revisada = (check: string) => invitacion(bl(lead({ invited_at: '2026-09-20T09:00:00Z', invite_checked_at: check })), HOY);
  assert.equal(revisada('2026-10-06T09:00:00Z').activa, false);
  assert.equal(revisada('2026-10-06T09:00:00Z').revisadaHace, 2);
  assert.equal(revisada('2026-09-30T09:00:00Z').activa, true);
});

test('vuelven al radar: pausados por no aceptar con una señal posterior a la pausa', () => {
  const pausado = (o: Partial<Lead>) => lead({ stage: 'paused', discard_reason: PAUSA_NO_ACEPTA, paused_at: '2026-09-15T09:00:00Z', updated_at: '2026-10-07T09:00:00Z', ...o });
  const r = vuelvenAlRadar([
    bl(pausado({}), [{ detected_at: '2026-10-01T09:00:00Z' }]), // señal nueva: vuelve
    bl(pausado({}), [{ detected_at: '2026-09-01T09:00:00Z' }]), // señal de antes de la pausa
    bl(pausado({ discard_reason: 'Timing malo' }), [{ detected_at: '2026-10-01T09:00:00Z' }]), // otra pausa
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].signal.detected_at, '2026-10-01T09:00:00Z');
});
