import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparaPorAnuncio, pasaFiltroRonda, senalDeRonda } from '../lib/senal-ronda';
import type { Signal } from '../lib/types';

const s = (o: Partial<Signal> & { detail?: Record<string, unknown> }): Signal =>
  ({ id: Math.random().toString(36).slice(2), company_id: 'c', type: 'funding_round', detail: {}, detected_at: '2026-09-01T00:00:00Z', ...o }) as Signal;

test('sin señales de ronda no hay señal: la empresa se ve igual que hoy', () => {
  assert.equal(senalDeRonda([]), null);
  assert.equal(senalDeRonda(null), null);
  assert.equal(senalDeRonda([s({ type: 'hiring' })]), null);
});

test('una ronda cerrada es "detectada", con importe, fecha y fuente', () => {
  const r = senalDeRonda([s({ detail: { amount: '2M€', source_url: 'https://x.com/n', date: '2026-09-20' }, detected_at: '2026-09-22T00:00:00Z' })]);
  assert.equal(r?.tipo, 'detectada');
  assert.equal(r?.importe, '2M€');
  assert.equal(r?.fecha, '2026-09-20');
  assert.equal(r?.fuente, 'https://x.com/n');
});

test('levantar una ronda después de cerrar otra manda: "buscando", con el objetivo', () => {
  const r = senalDeRonda([
    s({ detail: { amount: '1M€' }, detected_at: '2026-03-01T00:00:00Z' }),
    s({ type: 'levantando_ronda', detail: { target_amount: '5M€', occurred_at: '2026-09-25T00:00:00Z', manual: true } }),
  ]);
  assert.equal(r?.tipo, 'buscando');
  assert.equal(r?.importe, '5M€');
  assert.equal(r?.confirmada, true);
});

test('confirmación: lo dicho manda; si no, a mano = confirmada y automático = sin confirmar', () => {
  assert.equal(senalDeRonda([s({ detail: { manual: true } })])?.confirmada, true);
  assert.equal(senalDeRonda([s({ detail: { source: 'lote' } })])?.confirmada, false);
  assert.equal(senalDeRonda([s({ detail: { manual: true, confirmada: false } })])?.confirmada, false);
  assert.equal(senalDeRonda([s({ detail: { confirmada: true } })])?.confirmada, true);
});

test('una fuente que no es URL no se enlaza', () => {
  assert.equal(senalDeRonda([s({ detail: { source_url: 'TechCrunch' } })])?.fuente, null);
});

test('filtro y orden por fecha del anuncio', () => {
  const det = senalDeRonda([s({ detail: { date: '2026-09-10' } })]);
  const bus = senalDeRonda([s({ type: 'levantando_ronda', detail: { occurred_at: '2026-09-20' } })]);
  assert.equal(pasaFiltroRonda(det, 'detectada'), true);
  assert.equal(pasaFiltroRonda(det, 'buscando'), false);
  assert.equal(pasaFiltroRonda(null, 'ninguna'), true);
  assert.equal(pasaFiltroRonda(bus, 'todas'), true);
  assert.deepEqual([null, det, bus].sort(comparaPorAnuncio), [bus, det, null]);
});
