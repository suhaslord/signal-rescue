import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNetwork,assignUsers,recoverNetwork} from './model.js';

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
