import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNetwork, assignUsers, recoverNetwork, resultsCsv } from './model.js';

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
