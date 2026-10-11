import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNetwork,assignUsers,recoverNetwork,resultsCsv} from './model.js';

test('repeatable scenarios and capacity-safe recovery',()=>{
  for(const layout of ['town','rural','crowd']) {
    assert.deepEqual(makeNetwork(layout),makeNetwork(layout));
    for(let mask=0;mask<32;mask++) {
      const n=makeNetwork(layout,240,40);
      n.towers.forEach((t,i)=>t.active=Boolean(mask&(1<<i)));
      const baseline=assignUsers(n);
      for(const strategy of ['balanced','boost','combined']) {
        const r=recoverNetwork(n,strategy);
        assert.ok(r.connected>=baseline.connected);
        assert.equal(r.connected+r.outOfRange+r.congested,n.users.length);
        assert.equal(r.loads.reduce((a,b)=>a+b,0),r.connected);
        r.loads.forEach((load,i)=>assert.ok(load<=n.towers[i].capacity && (n.towers[i].active||load===0)));
        n.users.forEach(u=>{const t=n.towers[r.assignments[u.id]];if(t)assert.ok(Math.hypot(u.x-t.x,u.y-t.y)<=t.range*r.multiplier);});
      }
    }
  }
});

test('no active towers leaves every user disconnected',()=>{
  const n=makeNetwork();n.towers.forEach(t=>t.active=false);
  const r=recoverNetwork(n,'combined');
  assert.equal(r.connected,0);assert.equal(r.outOfRange,n.users.length);
});

test('reassignment finds a path missed by nearest-first allocation', () => {
  const n = {
    towers: [
      {id: 0, x: 0, y: 0, range: 6, capacity: 1, active: true},
      {id: 1, x: 10, y: 0, range: 6, capacity: 1, active: true}
    ],
    users: [{id: 0, x: 4, y: 0}, {id: 1, x: 0, y: 0}]
  };
  assert.equal(assignUsers(n).connected, 1);
  assert.equal(recoverNetwork(n, 'balanced').connected, 2);
});

test('maximum matching agrees with exhaustive search on small networks', () => {
  function optimum(n, user = 0, loads = [0, 0, 0]) {
    if (user === n.users.length) return 0;
    let best = optimum(n, user + 1, loads);
    for (const t of n.towers) {
      const u = n.users[user];
      if (!t.active || loads[t.id] === t.capacity || Math.hypot(u.x - t.x, u.y - t.y) > t.range) continue;
      loads[t.id]++;
      best = Math.max(best, 1 + optimum(n, user + 1, loads));
      loads[t.id]--;
    }
    return best;
  }
  for (let seed = 0; seed < 50; seed++) {
    const n = {
      towers: [0, 1, 2].map(id => ({id, x: id * 10, y: 0, range: 6 + seed % 10, capacity: 1 + seed % 2, active: true})),
      users: Array.from({length: 6}, (_, id) => ({id, x: (seed * 7 + id * 11) % 31, y: 0}))
    };
    assert.equal(recoverNetwork(n, 'balanced').connected, optimum(n));
  }
});

test('CSV contains the same strategy results and requested extension', () => {
  const network = makeNetwork('rural', 180, 40);
  network.towers[2].active = false;
  const rows = resultsCsv(network, 60).trim().split('\n').map(row => row.split(','));
  assert.equal(rows.length, 5);
  for (const row of rows.slice(1)) {
    const result = recoverNetwork(network, row[0], 60);
    assert.equal(Number(row[1]), result.connected);
    assert.equal(Number(row[5]), result.multiplier);
  }
});
