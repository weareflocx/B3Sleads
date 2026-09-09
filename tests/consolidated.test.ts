// Tests de la consolidación por componente. El crítico es el primero: sin
// selecciones manuales, el consolidado ES el automático, exacto (criterio #9
// de la spec). Si eso se rompe, los dos números dejan de ser comparables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateReport, consolidatedScore } from '../lib/consolidated';
import type { ScanDimension } from '../lib/scan-report';
import type { Scan } from '../lib/types';

function dim(name: string, score: number | null, max = 10, missing = false): ScanDimension {
  return {
    name,
    score,
    max,
    ratio: score != null && max ? score / max : missing ? 0 : null,
    verdict: null,
    reading: null,
    analysis: null,
    todos: [],
    missing,
  };
}

const AUTO: ScanDimension[] = [
  dim('Propósito', 6),
  dim('Magnetismo', 6),
  dim('Misión', null, 5, true), // no detectada en el último run
  dim('Valores', 5, 5),
];

test('sin selecciones manuales, consolidado === automático (criterio #9)', () => {
  const out = consolidateReport(AUTO, [], [], 'scan-a');
  assert.equal(out.manualCount, 0);
  assert.deepEqual(out.dimensions, AUTO);
  assert.equal(consolidatedScore(66, AUTO, out.dimensions), 66);
});

// Los puntos ya llegan pesados desde el informe: Magnetismo y Coherencia
// valen 20 y el resto 10, y el score global es su suma exacta. Por eso el
// consolidado es un delta de puntos sin volver a ponderar nada.
test('curar una dimensión aplica su delta de puntos, sin volver a pesar', () => {
  // La misión pasa de no detectada (0) a 5/5: +5 puntos.
  const consolidated = AUTO.map((d) => (d.name === 'Misión' ? dim('Misión', 5, 5) : d));
  assert.equal(consolidatedScore(66, AUTO, consolidated), 71);
});

test('Magnetismo suma sus puntos sobre 20 y el resultado se acota a 0-100', () => {
  const base = AUTO.map((d) => (d.name === 'Magnetismo' ? dim('Magnetismo', 12, 20) : d));
  const consolidated = base.map((d) => (d.name === 'Magnetismo' ? dim('Magnetismo', 18, 20) : d));
  assert.equal(consolidatedScore(66, base, consolidated), 72); // 66 + (18-12)
  const maxed = base.map((d) => (d.name === 'Magnetismo' ? dim('Magnetismo', 20, 20) : d));
  assert.equal(consolidatedScore(98, base, maxed), 100); // nunca por encima de 100
});

test('una selección a un scan inexistente cae al automático sin romper', () => {
  const sel = [
    {
      dimension: 'mission',
      scan_id: 'scan-que-no-existe',
      is_manual: true,
      selected_by_email: null,
      note: null,
      selected_at: '2026-07-28',
    },
  ];
  const out = consolidateReport(AUTO, sel, [] as Scan[], 'scan-a');
  assert.equal(out.manualCount, 0); // no se aplicó nada
  assert.deepEqual(out.dimensions, AUTO);
});
