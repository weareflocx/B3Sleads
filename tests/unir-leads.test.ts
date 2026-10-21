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

// mismaPersona no es transitiva: un contacto sin LinkedIn con el nombre de dos
// perfiles distintos es "la misma persona" que los dos, pero los dos no son la
// misma entre sí. No se sabe de cuál es: se queda aparte y no junta a nadie.
const permutaciones = <T>(xs: T[]): T[][] =>
  xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((resto) => [x, ...resto]));

const ANA_PERFIL = { id: 'A', full_name: 'Ana Gil', linkedin_handle: 'ana-gil', linkedin_url: 'https://www.linkedin.com/in/ana-gil' };
const ANA_PERFIL_2 = { id: 'B', full_name: 'Ana Gil', linkedin_handle: 'ana-gil-2', linkedin_url: 'https://www.linkedin.com/in/ana-gil-2' };
const ANA_SIN_PERFIL = { id: 'S', full_name: 'ana  GIL', linkedin_handle: null, linkedin_url: null };

// Un plan junta los dos perfiles si entre sus leads hay uno de ana-gil (A) y
// otro de ana-gil-2 (B).
const juntaLosDosPerfiles = (planes: ReturnType<typeof planDeUnion>) =>
  planes.some((p) => {
    const contactos = [p.queda, ...p.sobran].map((x) => x.contact_id);
    return contactos.includes('A') && contactos.includes('B');
  });

test('dos perfiles homónimos y un contacto sin perfil con su nombre: ningún plan junta los perfiles, esté donde esté en la lista', () => {
  const leads = [l('la', { contact_id: 'A' }), l('lb', { contact_id: 'B' }), l('ls', { contact_id: 'S' })];
  const ordenes = permutaciones([ANA_PERFIL, ANA_PERFIL_2, ANA_SIN_PERFIL]);
  assert.equal(ordenes.length, 6);
  for (const contactos of ordenes) {
    const orden = contactos.map((c) => c.id).join(', ');
    const planes = planDeUnion(leads, contactos);
    assert.equal(juntaLosDosPerfiles(planes), false, `junta los dos perfiles con los contactos en el orden ${orden}`);
    // Y el sin perfil, que no sabe de quién es, no se une a ninguno.
    assert.deepEqual(planes, [], `con los contactos en el orden ${orden}`);
  }
});

test('dos contactos sin perfil con el nombre de dos perfiles tampoco se juntan entre sí ni con ningún perfil', () => {
  const otro = { id: 'T', full_name: 'Ana Gil', linkedin_handle: null, linkedin_url: null };
  const leads = [l('la', { contact_id: 'A' }), l('lb', { contact_id: 'B' }), l('ls', { contact_id: 'S' }), l('lt', { contact_id: 'T' })];
  for (const contactos of permutaciones([ANA_PERFIL, ANA_PERFIL_2, ANA_SIN_PERFIL, otro])) {
    assert.deepEqual(planDeUnion(leads, contactos), [], `con los contactos en el orden ${contactos.map((c) => c.id).join(', ')}`);
  }
});

test('Finches con el contacto sin perfil primero: se une igual', () => {
  const contactos = [
    { id: 'B', full_name: 'Catharina van Delden', linkedin_handle: null, linkedin_url: null },
    { id: 'A', full_name: 'Catharina Van Delden', linkedin_handle: 'catharina-van-delden', linkedin_url: 'https://www.linkedin.com/in/catharina-van-delden' },
  ];
  const [p, ...resto] = planDeUnion(
    [
      l('perfil', { contact_id: 'A', updated_at: '2026-10-15T19:53:46Z' }),
      l('lote', { contact_id: 'B', scan_id: 'scan', updated_at: '2026-10-16T09:00:32Z' }),
    ],
    contactos,
  );
  assert.equal(resto.length, 0);
  assert.equal(p.queda.id, 'lote');
  assert.equal(p.contactId, 'A');
  assert.deepEqual(p.contactosSobran, ['B']);
  assert.equal(p.scanId, 'scan');
});

test('dos contactos sin perfil con el mismo nombre, que no es el de ningún perfil, siguen siendo la misma persona', () => {
  const luis1 = { id: 'L1', full_name: 'Luis Pons', linkedin_handle: null, linkedin_url: null };
  const luis2 = { id: 'L2', full_name: 'luis  PONS', linkedin_handle: null, linkedin_url: null };
  const marta = { id: 'M', full_name: 'Marta Ruiz', linkedin_handle: 'marta-ruiz', linkedin_url: 'https://www.linkedin.com/in/marta-ruiz' };
  const leads = [l('l1', { contact_id: 'L1' }), l('l2', { contact_id: 'L2' }), l('lm', { contact_id: 'M' })];
  const [p, ...resto] = planDeUnion(leads, [luis1, luis2, marta]);
  assert.equal(resto.length, 0);
  assert.equal(p.queda.id, 'l1');
  assert.deepEqual(p.sobran.map((x) => x.id), ['l2']);
  assert.equal(p.contactId, 'L1');
  assert.deepEqual(p.contactosSobran, ['L2']);
  // El orden de los contactos no cambia nada.
  assert.deepEqual(planDeUnion(leads, [marta, luis2, luis1]), [p]);
});
