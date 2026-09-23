// El histórico de scans con pasadas SIN nota.
//
// Dos pasadas seguidas retenidas es un estado normal del Scanner: le pasó a
// FLOC*. El sparkline solo puede dibujar lo que tiene número, pero calculaba
// sus extremos siempre, así que con cero notas leía `pts[-1]` y tiraba la
// ficha entera con un error de servidor. La lista, que es lo útil de esta
// caja, ni siquiera llegaba a pintarse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreHistory } from '../app/(dashboard)/companies/[domain]/score-history';
import type { Scan } from '../lib/types';

function scan(id: string, score: number | null, dia: number, bruta?: number): Scan {
  return {
    id,
    company_id: 'c1',
    scanner_job_id: `job-${id}`,
    status: 'ready',
    score,
    tldr: null,
    evidence: null,
    // Una pasada retenida lleva su nota bruta dentro, sin publicar.
    result_raw:
      score == null && bruta != null
        ? { score: { value: null, raw_value: bruta, retention_reason: 'acquisition_regression' } }
        : null,
    ui_url: `https://b3s.fly.dev/report/${id}`,
    created_at: `2026-09-${String(dia).padStart(2, '0')}T10:00:00.000Z`,
    completed_at: null,
  };
}

test('dos pasadas retenidas y ninguna con nota: se pinta la lista, no se cae', () => {
  const html = renderToStaticMarkup(
    <ScoreHistory scans={[scan('a', null, 22, 62), scan('b', null, 23, 73)]} />,
  );
  assert.match(html, /Histórico de scans \(2\)/);
  assert.match(html, /2 retenidos/);
  // Las dos lecturas brutas se ven, que es para lo que sirve la caja.
  assert.match(html, />62</);
  assert.match(html, />73</);
  // Sin notas no hay evolución: ni línea ni delta inventado.
  assert.doesNotMatch(html, /<svg/);
});

test('una sola pasada, y retenida, tampoco rompe', () => {
  const html = renderToStaticMarkup(<ScoreHistory scans={[scan('a', null, 23, 62)]} />);
  assert.match(html, /Histórico de scans \(1\)/);
  assert.match(html, /1 retenido/);
  assert.doesNotMatch(html, /<svg/);
});

test('con notas se dibuja la evolución y el delta', () => {
  const html = renderToStaticMarkup(
    <ScoreHistory scans={[scan('a', 60, 20), scan('b', 72, 23)]} />,
  );
  assert.match(html, /<svg/);
  assert.match(html, /\+12/);
});

test('mezcla de publicadas y retenidas: la línea usa solo las publicadas', () => {
  const html = renderToStaticMarkup(
    <ScoreHistory scans={[scan('a', 60, 20), scan('b', null, 22, 70), scan('c', 66, 23)]} />,
  );
  assert.match(html, /Histórico de scans \(3\)/);
  assert.match(html, /1 retenido/);
  assert.match(html, /<svg/);
  // +6 entre la primera y la última PUBLICADA, sin contar la retenida de 70.
  assert.match(html, /\+6/);
});
