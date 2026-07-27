import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeRadar,
  decay,
  fitScore,
  scoreSignal,
  timingScore,
  RADAR_VERSION,
} from '../lib/radar';
import type { BriefingLead, Scan, Signal } from '../lib/types';

const NOW = new Date('2026-07-27T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function signal(type: string, days: number, extra: Record<string, unknown> = {}): Signal {
  return {
    id: `sg-${type}-${days}`,
    company_id: 'co-1',
    type: type as Signal['type'],
    detail: { occurred_at: daysAgo(days), evidence: 'evidencia de prueba', ...extra },
    // detected_at deliberadamente HOY: el decaimiento no debe usarlo.
    detected_at: NOW.toISOString(),
  };
}

function lead(score: number | null, status: Scan['status'] = 'ready'): BriefingLead {
  const scan =
    score === null && status === 'ready'
      ? null
      : ({ id: 'sc-1', company_id: 'co-1', status, score } as unknown as Scan);
  return {
    lead: { id: 'l-1', stage: 'detected', updated_at: NOW.toISOString() } as BriefingLead['lead'],
    company: { id: 'co-1', name: 'Demo', domain: 'demo.io' } as BriefingLead['company'],
    signal: null,
    signals: [],
    scan,
    contact: null,
    message: null,
  };
}

test('decay: escalones de la spec', () => {
  assert.equal(decay(0), 1.0);
  assert.equal(decay(45), 1.0);
  assert.equal(decay(46), 0.7);
  assert.equal(decay(90), 0.7);
  assert.equal(decay(91), 0.4);
  assert.equal(decay(180), 0.4);
  assert.equal(decay(181), 0.0);
  assert.equal(decay(1001), 0.0); // Arkadia Space
});

test('el decaimiento usa occurred_at, nunca detected_at', () => {
  // Ronda de hace 1001 días registrada HOY: no puede parecer fresca.
  const vieja = scoreSignal(signal('ronda', 1001), NOW);
  assert.equal(vieja?.days, 1001, 'los días se cuentan desde occurred_at, no desde detected_at');
  assert.equal(vieja?.value, 0, 'una señal caducada vale 0 y no entra en el timing');
  assert.equal(timingScore([signal('ronda', 1001)], NOW).timing, null);
  const fresca = scoreSignal(signal('ronda', 10), NOW);
  assert.equal(fresca?.value, 3, 'ronda fresca = peso 3 × 1.0');
});

test('una señal sin evidencia o sin occurred_at no vale', () => {
  const sinEvidencia: Signal = {
    ...signal('rebranding_declarado', 5),
    detail: { occurred_at: daysAgo(5) },
  };
  assert.equal(scoreSignal(sinEvidencia, NOW), null);
  const sinFecha: Signal = {
    ...signal('rebranding_declarado', 5),
    detail: { evidence: 'dijo algo' },
  };
  assert.equal(scoreSignal(sinFecha, NOW), null);
});

test('timing es el MÁXIMO, no la suma', () => {
  // Cinco señales débiles no pueden superar a una intención declarada.
  const debiles = [
    signal('ronda', 5),
    signal('crecimiento_plantilla', 5),
    signal('ronda', 10),
    signal('crecimiento_plantilla', 12),
    signal('ronda', 20),
  ];
  const { timing: soloDebiles } = timingScore(debiles, NOW);
  assert.equal(soloDebiles, 3, 'cinco señales de peso 3 siguen valiendo 3');

  const conIntencion = timingScore([...debiles, signal('rebranding_declarado', 5)], NOW);
  assert.equal(conIntencion.timing, 10);
  assert.equal(conIntencion.best?.type, 'rebranding_declarado');
});

test('sin señales el radar es NULL y el lead va a reserva (nunca un número por defecto)', () => {
  const r = computeRadar(lead(40), [], NOW);
  assert.equal(r.score, null, 'radar_score debe ser null, no 0 ni 35');
  assert.equal(r.timing, null);
  assert.equal(r.state, 'reserva');
  assert.equal(r.best, null);
});

test('scan fallido o score 0 → fit NULL y no_escaneable, nunca fit 0', () => {
  assert.equal(fitScore(lead(0)), null, 'un 0 no es oportunidad máxima, es un scan que no leyó nada');
  assert.equal(fitScore(lead(50, 'failed')), null);
  assert.equal(computeRadar(lead(0), [signal('rebranding_declarado', 1)], NOW).state, 'no_escaneable');
  assert.equal(computeRadar(lead(0), [signal('rebranding_declarado', 1)], NOW).score, null);
});

test('radar es multiplicativo: timing cero es prioridad cero', () => {
  // Fit excelente pero señal caducada: no puede flotar hasta arriba.
  const caducado = computeRadar(lead(20), [signal('ronda', 400)], NOW);
  assert.equal(caducado.state, 'reserva');
  assert.equal(caducado.score, null);
});

test('caso Ticketeame: la intención declarada manda sobre la ronda', () => {
  const ticketeame = computeRadar(
    lead(45),
    [signal('rebranding_declarado', 3, { evidence: 'estamos planteando un rebranding' })],
    NOW,
  );
  const conRonda = computeRadar(lead(45), [signal('ronda', 3)], NOW);
  assert.equal(ticketeame.state, 'activo');
  assert.ok(
    (ticketeame.score ?? 0) > (conRonda.score ?? 0),
    'rebranding declarado debe puntuar por encima de una ronda del mismo día',
  );
  assert.equal(ticketeame.version, RADAR_VERSION);
  // El número no existe sin la evidencia que lo sostiene.
  assert.ok(ticketeame.best?.evidence);
  assert.ok(ticketeame.best?.occurredAt);
});

test('el radar activo siempre trae la señal que lo sostiene', () => {
  const r = computeRadar(lead(60), [signal('oferta_empleo_marca', 12)], NOW);
  assert.equal(r.state, 'activo');
  assert.ok(r.score != null && r.score > 0);
  assert.ok(r.best != null && r.best.evidence != null && r.best.occurredAt != null);
});
