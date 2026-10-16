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

import { mismaPersona } from '../lib/persona';

test('Finches: la misma fundadora con LinkedIn y solo por nombre se une en una', () => {
  const contactos = [
    { id: 'A', full_name: 'Catharina Van Delden', linkedin_handle: 'catharina-van-delden', linkedin_url: 'https://www.linkedin.com/in/catharina-van-delden' },
    { id: 'B', full_name: 'Catharina van Delden', linkedin_handle: null, linkedin_url: null },
  ];
  const [p, ...resto] = planDeUnion(
    [
      l('perfil', { contact_id: 'A', updated_at: '2026-10-15T19:53:46Z' }),
      l('lote', { contact_id: 'B', scan_id: 'scan', updated_at: '2026-10-16T09:00:32Z' }),
    ],
    contactos,
  );
  assert.equal(resto.length, 0);
  assert.equal(p.queda.id, 'lote'); // el más reciente, con el scan
  assert.equal(p.contactId, 'A'); // se queda el contacto con LinkedIn
  assert.deepEqual(p.contactosSobran, ['B']);
  assert.equal(p.scanId, 'scan');
});

test('misma persona: el LinkedIn manda; el nombre solo si falta un perfil', () => {
  assert.equal(mismaPersona({ full_name: 'Íñaki Ureta' }, { full_name: 'inaki ureta' }), true);
  assert.equal(mismaPersona({ full_name: 'Ana Gil', linkedin_handle: 'anagil' }, { full_name: 'Ana Gil', linkedin_handle: 'ana-gil-2' }), false);
  assert.equal(mismaPersona({ full_name: 'Fundador' }, { full_name: 'fundador' }), false);
  assert.equal(mismaPersona({ full_name: 'Erik Brieva' }, { full_name: 'Jordi Martín' }), false);
});

test('dos founders distintos de la misma marca siguen sin unirse', () => {
  const contactos = [
    { id: 'E', full_name: 'Erik Brieva', linkedin_handle: 'erikbrieva' },
    { id: 'J', full_name: 'Jordimartindelval', linkedin_handle: 'jordimartindelval' },
  ];
  assert.deepEqual(planDeUnion([l('1', { contact_id: 'E', stage: 'invited' }), l('2', { contact_id: 'J' })], contactos), []);
});
