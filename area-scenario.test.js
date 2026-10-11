import test from 'node:test';
import assert from 'node:assert/strict';
import { areaScenario, scenarioReport } from './area-scenario.js';
import { assignUsers, recoverNetwork } from './model.js';
const records = Array.from({ length: 12 }, (_, i) => ({
  quadkey: String(i).padStart(3, '0'),
  lon: 80 + i * 0.001,
  lat: 14,
  tests: 2,
  downKbps: 10000,
  upKbps: 2000,
  latencyMs: 40
}));
test('geographic points retain evidence and distances; a single assumed tower can fail and recover', () => {
  const bounds = [79.99, 13.99, 80.03, 14.01];
  const network = areaScenario(records, bounds, 20, 'single', 5);
  assert.equal(network.users.length, 12);
  const a = network.users[0],
    b = network.users[1];
  assert.ok(Math.abs((b.x - a.x) / network.geography.pixelsPerKm - 0.108) < 0.003);
  assert.equal(assignUsers(network).connected, 12);
  network.towers[0].active = false;
  assert.equal(recoverNetwork(network, 'combined', 100).connected, 0);
  network.towers[0].active = true;
  assert.equal(assignUsers(network).connected, 12);
  const csv = scenarioReport(
    { period: '2026Q1', bounds, minimum: 1 },
    network,
    network,
    assignUsers(network),
    { strategy: 'none' }
  );
  assert.match(csv, /2026Q1/);
  assert.match(csv, /Connections do not predict speeds/);
  assert.match(csv, /"10","2","40","2","true","1"/);
});
test('large areas sample reproducibly without duplicate points or treating test counts as population', () => {
  const many = Array.from({ length: 1200 }, (_, i) => ({
    ...records[0],
    quadkey: String(i).padStart(5, '0'),
    tests: 10000
  }));
  const network = areaScenario(many, [79.99, 13.99, 80.03, 14.01]);
  assert.equal(network.users.length, 500);
  assert.equal(new Set(network.users.map((p) => p.record.quadkey)).size, 500);
  assert.deepEqual(
    network.users,
    areaScenario([...many].reverse(), [79.99, 13.99, 80.03, 14.01]).users
  );
});
