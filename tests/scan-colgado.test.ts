import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_COLGADO_MS, scanColgado } from '../lib/b3s-scan-storage';

// El caso real: Utopicum, Locomotive y Studiofreight se quedaron "running"
// el 26/09 y el 30/09 el botón seguía sin lanzar nada.
const ahora = Date.parse('2026-09-30T10:00:00Z');

test('un scan "running" de hace días está colgado', () => {
  assert.equal(scanColgado({ status: 'running', created_at: '2026-09-26T22:43:35Z' }, ahora), true);
  assert.equal(scanColgado({ status: 'queued', created_at: '2026-09-26T22:43:35Z' }, ahora), true);
  assert.equal(scanColgado({ status: 'blocked', created_at: '2026-09-26T22:43:35Z' }, ahora), true);
});

test('uno reciente sigue en marcha y bloquea el duplicado', () => {
  const hace = new Date(ahora - 5 * 60 * 1000).toISOString();
  assert.equal(scanColgado({ status: 'running', created_at: hace }, ahora), false);
  const casi = new Date(ahora - SCAN_COLGADO_MS + 60_000).toISOString();
  assert.equal(scanColgado({ status: 'running', created_at: casi }, ahora), false);
});

test('los terminados nunca están colgados', () => {
  for (const status of ['ready', 'failed', 'cancelled'] as const) {
    assert.equal(scanColgado({ status, created_at: '2026-09-01T00:00:00Z' }, ahora), false);
  }
});
