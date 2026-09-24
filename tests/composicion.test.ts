// La composición de un estudio editada por dos personas a la vez.
//
// El primer test es lo que pasó el 24/09 en el estudio de FLOC*, con sus
// marcas: Sergio añadió tres, Victor añadió ocho desde una pestaña vieja, y
// las tres de Sergio desaparecieron. Si ese test falla, ha vuelto el fallo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseSegura, faltanEnElEstudio, fusionaComposicion } from '../lib/composicion';
import type { Grupo } from '../lib/benchmark';

const g = (nombre: string, dominios: string[], ocultas?: string[]): Grupo => ({
  nombre,
  dominios,
  ...(ocultas?.length ? { ocultas } : {}),
});
const todas = (gs: Grupo[]) => gs.flatMap((x) => x.dominios).sort();

test('FLOC* 24/09: las altas de Sergio sobreviven a las de Victor', () => {
  // Lo que había cuando los dos abrieron el estudio.
  const base = [
    g('Nacional', ['mendesaltaren.com', 'solublestudio.com', 'morillas.com']),
    g('Internacional', ['movingbrands.com', 'gagarin.is']),
  ];
  // Sergio guarda primero: lo guardado pasa a tener sus tres.
  const deSergio = [
    g('Nacional', ['mendesaltaren.com', 'solublestudio.com', 'morillas.com', 'branng.com', 'wearefirma.com']),
    g('Internacional', ['movingbrands.com', 'gagarin.is', 'saffron-consultants.com']),
  ];
  const guardado = fusionaComposicion(base, deSergio, base);
  // Victor, desde su pestaña (que partió de `base`), añade las suyas.
  const deVictor = [
    g('Nacional', ['mendesaltaren.com', 'solublestudio.com', 'morillas.com']),
    g('Internacional', ['movingbrands.com', 'gagarin.is', 'pentagram.com', 'primary.studio', 'brink.ch']),
  ];
  const final = fusionaComposicion(base, deVictor, guardado);

  assert.deepEqual(final.find((x) => x.nombre === 'Nacional')?.dominios, [
    'mendesaltaren.com', 'solublestudio.com', 'morillas.com', 'branng.com', 'wearefirma.com',
  ]);
  const internacional = final.find((x) => x.nombre === 'Internacional')!.dominios;
  for (const d of ['saffron-consultants.com', 'pentagram.com', 'primary.studio', 'brink.ch']) {
    assert.ok(internacional.includes(d), `falta ${d}`);
  }
});

test('sin cambios de nadie, la fusión devuelve lo guardado tal cual', () => {
  const base = [g('A', ['a.com', 'b.com'], ['b.com']), g('B', ['c.com'])];
  assert.deepEqual(fusionaComposicion(base, base, base), base);
});

test('quitar una marca se respeta aunque el otro haya añadido otra', () => {
  const base = [g('A', ['a.com', 'b.com', 'c.com'])];
  const nuestra = [g('A', ['a.com', 'c.com'])]; // quito b
  const suya = [g('A', ['a.com', 'b.com', 'c.com', 'd.com'])]; // el otro añadió d
  assert.deepEqual(fusionaComposicion(base, nuestra, suya)[0].dominios, ['a.com', 'c.com', 'd.com']);
});

test('ocultar y mover de grupo se aplican sobre lo del otro', () => {
  const base = [g('A', ['a.com', 'b.com']), g('B', ['c.com'])];
  const nuestra = [g('A', ['a.com'], []), g('B', ['c.com', 'b.com'])]; // muevo b a B
  const suya = [g('A', ['a.com', 'b.com'], ['a.com']), g('B', ['c.com'])]; // el otro ocultó a
  const r = fusionaComposicion(base, nuestra, suya);
  assert.deepEqual(r.find((x) => x.nombre === 'A'), { nombre: 'A', dominios: ['a.com'], ocultas: ['a.com'] });
  assert.deepEqual(r.find((x) => x.nombre === 'B')?.dominios, ['c.com', 'b.com']);
});

test('reordenar se respeta, y lo nuevo del otro va al final', () => {
  const base = [g('A', ['a.com', 'b.com', 'c.com'])];
  const nuestra = [g('A', ['c.com', 'a.com', 'b.com'])]; // reordeno
  const suya = [g('A', ['a.com', 'b.com', 'c.com', 'd.com'])]; // el otro añade d
  assert.deepEqual(fusionaComposicion(base, nuestra, suya)[0].dominios, ['c.com', 'a.com', 'b.com', 'd.com']);
});

test('un grupo quitado mientras el otro le metía una marca se queda con esa marca', () => {
  const base = [g('A', ['a.com']), g('B', ['b.com'])];
  const nuestra = [g('A', ['a.com'])]; // quito el grupo B entero
  const suya = [g('A', ['a.com']), g('B', ['b.com', 'x.com'])]; // el otro metió x en B
  const r = fusionaComposicion(base, nuestra, suya);
  assert.deepEqual(r.find((x) => x.nombre === 'B')?.dominios, ['x.com']);
});

test('un grupo quitado sin marcas nuevas desaparece', () => {
  const base = [g('A', ['a.com']), g('B', ['b.com'])];
  const nuestra = [g('A', ['a.com'])];
  assert.deepEqual(fusionaComposicion(base, nuestra, base).map((x) => x.nombre), ['A']);
});

test('una pestaña vieja sin base puede añadir, pero no borrar', () => {
  const guardado = [g('A', ['a.com', 'b.com', 'c.com'])];
  const vieja = [g('A', ['a.com', 'x.com'])]; // no ve b ni c, y trae x
  const r = fusionaComposicion(baseSegura(vieja, guardado), vieja, guardado);
  assert.deepEqual(todas(r), ['a.com', 'b.com', 'c.com', 'x.com']);
});

test('una pestaña vieja sí puede ocultar lo que ve', () => {
  const guardado = [g('A', ['a.com', 'b.com'])];
  const vieja = [g('A', ['a.com', 'b.com'], ['a.com'])];
  const r = fusionaComposicion(baseSegura(vieja, guardado), vieja, guardado);
  assert.deepEqual(r[0].ocultas, ['a.com']);
});

test('el enlace viejo de Victor no trae nada que falte', () => {
  const guardado = [g('Nacional', ['mendesaltaren.com', 'branng.com']), g('Internacional', ['gagarin.is'])];
  const enlace = [g('Nacional', ['mendesaltaren.com']), g('Internacional', ['gagarin.is'])];
  assert.deepEqual(faltanEnElEstudio(enlace, guardado), []);
  const conNueva = [g('Nacional', ['mendesaltaren.com', 'nueva.com'])];
  assert.deepEqual(faltanEnElEstudio(conNueva, guardado), [{ grupo: 'Nacional', dominio: 'nueva.com' }]);
});
