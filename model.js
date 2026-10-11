export function makeNetwork(layout = 'town', count = 180, capacity = 55) {
  let seed = 2026;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const locations = layout === 'rural'
    ? [[90,220],[245,220],[400,220],[555,220],[710,220]]
    : [[145,115],[650,115],[400,220],[145,330],[650,330]];
  const towers = locations.map(([x,y],i) => ({id:i,x,y,range:layout === 'rural' ? 135 : 205,capacity,active:true}));
  const users = Array.from({length:count}, (_,id) => {
    if (layout === 'crowd' && random() < 0.7) return {id,x:280+random()*240,y:130+random()*180};
    return {id,x:30+random()*740,y:layout === 'rural' ? 145+random()*150 : 30+random()*380};
  });
  return {towers,users};
}

export function assignUsers(network, {balanced=false, multiplier=1} = {}) {
  const loads = network.towers.map(() => 0);
  const choices = network.users.map(user => network.towers
    .filter(t => t.active && Math.hypot(user.x-t.x,user.y-t.y) <= t.range*multiplier)
    .map(t => ({tower:t.id,distance:Math.hypot(user.x-t.x,user.y-t.y)}))
    .sort((a,b)=>a.distance-b.distance));
  const order = network.users.map(u=>u.id);
  // Constrained users get first choice; otherwise the busiest tower can strand them.
  if (balanced) order.sort((a,b)=>choices[a].length-choices[b].length || a-b);
  const assignments = network.users.map(() => -1);
  for (const id of order) {
    const available = choices[id].filter(c=>loads[c.tower]<network.towers[c.tower].capacity);
    if (balanced) available.sort((a,b)=>loads[a.tower]/network.towers[a.tower].capacity-loads[b.tower]/network.towers[b.tower].capacity || a.distance-b.distance);
    if (available.length) { assignments[id]=available[0].tower; loads[available[0].tower]++; }
  }
  const connected = assignments.filter(id=>id>=0).length;
  const outOfRange = choices.filter(c=>!c.length).length;
  return {assignments,loads,connected,outOfRange,congested:network.users.length-connected-outOfRange,multiplier,cost:network.towers.filter(t=>t.active).length*multiplier**2};
}

export function recoverNetwork(network, strategy) {
  const baseline = assignUsers(network);
  const options = strategy === 'balanced' ? [{balanced:true}]
    : strategy === 'boost' ? [{multiplier:1.35}]
    : [{balanced:true},{multiplier:1.35},{balanced:true,multiplier:1.35}];
  // Keep the original assignment if a heuristic cannot improve service.
  return options.map(option=>assignUsers(network,option)).reduce((best,result)=>
    result.connected>best.connected || (result.connected===best.connected && result.cost<best.cost) ? result : best,baseline);
}
