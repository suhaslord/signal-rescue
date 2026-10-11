export function makeNetwork(layout = 'town', count = 180, capacity = 40) {
  // Keep the same users when comparing layouts and recovery strategies.
  let seed = 2026;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const locations =
    layout === 'rural'
      ? [
          [90, 220],
          [245, 220],
          [400, 220],
          [555, 220],
          [710, 220]
        ]
      : [
          [145, 115],
          [650, 115],
          [400, 220],
          [145, 330],
          [650, 330]
        ];
  const towers = locations.map(([x, y], id) => ({
    id,
    x,
    y,
    range: layout === 'rural' ? 135 : 205,
    capacity,
    active: true
  }));
  const users = Array.from({ length: count }, (_, id) => {
    if (layout === 'crowd' && random() < 0.7) {
      return { id, x: 280 + random() * 240, y: 130 + random() * 180 };
    }
    return {
      id,
      x: 30 + random() * 740,
      y: layout === 'rural' ? 145 + random() * 150 : 30 + random() * 380
    };
  });
  return { towers, users };
}

function distance(user, tower) {
  return Math.hypot(user.x - tower.x, user.y - tower.y);
}

function towerChoices(network, multiplier) {
  return network.users.map((user) => {
    const reachable = [];
    for (const tower of network.towers) {
      if (!tower.active) continue;
      const separation = distance(user, tower);
      if (separation <= tower.range * multiplier) {
        reachable.push({ id: tower.id, distance: separation });
      }
    }
    reachable.sort((a, b) => a.distance - b.distance);
    return reachable.map((tower) => tower.id);
  });
}

export function assignUsers(network, { balanced = false, multiplier = 1 } = {}) {
  const choices = towerChoices(network, multiplier);
  // User and tower IDs are array indexes; -1 means no connection.
  const assignments = network.users.map(() => -1);
  const occupants = network.towers.map(() => []);

  // An augmenting path can move a connected user to a different tower,
  // freeing a slot for someone who has no other reachable tower.
  function place(userId, visited) {
    for (const towerId of choices[userId]) {
      if (visited.has(towerId)) continue;
      visited.add(towerId);
      const members = occupants[towerId];
      if (members.length < network.towers[towerId].capacity) {
        members.push(userId);
        assignments[userId] = towerId;
        return true;
      }
      for (let slot = 0; slot < members.length; slot++) {
        if (place(members[slot], visited)) {
          members[slot] = userId;
          assignments[userId] = towerId;
          return true;
        }
      }
    }
    return false;
  }

  for (const user of network.users) {
    if (balanced) {
      place(user.id, new Set());
    } else {
      const towerId = choices[user.id].find(
        (id) => occupants[id].length < network.towers[id].capacity
      );
      if (towerId !== undefined) {
        occupants[towerId].push(user.id);
        assignments[user.id] = towerId;
      }
    }
  }

  const connected = assignments.filter((id) => id >= 0).length;
  // A reachable but unassigned user is blocked by capacity, not range.
  const outOfRange = choices.filter((options) => options.length === 0).length;
  return {
    assignments,
    loads: occupants.map((members) => members.length),
    connected,
    outOfRange,
    congested: network.users.length - connected - outOfRange,
    multiplier
  };
}

export function recoverNetwork(network, strategy, extension = 35) {
  const multiplier = 1 + extension / 100;
  if (strategy === 'balanced') return assignUsers(network, { balanced: true });
  if (strategy === 'boost') return assignUsers(network, { multiplier });
  if (strategy === 'combined') return assignUsers(network, { balanced: true, multiplier });
  return assignUsers(network);
}

export function resultsCsv(network, extension = 35) {
  const rows = [
    ['strategy', 'connected', 'users', 'out_of_range', 'capacity_blocked', 'range_multiplier']
  ];
  for (const strategy of ['none', 'balanced', 'boost', 'combined']) {
    const result = recoverNetwork(network, strategy, extension);
    rows.push([
      strategy,
      result.connected,
      network.users.length,
      result.outOfRange,
      result.congested,
      result.multiplier
    ]);
  }
  return rows.map((row) => row.join(',')).join('\n') + '\n';
}
