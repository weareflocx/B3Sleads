import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import CalibracionPage from '../app/(dashboard)/settings/calibracion/page';
import {
  calibrationByDimension,
  componentVersions,
  defaultVersion,
  globalScoreDeviation,
} from '../lib/scan-versions';
import type { Scan } from '../lib/types';

function scan(id: string, at: string | null, score = 60): Scan {
  return {
    id,
    company_id: 'calibration-company',
    scanner_job_id: `calibration-${id}`,
    status: 'ready',
    score,
    tldr: null,
    evidence: null,
    result_raw: {
      markdown: '# Test report\n> Synthetic calibration fixture with a real component reading.\n\n## Propósito\nNota: **6/10** (6/10 pts)\n> A purpose reading.\n',
    },
    ui_url: null,
    // The legacy Scan type says string, but scans.created_at is nullable in SQL.
    // Keep the actual null to reproduce rows returned by Supabase.
    created_at: at as string,
    completed_at: null,
  };
}

test('component versions keep undated readings last without changing the input', () => {
  const scans = [
    scan('undated-a', null),
    scan('older', '2026-10-01T10:00:00Z'),
    scan('newer', '2026-10-03T10:00:00Z'),
    scan('undated-b', null),
  ];
  const original = structuredClone(scans);
  const versions = componentVersions(scans);
  const purpose = versions.find(({ key }) => key === 'purpose');
  assert.ok(purpose);
  assert.deepEqual(purpose.versions.map(({ scanId }) => scanId), ['newer', 'older', 'undated-a', 'undated-b']);
  assert.equal(defaultVersion(purpose)?.scanId, 'newer');
  assert.equal(purpose.versions[2].runAt, null);
  assert.deepEqual(purpose.stats, { min: 6, max: 6, stdev: 0, detectedIn: 4, totalRuns: 4 });
  // Missing components retain the same runs, too.
  assert.deepEqual(versions.find(({ key }) => key === 'mission')?.versions.map(({ scanId }) => scanId), ['newer', 'older', 'undated-a', 'undated-b']);
  assert.deepEqual(scans, original);
});

test('all-undated runs still contribute to dimension calibration', () => {
  const versions = componentVersions([scan('a', null), scan('b', null)]);
  const purpose = versions.find(({ key }) => key === 'purpose');
  assert.ok(purpose);
  assert.deepEqual(purpose.versions.map(({ scanId }) => scanId), ['a', 'b']);
  assert.equal(defaultVersion(purpose)?.scanId, 'a');
  assert.deepEqual(calibrationByDimension([versions]).find(({ key }) => key === 'purpose'), {
    key: 'purpose', label: 'Propósito', avgStdev: 0, avgRange: 0, detectionRate: 1, companies: 1,
  });
});

test('an undated retained run remains readable but is not the default published version', () => {
  const retained = scan('retained', null);
  retained.score = null;
  retained.result_raw = {
    ...retained.result_raw,
    score: { value: null, raw_value: 60, retention_reason: 'acquisition_regression' },
  };
  const purpose = componentVersions([retained, scan('published', '2026-10-03T10:00:00Z')])
    .find(({ key }) => key === 'purpose');
  assert.ok(purpose);
  assert.equal(purpose.versions[1].retained, true);
  assert.equal(defaultVersion(purpose)?.scanId, 'published');
});

test('an undated global score never creates an epoch pair, regardless of input order', () => {
  const dated = scan('dated', '2026-10-03T10:00:00Z', 60);
  const undated = scan('undated', null, 90);
  for (const scans of [[undated, dated], [dated, undated]]) {
    assert.deepEqual(globalScoreDeviation([{ scores: scans.map((run) => ({ score: run.score!, at: run.created_at })) }]), {
      deviation: null, pairs: 0,
    });
  }
  assert.deepEqual(globalScoreDeviation([{ scores: [scan('a', null), scan('b', null)]
    .map((run) => ({ score: run.score!, at: run.created_at })) }]), { deviation: null, pairs: 0 });
});

test('global deviation compares only dated neighbours and preserves the seven-day boundary', () => {
  const scans = [
    scan('undated-a', null, 99),
    scan('third', '2026-10-16T10:00:00Z', 90),
    scan('second', '2026-10-08T10:00:00Z', 64),
    scan('undated-b', null, 1),
    scan('first', '2026-10-01T10:00:00Z', 60),
  ];
  const scores = scans.map((run) => ({ score: run.score!, at: run.created_at }));
  const original = structuredClone(scores);
  assert.deepEqual(globalScoreDeviation([{ scores }]), { deviation: 4, pairs: 1 });
  assert.deepEqual(scores, original);
  assert.deepEqual(globalScoreDeviation([{ scores: [] }, { scores: [scores[2]] }]), { deviation: null, pairs: 0 });
});

test('dated global scores keep their existing per-company comparison and rounding', () => {
  assert.deepEqual(globalScoreDeviation([
    { scores: [{ score: 60, at: '2026-10-03T10:00:00Z' }, { score: 55, at: '2026-10-01T10:00:00Z' }] },
    { scores: [{ score: 75, at: '2026-10-01T10:00:00Z' }, { score: 73, at: '2026-10-03T10:00:00Z' }] },
  ]), { deviation: 3.5, pairs: 2 });
});

test('the calibration page renders mixed and all-undated runs without phantom pairs', async () => {
  // Serve synthetic Supabase rows locally. Exercise the real page and client,
  // without credentials, a database, production, or the Scanner.
  let rows: Scan[] = [];
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(rows));
  });
  const envNames = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'] as const;
  const originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-calibration-test-key';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // The monorepo also has a lib/db path: this test must only use the local HTTP fixture.
    delete process.env.DATABASE_URL;
    assert.equal('DATABASE_URL' in process.env, false, 'The page test must not inherit DATABASE_URL');

    rows = [scan('undated', null, 99), scan('newer', '2026-10-03T10:00:00Z', 64), scan('older', '2026-10-01T10:00:00Z', 60)];
    const mixed = renderToStaticMarkup(await CalibracionPage());
    assert.match(mixed, /Calibración del Scanner/);
    assert.match(mixed, /1 par comparado/);
    assert.match(mixed, />4<\/span>/);
    assert.match(mixed, /Propósito/);
    assert.doesNotMatch(mixed, /Sin datos en modo demo/);

    rows = [scan('a', null), scan('b', null)];
    const undated = renderToStaticMarkup(await CalibracionPage());
    assert.match(undated, /0 pares comparados/);
    assert.match(undated, /Propósito/);
    assert.doesNotMatch(undated, /Aún no hay marcas con dos escaneos válidos/);
    assert.equal(requests.length, 2);
    for (const path of requests) assert.match(path, /^\/rest\/v1\/scans\?/);
  } finally {
    for (const [name, value] of originalEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
