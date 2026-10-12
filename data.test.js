import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getValue, summarize, compareData, dataCsv } from './data.js';
import { makeNetwork, powerOutage, powerTimeline } from './model.js';

const row = (key, down, tests) => ({
  quadkey: key,
  downKbps: down,
  upKbps: down / 2,
  latencyMs: 20,
  tests
});
test('units, sample filtering and test-weighted averages', () => {
  const rows = [row('a', 10000, 2), row('b', 40000, 8), row('c', 1000, 1)];
  assert.equal(getValue(rows[0], 'down'), 10);
  assert.equal(getValue({ downKbps: null }, 'down'), null);
  assert.deepEqual(summarize(rows, 'down', 2, 20), {
    tiles: 2,
    tests: 10,
    flagged: 1,
    average: 34
  });
  assert.equal(summarize(rows, 'latency', 2, 10).flagged, 2);
  assert.equal(summarize(rows, 'down', 100, 20).average, null);
});
test('quarter comparison joins cells and excludes low samples', () => {
  const result = compareData(
    [row('a', 10000, 3), row('b', 20000, 3), row('c', 5000, 1)],
    [row('a', 14000, 3), row('b', 18000, 3), row('c', 8000, 5), row('d', 10000, 3)],
    'down',
    3
  );
  assert.deepEqual(result, { matched: 2, medianChange: 1 });
  assert.equal(dataCsv([row('a', 10000, 3)]).split('\n').length, 3);
});
test('real snapshot has valid unique cells, provenance and both local regions', () => {
  const data = JSON.parse(readFileSync(new URL('./measurements.json', import.meta.url)));
  const keys = new Set();
  for (const r of data.records) {
    const key = [r.region, r.period, r.quadkey].join(':');
    assert.ok(!keys.has(key));
    keys.add(key);
    assert.ok(r.tests > 0);
    assert.ok(r.bounds[0] < r.bounds[2]);
    assert.ok(r.bounds[1] < r.bounds[3]);
    assert.ok(r.lon >= r.bounds[0] && r.lon <= r.bounds[2]);
    assert.ok(r.lat >= r.bounds[1] && r.lat <= r.bounds[3]);
    for (const m of ['down', 'up', 'latency']) assert.notEqual(getValue(r, m), null);
    assert.equal(r.quadkey.length, r.region === 'world' ? 6 : 16);
  }
  assert.equal(data.records.filter((r) => r.region !== 'world').length, 620);
  assert.equal(
    data.records.filter((r) => r.region === 'world' && r.period === '2026 Q1').length,
    751
  );
  assert.ok(
    data.periods.every((p) => p.url.startsWith('https://ookla-open-data.s3.amazonaws.com/'))
  );
  assert.equal(data.license, 'CC BY-NC-SA 4.0');
});
test('backup expiration, manual failures and independently powered relay', () => {
  const n = makeNetwork('rural', 180, 40);
  n.towers[0].active = false;
  n.towers[1].powerRestored = true;
  n.towers.push({ ...n.towers[2], temporary: true });
  const before = JSON.stringify(n);
  assert.equal(powerOutage(n, 1.5, 2).towers.filter((t) => t.active).length, 5);
  assert.equal(powerOutage(n, 2, 2).towers.filter((t) => t.active).length, 2);
  const points = powerTimeline(n, 2);
  assert.equal(points.length, 17);
  assert.equal(points[0].hours, 0);
  assert.equal(points.at(-1).hours, 8);
  assert.equal(JSON.stringify(n), before);
  assert.ok(points.every((p) => p.connected <= n.users.length));
});
