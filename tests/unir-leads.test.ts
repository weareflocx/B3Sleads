import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDeUnion } from '../lib/unir-leads';
import type { Lead } from '../lib/types';

const l = (id: string, o: Partial<Lead> = {}): Lead =>
  ({ id, company_id: 'c', contact_id: null, scan_id: null, stage: 'detected', priority_score: null, discard_reason: null, updated_at: '2026-10-07T11:28:00Z', ...o }) as Lead;

test('Niubiq: el lead sin founder se une al del founder', () => {
  const [p, ...resto] = planDeUnion([
    l('rondas', { updated_at: '2026-10-07T11:28:03Z' }),
    l('founder', { contact_id: 'gonzalo', updated_at: '2026-10-07T11:29:38Z' }),
  ]);
  assert.equal(resto.length, 0);
  assert.equal(p.queda.id, 'founder');
  assert.deepEqual(p.sobran.map((x) => x.id), ['rondas']);
  assert.equal(p.stage, 'detected');
});

test('dos founders distintos no son duplicados', () => {
  assert.deepEqual(planDeUnion([l('a', { contact_id: 'ana' }), l('b', { contact_id: 'luis' })]), []);
});

test('se queda la etapa más avanzada y el scan que hubiera', () => {
  const [p] = planDeUnion([
    l('a', { contact_id: 'ana' }),
    l('b', { contact_id: 'ana', stage: 'contacted', scan_id: 's1', updated_at: '2026-09-01T00:00:00Z' }),
  ]);
  assert.equal(p.queda.id, 'b');
  assert.equal(p.stage, 'contacted');
  assert.equal(p.scanId, 's1');
});

test('un descarte no gana a una etapa viva', () => {
  const [p] = planDeUnion([l('a', { contact_id: 'ana', stage: 'discarded' }), l('b', { stage: 'invited' })]);
  assert.equal(p.queda.id, 'a');
  assert.equal(p.stage, 'invited');
});

test('sin ningún founder, se unen entre ellos', () => {
  const [p] = planDeUnion([l('a'), l('b', { stage: 'briefed' })]);
  assert.equal(p.queda.id, 'b');
  assert.equal(p.sobran.length, 1);
  assert.deepEqual(planDeUnion([l('solo')]), []);
});
