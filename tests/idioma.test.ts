import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idiomaDePais } from '../lib/idioma';

test('España y la Latinoamérica hispana, en español', () => {
  for (const p of ['Spain', 'España', 'ES', 'Madrid, Spain', 'Mexico', 'México', 'Argentina', 'Costa Rica', 'República Dominicana', 'El Salvador', 'CL'])
    assert.equal(idiomaDePais(p), 'es', p);
});

test('los países que acaban en "es" ya no salen en español', () => {
  for (const p of ['United States', 'Wales', 'Philippines', 'United Arab Emirates', 'Netherlands', 'Seychelles'])
    assert.equal(idiomaDePais(p), 'en', p);
});

test('sin país o con otro, inglés', () => {
  for (const p of [null, undefined, '', 'Germany', 'France', 'Portugal', 'US', 'UK'])
    assert.equal(idiomaDePais(p as string | null), 'en', String(p));
});
