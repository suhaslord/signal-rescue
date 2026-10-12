import { makeArea, areaCsv } from './area.js';
import {
  makeNetwork,
  connectUsers,
  recover,
  resultsCsv,
  rankRepairs,
  rangeSweep,
  findRelay,
  withRelay,
  planCsv,
  powerOutage,
  powerTimeline,
  improveConnections,
  countConnected
} from './model.js';

const get = (id) => document.getElementById(id);
const towerName = (id) => (network.towers[id]?.temporary ? 'Relay' : `T${id + 1}`);
const strategyNames = {
  none: 'No recovery',
  balanced: 'Reassignment',
  boost: 'Range extension',
  combined: 'Both'
};
const mapGrid = { columns: 2, rows: 2, width: 800, height: 440 };
const cellWidth = mapGrid.width / mapGrid.columns;
const cellHeight = mapGrid.height / mapGrid.rows;

let network = makeNetwork();
let strategy = 'none';
let current;
let selectedRegion = null;
let plan = null;
let working = network;
let areaContext = null;
let selectedPoint = null;
let priorityIds = [];
let comparison = null;
let viewBefore = false;
let nextStep = null;
let previewNetwork = null;
const regionNames = ['northwest', 'northeast', 'southwest', 'southeast'];

function regionOf(user) {
  const col = Math.max(0, Math.min(mapGrid.columns - 1, Math.floor(user.x / cellWidth)));
  const row = Math.max(0, Math.min(mapGrid.rows - 1, Math.floor(user.y / cellHeight)));
  return row * mapGrid.columns + col;
}
function focusIds() {
  return network.users
    .filter((u) => selectedRegion === null || regionOf(u) === selectedRegion)
    .map((u) => u.id);
}
function mapResult() {
  return comparison && viewBefore ? comparison.before : current;
}

function coverage(result) {
  return `${((100 * result.connected) / network.users.length).toFixed(1)}%`;
}

function updateSettings() {
  if (!get('settings').reportValidity()) return;
  // Editing the scenario should not silently bring failed towers back online.
  const previous = network;
  const towerStates = network.towers.map((tower) => tower.active);
  network = areaContext
    ? makeArea(
        areaContext.records,
        areaContext.bounds,
        Number(get('capacity').value),
        get('scenario').value,
        Number(get('area-reach').value)
      )
    : makeNetwork(
        get('scenario').value,
        Number(get('population').value),
        Number(get('capacity').value)
      );
  network.towers.forEach((tower, id) => {
    tower.active = towerStates[id] ?? true;
    if (areaContext && previous.layout === network.layout && previous.towers[id]) {
      tower.x = previous.towers[id].x;
      tower.y = previous.towers[id].y;
      tower.powerRestored = previous.towers[id].powerRestored;
    }
  });
  render();
}

function toggleTower(id) {
  network.towers[id].active = !network.towers[id].active;
  render();
}

function render({ keepComparison = false } = {}) {
  if (!keepComparison) {
    priorityIds = [];
    comparison = null;
    viewBefore = false;
    nextStep = null;
    previewNetwork = null;
  }
  get('before-after').hidden = !comparison;
  get('next-step').hidden = !nextStep;
  get('whole-area').hidden = selectedRegion === null;
  get('focus-label').textContent =
    selectedRegion === null ? 'Area: all' : `Area: ${regionNames[selectedRegion]}`;
  get('optimize').disabled = focusIds().length === 0;
  get('optimize').textContent =
    selectedRegion === null ? 'improve connections' : 'improve this area';
  working = get('grid-outage').checked
    ? powerOutage(network, Number(get('outage-hours').value), Number(get('backup-hours').value))
    : network;
  plan = null;
  get('planning-results').hidden = true;
  get('planning-note').textContent = 'Compare again after changing the scenario.';
  get('optimization-summary').textContent = 'Click improve to compare connections.';
  document.querySelectorAll('[data-layout]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.layout === get('scenario').value);
    button.disabled = !!areaContext && button.dataset.layout === 'crowd';
  });
  get('remove-relay').hidden = !network.towers.some((tower) => tower.temporary);
  const extension = Number(get('boost').value);
  const healthy = connectUsers({
    ...network,
    towers: network.towers
      .filter((tower) => !tower.temporary)
      .map((tower) => ({ ...tower, active: true }))
  });
  const outage = connectUsers({
    ...network,
    towers: working.towers.filter((tower) => !tower.temporary)
  });
  current = recover(working, strategy, extension, priorityIds);
  get('boost-value').value = `${extension}%`;
  get('recovery-heading').textContent = network.towers.some((tower) => tower.temporary)
    ? `Relay + ${strategyNames[strategy]}`
    : strategy === 'none'
      ? 'Recovery'
      : strategyNames[strategy];

  renderMetrics(healthy, outage);
  renderTowerTable();
  renderComparison(extension);
  renderStatus(outage);

  get('export').href =
    'data:text/csv;charset=utf-8,' +
    encodeURIComponent(resultsCsv(working, extension, priorityIds));
  renderPower();
  drawMap();
  renderAreaContext();
}

function renderMetrics(healthy, outage) {
  const metrics = [
    [
      areaContext ? 'Locations connected' : 'Connected',
      (result) => `${result.connected} / ${network.users.length}`
    ],
    [areaContext ? 'Locations reached' : 'Coverage', coverage],
    ['Out of range', (result) => result.outOfRange],
    ['Capacity blocked', (result) => result.congested]
  ];
  get('metrics').innerHTML = metrics
    .map(
      ([label, value]) => `
    <tr><td>${label}</td><td>${value(healthy)}</td><td>${value(outage)}</td>
    <td>${strategy === 'none' && !network.towers.some((tower) => tower.temporary) ? '—' : value(current)}</td></tr>`
    )
    .join('');
}

function renderTowerTable() {
  get('tower-controls').innerHTML = working.towers
    .map(
      (tower) => `
    <tr><td>${towerName(tower.id)}</td><td>
    <button data-tower="${tower.id}" aria-label="Toggle tower ${towerName(tower.id)}"
      aria-pressed="${tower.active}">${tower.active ? 'on' : 'off'}</button>
    </td><td>${current.loads[tower.id]} / ${tower.capacity}</td></tr>`
    )
    .join('');
  get('tower-controls')
    .querySelectorAll('button')
    .forEach((button) => {
      button.onclick = () => toggleTower(Number(button.dataset.tower));
    });
}

function renderComparison(extension) {
  get('comparison').innerHTML = ['balanced', 'boost', 'combined']
    .map((key) => {
      const result = recover(working, key, extension, priorityIds);
      return `<tr><td>${strategyNames[key]}</td><td>${result.connected}</td>
      <td>${coverage(result)}</td><td>${result.multiplier.toFixed(2)}×</td></tr>`;
    })
    .join('');
  document.querySelectorAll('[data-strategy]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.strategy === strategy);
  });
}

function renderStatus(outage) {
  const failed = working.towers.filter((tower) => !tower.active).length;
  const restored = current.connected - outage.connected;
  const remaining = [];
  if (current.outOfRange) remaining.push(`${current.outOfRange} out of range`);
  if (current.congested) remaining.push(`${current.congested} waiting for a free slot`);
  let message =
    strategy === 'none' && !network.towers.some((tower) => tower.temporary)
      ? `${current.connected} connected. ${failed} ${failed === 1 ? 'tower' : 'towers'} off.`
      : `${restored} reconnected. ${current.connected} connected in total.`;
  if (remaining.length) message += ` ${remaining.join('; ')}.`;
  if (failed === network.towers.length)
    message = 'All towers are off. Even the best algorithm needs a tower.';
  get('status').textContent = message;
}

function summarizeRegions(result = mapResult()) {
  const shownNetwork = comparison && viewBefore ? comparison.network : working;
  const regions = Array.from({ length: mapGrid.columns * mapGrid.rows }, () => ({
    total: 0,
    connected: 0,
    outOfRange: 0
  }));
  for (const user of network.users) {
    const region = regions[regionOf(user)];
    region.total++;
    if (result.assignments[user.id] >= 0) region.connected++;
    else if (
      !shownNetwork.towers.some(
        (tower) =>
          tower.active &&
          Math.hypot(user.x - tower.x, user.y - tower.y) <= tower.range * result.multiplier
      )
    )
      region.outOfRange++;
  }

  return regions;
}

function regionMarkup(regions) {
  return regions
    .map((region, id) => {
      const x = (id % mapGrid.columns) * cellWidth;
      const y = Math.floor(id / mapGrid.columns) * cellHeight;
      const missed = region.total - region.connected;
      // Top-row tower markers sit near the bottom, so put their counts above them.
      return `<g class="region" data-region="${id}" tabindex="0" role="button"
      aria-label="${regionNames[id]} area: ${region.connected} of ${region.total} connected"
      aria-pressed="${selectedRegion === id}">
      <rect class="region-border" x="${x + 1}" y="${y + 1}" width="${cellWidth - 2}" height="${cellHeight - 2}"
        fill="${region.total ? '#faf9f4' : '#fff'}" stroke="#d9d5ca" stroke-width=".7"/>
      ${missed ? `<rect x="${x + 3}" y="${y + 3}" width="${cellWidth - 6}" height="${cellHeight - 6}" fill="url(#missed)" opacity="${0.2 + (missed / region.total) * 0.6}"/>` : ''}
      <text class="region-count" x="${x + 12}" y="${y + 25}">${regionNames[id]}: ${region.connected}/${region.total} connected</text>
    </g>`;
    })
    .join('');
}

function drawMap() {
  const shown = mapResult();
  const shownNetwork = comparison && viewBefore ? comparison.network : working;
  const ranges = get('ranges').checked
    ? shownNetwork.towers
        .filter((tower) => tower.active)
        .map(
          (tower) => `<circle cx="${tower.x}" cy="${tower.y}" r="${tower.range * shown.multiplier}"
      fill="none" stroke="#bbb" stroke-dasharray="4 4" pointer-events="none"/>`
        )
        .join('')
    : '';

  const lines = get('links').checked
    ? network.users
        .map((user) => {
          const tower = shownNetwork.towers[shown.assignments[user.id]];
          if (!tower) return '';
          return `<path d="M${user.x} ${user.y}L${tower.x} ${tower.y}" stroke="#aaa" stroke-opacity=".4" pointer-events="none"/>`;
        })
        .join('')
    : '';

  const regions = summarizeRegions();
  const areas = regionMarkup(regions) + (areaContext ? measuredMarkup() : '');

  const users = get('users').checked
    ? network.users
        .map((user) => {
          const assigned = shown.assignments[user.id];
          return `<circle class="user-dot" cx="${user.x}" cy="${user.y}" r="2.5"
      fill="${assigned < 0 ? '#bd2424' : comparison && !viewBefore && comparison.before.assignments[user.id] < 0 ? '#174cb6' : '#176b38'}" pointer-events="none"/>`;
        })
        .join('')
    : '';

  const towers = shownNetwork.towers
    .map((tower) => {
      const { x, y, id, active } = tower;
      const ink = active ? '#333' : '#ad3225';
      return `<g class="tower" data-tower="${id}" tabindex="0" role="button"
      aria-label="${towerName(id)} on map" aria-pressed="${active}">
      <title>${towerName(id)}: ${active ? `${shown.loads[id]} of ${tower.capacity} slots used. Click to switch off.` : 'off. Click to bring it back.'}</title>
      <circle cx="${x}" cy="${y}" r="20" fill="${active ? '#fffefb' : '#ad3225'}" stroke="${ink}" stroke-width="2"/>
      <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="${tower.temporary ? 12 : 18}" fill="${active ? '#111' : '#fff'}">${towerName(id)}</text></g>`;
    })
    .join('');

  const pattern = `<defs><pattern id="missed" width="7" height="7" patternUnits="userSpaceOnUse">
    <path d="M-1 1L1-1M0 7L7 0M6 8L8 6" stroke="#b95742" stroke-width=".6"/>
  </pattern></defs>`;
  const candidate = comparison && viewBefore ? null : plan?.relay;
  const marker =
    candidate && candidate.gain > 0
      ? `<g pointer-events="none"><path d="M${candidate.x - 10} ${candidate.y}h20M${candidate.x} ${candidate.y - 10}v20" stroke="#000080" stroke-width="3"/><text x="${candidate.x + 12}" y="${Math.min(430, candidate.y + 18)}" font-size="12" fill="#000080">relay candidate</text></g>`
      : '';
  get('map').innerHTML = pattern + areas + ranges + lines + users + towers + marker;
  if (areaContext) {
    const point = network.users[selectedPoint];
    get('region-detail').textContent = point
      ? `Measured ${(point.record.downKbps / 1000).toFixed(1)} Mbps download · ${point.record.tests} tests. Scenario: ${shown.assignments[point.id] >= 0 ? 'connected to T' + (shown.assignments[point.id] + 1) : 'disconnected'}. ${point.record.lat.toFixed(4)}, ${point.record.lon.toFixed(4)}.`
      : selectedRegion !== null
        ? `${regionNames[selectedRegion]} area: ${regions[selectedRegion].connected}/${regions[selectedRegion].total} connected. Select a point for its measured speed.`
        : 'Select an area to focus, or a point for its measured speed.';
    get('point-actions').hidden = !point;
    get('inspect-point').hidden = !point;
  } else if (selectedRegion !== null) {
    const area = regions[selectedRegion];
    const blocked = area.total - area.connected - area.outOfRange;
    get('region-detail').textContent =
      `${regionNames[selectedRegion]} area: ${area.connected}/${area.total} connected. ${area.outOfRange} out of range; ${blocked} capacity blocked.`;
  } else {
    get('region-detail').textContent = 'Click a quarter of the map to improve that area first.';
  }
}

function activateMapItem(item) {
  if (item.dataset.tower !== undefined) {
    toggleTower(Number(item.dataset.tower));
  } else if (item.dataset.point !== undefined) {
    selectedPoint = Number(item.dataset.point);
    selectedRegion = regionOf(network.users[selectedPoint]);
    strategy = 'none';
    render();
  } else {
    selectedRegion = Number(item.dataset.region);
    selectedPoint = null;
    strategy = 'none';
    render();
  }
}

get('map').onclick = (event) => {
  const item = event.target.closest('[data-tower], [data-region], [data-point]');
  if (item) activateMapItem(item);
};
get('map').onkeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const item = event.target.closest('[data-tower], [data-region], [data-point]');
  if (!item) return;
  event.preventDefault();
  const selector =
    item.dataset.tower !== undefined
      ? `[data-tower="${item.dataset.tower}"]`
      : item.dataset.point !== undefined
        ? `[data-point="${item.dataset.point}"]`
        : `[data-region="${item.dataset.region}"]`;
  activateMapItem(item);
  // Rendering replaces the focused SVG group.
  get('map').querySelector(selector).focus();
};

get('settings').onsubmit = (event) => {
  event.preventDefault();
  updateSettings();
};
get('scenario').onchange = updateSettings;
get('population').onchange = updateSettings;
get('capacity').onchange = updateSettings;
get('links').onchange = drawMap;
get('ranges').onchange = drawMap;
get('users').onchange = drawMap;
get('boost').oninput = render;
get('example').onclick = () => {
  network.towers.forEach(
    (tower) => (tower.active = tower.id !== (network.towers.length === 1 ? 0 : 2))
  );
  strategy = 'none';
  render();
};
get('restore').onclick = () => {
  network.towers = network.towers.filter((tower) => !tower.temporary);
  get('grid-outage').checked = false;
  network.towers.forEach((tower) => {
    tower.active = true;
    tower.powerRestored = false;
  });
  strategy = 'none';
  render();
};
get('reset-scenario').onclick = () => {
  areaContext = null;
  selectedPoint = null;
  get('settings').reset();
  get('planning-settings').reset();
  get('power-settings').reset();
  get('boost').value = 35;
  get('optimization-limit').value = 35;
  get('links').checked = false;
  get('ranges').checked = false;
  get('users').checked = false;
  selectedRegion = null;
  network = makeNetwork();
  strategy = 'none';
  render();
};
document.querySelectorAll('[data-strategy]').forEach((button) => {
  button.onclick = () => {
    strategy = button.dataset.strategy;
    render();
  };
});
render();

get('planning-settings').onsubmit = (event) => {
  event.preventDefault();
  const extension = Number(get('boost').value);
  const repairs = rankRepairs(working, extension, priorityIds);
  const sweep = rangeSweep(working, priorityIds);
  const range = sweep.reduce((a, b) =>
    b.focusConnected > a.focusConnected ||
    (b.focusConnected === a.focusConnected && b.connected > a.connected)
      ? b
      : a
  );
  const relay = network.towers.some((tower) => tower.temporary)
    ? null
    : findRelay(
        working,
        Number(get('relay-capacity').value),
        Number(get('relay-range').value) * (areaContext ? network.geography.pixelsPerKm : 1),
        extension,
        priorityIds
      );
  plan = { repairs, sweep, range, relay };
  get('planning-results').hidden = false;
  get('planning-note').textContent =
    `Baseline: ${recover(working, 'combined', extension, priorityIds).connected}/${network.users.length}, reassignment + ${extension}% range. Compare options separately; don’t add gains.`;
  get('repair-ranking').innerHTML = repairs.length
    ? repairs
        .map(
          (repair) =>
            `<tr><td>${towerName(repair.towerId)}</td><td>${repair.connected}</td><td>+${repair.gain}</td><td><button data-repair="${repair.towerId}">repair</button></td></tr>`
        )
        .join('')
    : '<tr><td colspan="4">No failed towers to repair.</td></tr>';
  get('range-advice').textContent =
    `Best tested: ${range.connected}/${network.users.length} at ${range.extension}% (smallest matching extension). ${range.outOfRange} out of range; ${range.congested} capacity blocked.`;
  get('range-sweep').innerHTML = sweep
    .map(
      (point) =>
        `<tr><td>${point.extension}%</td><td>${point.connected}</td><td>${point.outOfRange}</td><td>${point.congested}</td></tr>`
    )
    .join('');
  get('relay-advice').textContent = relay
    ? `Relay at (${relay.x}, ${relay.y}): ${relay.connected}/${network.users.length}, +${relay.gain}. ${relay.capacity} slots; ${areaContext ? (relay.range / network.geography.pixelsPerKm).toFixed(1) + ' km assumed reach' : relay.range + ' reach'} before extension.`
    : 'Remove the current relay to search again.';
  get('apply-relay').disabled = !relay || relay.gain === 0;
  get('planning-export').href =
    'data:text/csv;charset=utf-8,' + encodeURIComponent(planCsv(repairs, sweep, relay, extension));
  drawMap();
};
get('repair-ranking').onclick = (event) => {
  const button = event.target.closest('[data-repair]');
  if (!button || !plan) return;
  network.towers[Number(button.dataset.repair)].active = true;
  network.towers[Number(button.dataset.repair)].powerRestored = get('grid-outage').checked;
  strategy = 'combined';
  render();
};
get('apply-range').onclick = () => {
  if (!plan) return;
  get('boost').value = plan.range.extension;
  strategy = 'combined';
  render();
};
get('apply-relay').onclick = () => {
  if (!plan?.relay) return;
  network = withRelay(network, plan.relay);
  strategy = 'combined';
  render();
};
get('remove-relay').onclick = () => {
  network.towers = network.towers.filter((tower) => !tower.temporary);
  render();
};
get('relay-capacity').onchange = () => {
  plan = null;
  get('planning-results').hidden = true;
  drawMap();
};
get('relay-range').onchange = get('relay-capacity').onchange;

function renderPower() {
  const enabled = get('grid-outage').checked;
  get('outage-hours-value').value = `${get('outage-hours').value} h`;
  get('power-summary').textContent = enabled
    ? `${working.towers.filter((tower) => tower.active).length} towers powered. Repairs restore power; relays have independent power.`
    : 'Backup duration is an assumption, not measured tower data.';
  get('power-history').hidden = !enabled;
  if (!enabled) return;
  const points = powerTimeline(
    network,
    Number(get('backup-hours').value),
    strategy,
    Number(get('boost').value),
    priorityIds
  );
  get('power-rows').innerHTML = points
    .map(
      (point) =>
        `<tr><td>${point.hours}</td><td>${point.active}</td><td>${point.connected}</td></tr>`
    )
    .join('');
  const csv =
    'hours,powered_towers,connected,backup_hours\n' +
    points
      .map((point) =>
        [point.hours, point.active, point.connected, get('backup-hours').value].join(',')
      )
      .join('\n') +
    '\n';
  get('power-export').href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
}
get('power-settings').onsubmit = (event) => {
  event.preventDefault();
  if (get('power-settings').reportValidity()) render();
};
get('grid-outage').onchange = () => {
  network.towers.forEach((tower) => {
    tower.powerRestored = false;
  });
  render();
};
get('backup-hours').onchange = () => {
  if (get('power-settings').reportValidity()) render();
};
get('outage-hours').oninput = render;

function measuredMarkup() {
  const shown = mapResult();
  const project = network.geography.project;
  const cells = network.users
    .map((point) => {
      const [w, s, e, n] = point.record.bounds;
      const a = project(w, n),
        b = project(e, s);
      const disconnected = shown.assignments[point.id] < 0;
      const speed = point.record.downKbps / 1000;
      const fill = disconnected
        ? '#bd2424'
        : comparison && !viewBefore && comparison.before.assignments[point.id] < 0
          ? '#174cb6'
          : '#176b38';
      return `<g data-point="${point.id}" tabindex="0" role="button" aria-label="Measured location ${point.id + 1}: ${speed.toFixed(1)} Mbps, scenario ${disconnected ? 'disconnected' : 'connected'}">
      <rect x="${a.x}" y="${a.y}" width="${Math.max(3, b.x - a.x)}" height="${Math.max(3, b.y - a.y)}" fill="${fill}" opacity=".7" />
      ${disconnected ? `<path d="M${point.x - 4} ${point.y - 4}l8 8m-8 0l8-8" stroke="#111" stroke-width="1.5"/>` : ''}
      <title>${speed.toFixed(1)} Mbps observed; ${point.record.tests} tests. ${disconnected ? 'Disconnected' : 'Connected'} in scenario.</title>
    </g>`;
    })
    .join('');
  return (
    cells +
    `<g pointer-events="none" font-size="11" fill="#555"><text x="8" y="434">${network.geography.widthKm.toFixed(1)} km across · assumed towers</text></g>`
  );
}
function renderAreaContext() {
  get('area-context').hidden = !areaContext;
  get('reach-label').hidden = !areaContext;
  get('population').disabled = !!areaContext;
  get('scenario').querySelector('option[value=crowd]').disabled = !!areaContext;
  get('repair-unit').textContent = areaContext ? 'Additional locations' : 'Additional users';
  get('relay-unit').textContent = areaContext ? ' (km)' : '';
  get('relay-range').min = areaContext ? '0.1' : '25';
  get('relay-range').max = areaContext ? '100' : '300';
  get('relay-range').step = areaContext ? '0.1' : '1';
  get('planner-limits').textContent = areaContext
    ? 'Assumed reach in km, ignoring terrain and interference. Relay needs power and backhaul. Compare options separately.'
    : 'Simulated reach, not metres. Relay needs power and backhaul. Options use reassignment; repairs and relay use the current extension.';
  get('point-label').textContent = areaContext ? 'Locations' : 'Users';
  get('example').textContent =
    network.towers.length === 1 ? 'disable tower' : 'disable center tower';
  get('scenario-legend').textContent = areaContext
    ? 'Green: connected. Red ×: disconnected. Blue: newly connected. T: assumed tower. Click an area to focus on it.'
    : 'Green: connected. Red: disconnected. Blue: newly connected. Click an area to focus, or a tower to switch it.';
  if (!areaContext) {
    get('point-actions').hidden = true;
    get('inspect-point').hidden = true;
    return;
  }
  get('population').value = network.users.length;
  get('move-tower').innerHTML = network.towers
    .map((t) => `<option value="${t.id}">${towerName(t.id)}</option>`)
    .join('');
  get('area-title').textContent = `${areaContext.name} · ${areaContext.period}`;
  const tests = network.users.reduce((sum, p) => sum + p.record.tests, 0);
  const slow = network.users.filter((p) => p.record.downKbps < 25000);
  get('area-evidence').textContent =
    `${network.users.length} locations · ${tests.toLocaleString()} tests · ${slow.length} below 25 Mbps${network.available > 500 ? ` · sampled from ${network.available} cells` : ''}`;
  get('area-report').href =
    'data:text/csv;charset=utf-8,' +
    encodeURIComponent(
      areaCsv(areaContext, network, working, current, {
        layout: get('scenario').value,
        simulated_connected: current.connected,
        simulated_out_of_range: current.outOfRange,
        simulated_capacity_blocked: current.congested,
        strategy,
        focus_area: selectedRegion === null ? 'whole' : regionNames[selectedRegion],
        focus_connected: countConnected(current, focusIds()),
        focus_locations: focusIds().length,
        before_connected: comparison?.before.connected ?? '',
        before_focus_connected: comparison ? countConnected(comparison.before, comparison.ids) : '',
        range_extension_percent: get('boost').value,
        grid_power_off: get('grid-outage').checked,
        backup_hours: get('backup-hours').value,
        elapsed_hours: get('outage-hours').value
      })
    );
}
document.addEventListener('area-scenario', (event) => {
  areaContext = event.detail;
  selectedRegion = selectedPoint = null;
  get('power-settings').reset();
  get('planning-settings').reset();
  get('scenario').value = 'town';
  get('capacity').value = Math.max(1, Math.ceil(Math.min(500, areaContext.records.length) / 4));
  get('area-reach').value = 5;
  get('ranges').checked = false;
  get('users').checked = true;
  strategy = 'none';
  network = makeArea(
    areaContext.records,
    areaContext.bounds,
    Number(get('capacity').value),
    'town',
    5
  );
  get('relay-range').value = 5;
  render();
});
get('area-reach').onchange = updateSettings;
get('inspect-point').onclick = () => {
  const point = network.users[selectedPoint];
  if (point) document.dispatchEvent(new CustomEvent('inspect-location', { detail: point.record }));
};

get('place-tower').onclick = () => {
  const point = network.users[selectedPoint];
  const tower = network.towers[Number(get('move-tower').value)];
  if (!point || !tower) return;
  tower.x = point.x;
  tower.y = point.y;
  render();
};

function showView(view) {
  const scenarios = view === 'scenarios';
  get('scenarios').hidden = !scenarios;
  get('measurements').hidden = scenarios;
  document
    .querySelectorAll('[data-view]')
    .forEach((link) =>
      link.setAttribute('aria-current', link.dataset.view === view ? 'page' : 'false')
    );
  document.dispatchEvent(new CustomEvent('view-changed', { detail: view }));
}
document.querySelectorAll('[data-view]').forEach((link) => {
  link.onclick = () => showView(link.dataset.view);
});
window.addEventListener('hashchange', () =>
  showView(location.hash === '#measurements' || !location.hash ? 'measurements' : 'scenarios')
);
showView(location.hash && location.hash !== '#measurements' ? 'scenarios' : 'measurements');
document.addEventListener('area-scenario', () => {
  showView('scenarios');
  location.hash = 'scenarios';
});
document.addEventListener('inspect-location', () => {
  showView('measurements');
  location.hash = 'measurements';
});

document.querySelectorAll('[data-layout]').forEach((button) => {
  button.onclick = () => {
    const layout = button.dataset.layout;
    get('scenario').value = layout;
    get('power-settings').reset();
    get('planning-settings').reset();
    get('boost').value = 35;
    get('users').checked = true;
    get('optimization-limit').value = 35;
    selectedRegion = selectedPoint = null;
    strategy = 'none';
    if (areaContext) {
      get('capacity').value =
        layout === 'single'
          ? Math.min(200, areaContext.records.length)
          : Math.ceil(Math.min(500, areaContext.records.length) / 4);
      network = makeArea(
        areaContext.records,
        areaContext.bounds,
        Number(get('capacity').value),
        layout,
        Number(get('area-reach').value)
      );
      get('relay-range').value = 5;
    } else {
      get('population').value = layout === 'single' ? 80 : 180;
      get('capacity').value = layout === 'single' ? 100 : 40;
      network = makeNetwork(layout, Number(get('population').value), Number(get('capacity').value));
    }
    render();
  };
});
function showChanges(message) {
  const ids = comparison.ids;
  const before = countConnected(comparison.before, ids);
  const after = countConnected(current, ids);
  const noun = areaContext ? 'locations' : 'users';
  const rest = network.users.length - ids.length;
  get('optimization-summary').textContent =
    message ||
    `${after - before >= 0 ? '+' : ''}${after - before} ${noun} connected ${selectedRegion === null ? 'overall' : 'here'}. ${ids.length - after} disconnected.`;
  get('area-changes').innerHTML =
    `<tr><td>${selectedRegion === null ? 'Whole area' : regionNames[selectedRegion]}</td><td>${before}/${ids.length}</td><td>${after}/${ids.length}</td></tr>` +
    (selectedRegion !== null
      ? `<tr><td>Other areas</td><td>${comparison.before.connected - before}/${rest}</td><td>${current.connected - after}/${rest}</td></tr><tr><td>Total</td><td>${comparison.before.connected}/${network.users.length}</td><td>${current.connected}/${network.users.length}</td></tr>`
      : '');
  const lostElsewhere = comparison.before.connected - before - (current.connected - after);
  if (selectedRegion !== null && lostElsewhere > 0)
    get('optimization-summary').textContent +=
      ` Other areas lose ${lostElsewhere} connections. Total: ${current.connected}/${network.users.length}.`;
  get('before-after').hidden = false;
  get('show-before').setAttribute('aria-pressed', viewBefore);
  get('show-after').setAttribute('aria-pressed', !viewBefore);
  get('comparison-caption').textContent = viewBefore
    ? 'Original'
    : `Range +${get('boost').value}% (assumed)`;
  drawMap();
}

function suggestNextStep() {
  const ids = focusIds();
  if (countConnected(current, ids) === ids.length) return;
  const extension = Number(get('boost').value);
  const repairs = rankRepairs(working, extension, priorityIds);
  const relay = network.towers.some((t) => t.temporary)
    ? null
    : findRelay(
        working,
        Number(get('relay-capacity').value),
        Number(get('relay-range').value) * (areaContext ? network.geography.pixelsPerKm : 1),
        extension,
        priorityIds
      );
  const options = repairs.map((repair) => ({ ...repair, kind: 'repair' }));
  if (relay) options.push({ ...relay, kind: 'relay' });
  const gain = (option) => (selectedRegion === null ? option.gain : option.focusGain);
  options.sort((a, b) => gain(b) - gain(a) || b.gain - a.gain || (a.kind === 'repair' ? -1 : 1));
  nextStep = options.find((option) => gain(option) > 0) || null;
  get('next-step').hidden = !nextStep;
  if (!nextStep) {
    get('optimization-summary').textContent +=
      ' No tested repair or relay improves this focus. Check assumptions below.';
    return;
  }
  const action =
    nextStep.kind === 'repair' ? 'Repair ' + towerName(nextStep.towerId) : 'Add a relay';
  get('next-step-note').textContent =
    `${action}: +${gain(nextStep)} connections ${selectedRegion === null ? 'overall' : 'here; +' + nextStep.gain + ' overall'}.`;
  get('try-next-step').hidden = false;
  get('undo-next-step').hidden = true;
  if (nextStep.kind === 'relay') {
    plan = { relay: nextStep };
    drawMap();
  }
}

get('optimize').onclick = () => {
  if (!get('optimization-limit').reportValidity()) {
    get('advanced').open = get('manual-recovery').open = true;
    return;
  }
  // Always compare with the same nearest-first baseline for these assumptions.
  const before = connectUsers(working);
  const ids = focusIds();
  priorityIds = selectedRegion === null ? [] : ids;
  const choice = improveConnections(working, Number(get('optimization-limit').value), priorityIds);
  comparison = {
    before,
    ids,
    network: { ...working, towers: working.towers.map((t) => ({ ...t })) }
  };
  nextStep = null;
  previewNetwork = null;
  viewBefore = false;
  get('boost').value = choice.extension;
  strategy = 'combined';
  render({ keepComparison: true });
  showChanges();
  suggestNextStep();
};
get('whole-area').onclick = () => {
  selectedRegion = selectedPoint = null;
  strategy = 'none';
  render();
};
get('show-before').onclick = () => {
  viewBefore = true;
  showChanges();
};
get('show-after').onclick = () => {
  viewBefore = false;
  showChanges();
};
get('try-next-step').onclick = () => {
  if (!nextStep) return;
  previewNetwork = network;
  network =
    nextStep.kind === 'relay'
      ? withRelay(network, nextStep)
      : {
          ...network,
          towers: network.towers.map((t) =>
            t.id === nextStep.towerId
              ? {
                  ...t,
                  active: true,
                  powerRestored: get('grid-outage').checked
                }
              : { ...t }
          )
        };
  viewBefore = false;
  render({ keepComparison: true });
  showChanges();
  get('try-next-step').hidden = true;
  get('undo-next-step').hidden = false;
  get('next-step-note').textContent =
    `Preview: ${nextStep.kind === 'relay' ? 'one powered relay added' : towerName(nextStep.towerId) + ' repaired'}. Use undo to remove it.`;
};
get('undo-next-step').onclick = () => {
  if (!previewNetwork) return;
  network = previewNetwork;
  previewNetwork = null;
  render({ keepComparison: true });
  showChanges();
  suggestNextStep();
};
get('optimization-limit').onchange = () => {
  comparison = null;
  get('before-after').hidden = true;
  get('next-step').hidden = true;
  nextStep = null;
  get('optimization-summary').textContent = 'Range limit changed. Click improve again.';
};
