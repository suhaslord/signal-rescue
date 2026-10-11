import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNetwork,
  assignUsers,
  recoverNetwork,
  resultsCsv,
  rankRepairs,
  rangeSweep,
  withRelay,
  planRelay,
  planningCsv
} from './model.js';

test('repeatable scenarios and capacity-safe recovery', () => {
  for (const layout of ['town', 'rural', 'crowd']) {
    assert.deepEqual(makeNetwork(layout), makeNetwork(layout));
    for (let mask = 0; mask < 32; mask++) {
      const network = makeNetwork(layout, 240, 40);
      network.towers.forEach((tower, i) => (tower.active = Boolean(mask & (1 << i))));
      const baseline = assignUsers(network);
      for (const strategy of ['balanced', 'boost', 'combined']) {
        const result = recoverNetwork(network, strategy);
        assert.ok(result.connected >= baseline.connected);
        assert.equal(result.connected + result.outOfRange + result.congested, network.users.length);
        assert.equal(
          result.loads.reduce((a, b) => a + b, 0),
          result.connected
        );
        result.loads.forEach((load, i) =>
          assert.ok(load <= network.towers[i].capacity && (network.towers[i].active || load === 0))
        );
        network.users.forEach((user) => {
          const tower = network.towers[result.assignments[user.id]];
          if (tower)
            assert.ok(
              Math.hypot(user.x - tower.x, user.y - tower.y) <= tower.range * result.multiplier
            );
        });
      }
    }
  }
});

test('no active towers leaves every user disconnected', () => {
  const network = makeNetwork();
  network.towers.forEach((tower) => (tower.active = false));
  const result = recoverNetwork(network, 'combined');
  assert.equal(result.connected, 0);
  assert.equal(result.outOfRange, network.users.length);
});

test('reassignment finds a path missed by nearest-first allocation', () => {
  const network = {
    towers: [
      { id: 0, x: 0, y: 0, range: 6, capacity: 1, active: true },
      { id: 1, x: 10, y: 0, range: 6, capacity: 1, active: true }
    ],
    users: [
      { id: 0, x: 4, y: 0 },
      { id: 1, x: 0, y: 0 }
    ]
  };
  assert.equal(assignUsers(network).connected, 1);
  assert.equal(recoverNetwork(network, 'balanced').connected, 2);
});

test('maximum matching agrees with exhaustive search on small networks', () => {
  function optimum(network, userIndex = 0, loads = [0, 0, 0]) {
    if (userIndex === network.users.length) return 0;
    let best = optimum(network, userIndex + 1, loads);
    for (const tower of network.towers) {
      const user = network.users[userIndex];
      if (
        !tower.active ||
        loads[tower.id] === tower.capacity ||
        Math.hypot(user.x - tower.x, user.y - tower.y) > tower.range
      )
        continue;
      loads[tower.id]++;
      best = Math.max(best, 1 + optimum(network, userIndex + 1, loads));
      loads[tower.id]--;
    }
    return best;
  }
  for (let seed = 0; seed < 50; seed++) {
    const network = {
      towers: [0, 1, 2].map((id) => ({
        id,
        x: id * 10,
        y: 0,
        range: 6 + (seed % 10),
        capacity: 1 + (seed % 2),
        active: true
      })),
      users: Array.from({ length: 6 }, (_, id) => ({ id, x: (seed * 7 + id * 11) % 31, y: 0 }))
    };
    assert.equal(recoverNetwork(network, 'balanced').connected, optimum(network));
  }
});

test('CSV contains the same strategy results and requested extension', () => {
  const network = makeNetwork('rural', 180, 40);
  network.towers[2].active = false;
  const rows = resultsCsv(network, 60)
    .trim()
    .split('\n')
    .map((row) => row.split(','));
  assert.equal(rows.length, 5);
  for (const row of rows.slice(1)) {
    const result = recoverNetwork(network, row[0], 60);
    assert.equal(Number(row[1]), result.connected);
    assert.equal(Number(row[5]), result.multiplier);
  }
});

test('repair ranking compares independent repairs without changing the outage', () => {
  const network = makeNetwork('rural', 180, 40);
  network.towers[1].active = false;
  network.towers[2].active = false;
  const before = structuredClone(network);
  const baseline = recoverNetwork(network, 'combined', 35).connected;
  const ranked = rankRepairs(network, 35);
  assert.equal(ranked.length, 2);
  assert.ok(ranked[0].gain >= ranked[1].gain);
  for (const repair of ranked) {
    const copy = structuredClone(network);
    copy.towers[repair.towerId].active = true;
    assert.equal(repair.connected, recoverNetwork(copy, 'combined', 35).connected);
    assert.equal(repair.gain, repair.connected - baseline);
  }
  assert.deepEqual(network, before);
});

test('range sweep stays monotonic and reports capacity limits', () => {
  const network = makeNetwork('rural', 200, 20);
  network.towers[2].active = false;
  const sweep = rangeSweep(network);
  assert.equal(sweep.length, 21);
  sweep.forEach((point, index) => {
    assert.equal(point.extension, index * 5);
    assert.ok(point.connected <= 80);
    assert.equal(point.connected + point.outOfRange + point.congested, 200);
    if (index) assert.ok(point.connected >= sweep[index - 1].connected);
  });
});

test('relay search chooses the best tested grid point and leaves inputs intact', () => {
  const network = makeNetwork('rural', 80, 12);
  network.towers[2].active = false;
  const before = structuredClone(network);
  const relay = planRelay(network, 10, 135, 0);
  const baseline = recoverNetwork(network, 'combined', 0).connected;
  assert.equal(relay.gain, relay.connected - baseline);
  for (let y = 20; y <= 420; y += 50) {
    for (let x = 25; x <= 775; x += 50) {
      const result = recoverNetwork(
        withRelay(network, { x, y, capacity: 10, range: 135 }),
        'combined',
        0
      );
      assert.ok(result.connected <= relay.connected);
    }
  }
  assert.deepEqual(network, before);
  const added = withRelay(network, relay);
  assert.equal(added.towers.length, 6);
  assert.equal(added.towers[5].id, 5);
  assert.ok(recoverNetwork(added, 'combined', 0).loads[5] <= 10);
  const csv = planningCsv(rankRepairs(network, 0), rangeSweep(network), relay);
  assert.ok(csv.includes(`temporary_relay,${relay.x}:${relay.y},${relay.connected},${relay.gain}`));
});

test('a relay still needs available capacity, and no outage means no repairs', () => {
  const network = makeNetwork('town', 20, 40);
  assert.deepEqual(rankRepairs(network), []);
  assert.equal(planRelay(network).gain, 0);
  network.towers.forEach((tower) => (tower.active = false));
  const relay = planRelay(network, 5, 300, 0);
  assert.ok(relay.connected > 0 && relay.connected <= 5);
});
