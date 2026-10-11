import {
  makeNetwork,
  assignUsers,
  recoverNetwork,
  resultsCsv,
  rankRepairs,
  rangeSweep,
  planRelay,
  withRelay,
  planningCsv
} from './model.js';

const element = (id) => document.getElementById(id);
const towerName = (id) => (network.towers[id]?.temporary ? 'Relay' : `T${id + 1}`);
const strategyNames = {
  none: 'No recovery',
  balanced: 'Reassignment',
  boost: 'Range extension',
  combined: 'Both'
};
const mapGrid = { columns: 4, rows: 3, width: 800, height: 440 };
const cellWidth = mapGrid.width / mapGrid.columns;
const cellHeight = mapGrid.height / mapGrid.rows;

let network = makeNetwork();
let strategy = 'none';
let current;
let selectedRegion = null;
let plan = null;

function coverage(result) {
  return `${((100 * result.connected) / network.users.length).toFixed(1)}%`;
}

function updateSettings() {
  if (!element('settings').reportValidity()) return;
  // Editing the scenario should not silently bring failed towers back online.
  const towerStates = network.towers.map((tower) => tower.active);
  network = makeNetwork(
    element('scenario').value,
    Number(element('population').value),
    Number(element('capacity').value)
  );
  network.towers.forEach((tower, id) => (tower.active = towerStates[id]));
  render();
}

function toggleTower(id) {
  network.towers[id].active = !network.towers[id].active;
  render();
}

function render() {
  plan = null;
  element('planning-results').hidden = true;
  element('planning-note').textContent =
    'Compare options for the current outage. Previous plans are cleared when the scenario changes.';
  element('remove-relay').hidden = !network.towers.some((tower) => tower.temporary);
  const extension = Number(element('boost').value);
  const healthy = assignUsers({
    ...network,
    towers: network.towers
      .filter((tower) => !tower.temporary)
      .map((tower) => ({ ...tower, active: true }))
  });
  const outage = assignUsers({
    ...network,
    towers: network.towers.filter((tower) => !tower.temporary)
  });
  current = recoverNetwork(network, strategy, extension);
  element('boost-value').value = `${extension}%`;
  element('recovery-heading').textContent = network.towers.some((tower) => tower.temporary)
    ? `Relay + ${strategyNames[strategy]}`
    : strategy === 'none'
      ? 'Recovery'
      : strategyNames[strategy];

  renderMetrics(healthy, outage);
  renderTowerTable();
  renderComparison(extension);
  renderStatus(outage);

  element('export').href =
    'data:text/csv;charset=utf-8,' + encodeURIComponent(resultsCsv(network, extension));
  drawMap();
}

function renderMetrics(healthy, outage) {
  const metrics = [
    ['Connected', (result) => `${result.connected} / ${network.users.length}`],
    ['Coverage', coverage],
    ['Out of range', (result) => result.outOfRange],
    ['Capacity blocked', (result) => result.congested]
  ];
  element('metrics').innerHTML = metrics
    .map(
      ([label, value]) => `
    <tr><td>${label}</td><td>${value(healthy)}</td><td>${value(outage)}</td>
    <td>${strategy === 'none' && !network.towers.some((tower) => tower.temporary) ? '—' : value(current)}</td></tr>`
    )
    .join('');
}

function renderTowerTable() {
  element('tower-controls').innerHTML = network.towers
    .map(
      (tower) => `
    <tr><td>${towerName(tower.id)}</td><td>
    <button data-tower="${tower.id}" aria-label="Toggle tower ${towerName(tower.id)}"
      aria-pressed="${tower.active}">${tower.active ? 'on' : 'off'}</button>
    </td><td>${current.loads[tower.id]} / ${tower.capacity}</td></tr>`
    )
    .join('');
  element('tower-controls')
    .querySelectorAll('button')
    .forEach((button) => {
      button.onclick = () => toggleTower(Number(button.dataset.tower));
    });
}

function renderComparison(extension) {
  element('comparison').innerHTML = ['balanced', 'boost', 'combined']
    .map((key) => {
      const result = recoverNetwork(network, key, extension);
      return `<tr><td>${strategyNames[key]}</td><td>${result.connected}</td>
      <td>${coverage(result)}</td><td>${result.multiplier.toFixed(2)}×</td></tr>`;
    })
    .join('');
  document.querySelectorAll('[data-strategy]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.strategy === strategy);
  });
}

function renderStatus(outage) {
  const failed = network.towers.filter((tower) => !tower.active).length;
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
  element('status').textContent = message;
}

function summarizeRegions() {
  const regions = Array.from({ length: mapGrid.columns * mapGrid.rows }, () => ({
    total: 0,
    connected: 0,
    outOfRange: 0
  }));
  for (const user of network.users) {
    const column = Math.min(mapGrid.columns - 1, Math.floor(user.x / cellWidth));
    const row = Math.min(mapGrid.rows - 1, Math.floor(user.y / cellHeight));
    const region = regions[row * mapGrid.columns + column];
    region.total++;
    if (current.assignments[user.id] >= 0) region.connected++;
    else if (
      !network.towers.some(
        (tower) =>
          tower.active &&
          Math.hypot(user.x - tower.x, user.y - tower.y) <= tower.range * current.multiplier
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
      aria-label="Region ${id + 1}: ${region.connected} of ${region.total} connected"
      aria-pressed="${selectedRegion === id}">
      <rect class="region-border" x="${x + 1}" y="${y + 1}" width="${cellWidth - 2}" height="${cellHeight - 2}"
        fill="${region.total ? '#faf9f4' : '#fff'}" stroke="#d9d5ca" stroke-width=".7"/>
      ${missed ? `<rect x="${x + 3}" y="${y + 3}" width="${cellWidth - 6}" height="${cellHeight - 6}" fill="url(#missed)" opacity="${0.2 + (missed / region.total) * 0.6}"/>` : ''}
      ${missed ? `<text class="region-count" x="${x + 12}" y="${y + (id < mapGrid.columns ? 25 : cellHeight - 17)}">${missed} disconnected</text>` : ''}
    </g>`;
    })
    .join('');
}

function drawMap() {
  const ranges = element('ranges').checked
    ? network.towers
        .filter((tower) => tower.active)
        .map(
          (
            tower
          ) => `<circle cx="${tower.x}" cy="${tower.y}" r="${tower.range * current.multiplier}"
      fill="none" stroke="#bbb" stroke-dasharray="4 4" pointer-events="none"/>`
        )
        .join('')
    : '';

  const lines = element('links').checked
    ? network.users
        .map((user) => {
          const tower = network.towers[current.assignments[user.id]];
          if (!tower) return '';
          return `<path d="M${user.x} ${user.y}L${tower.x} ${tower.y}" stroke="#aaa" stroke-opacity=".4" pointer-events="none"/>`;
        })
        .join('')
    : '';

  const regions = summarizeRegions();
  const areas = regionMarkup(regions);

  const users = element('users').checked
    ? network.users
        .map((user) => {
          const assigned = current.assignments[user.id];
          return `<circle class="user-dot" cx="${user.x}" cy="${user.y}" r="2.5"
      fill="${assigned >= 0 ? '#176b38' : '#bd2424'}" pointer-events="none"/>`;
        })
        .join('')
    : '';

  const towers = network.towers
    .map((tower) => {
      const { x, y, id, active } = tower;
      const ink = active ? '#333' : '#ad3225';
      return `<g class="tower" data-tower="${id}" tabindex="0" role="button"
      aria-label="${towerName(id)} on map" aria-pressed="${active}">
      <title>${towerName(id)}: ${active ? `${current.loads[id]} of ${tower.capacity} slots used. Click to switch off.` : 'off. Click to bring it back.'}</title>
      <circle cx="${x}" cy="${y}" r="20" fill="${active ? '#fffefb' : '#ad3225'}" stroke="${ink}" stroke-width="2"/>
      <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="${tower.temporary ? 12 : 18}" fill="${active ? '#111' : '#fff'}">${towerName(id)}</text></g>`;
    })
    .join('');

  const pattern = `<defs><pattern id="missed" width="7" height="7" patternUnits="userSpaceOnUse">
    <path d="M-1 1L1-1M0 7L7 0M6 8L8 6" stroke="#b95742" stroke-width=".6"/>
  </pattern></defs>`;
  const candidate = plan?.relay;
  const marker =
    candidate && candidate.gain > 0
      ? `<g pointer-events="none"><path d="M${candidate.x - 10} ${candidate.y}h20M${candidate.x} ${candidate.y - 10}v20" stroke="#000080" stroke-width="3"/><text x="${candidate.x + 12}" y="${Math.max(15, candidate.y - 34)}" font-size="12" fill="#000080">relay candidate</text></g>`
      : '';
  element('map').innerHTML = pattern + areas + ranges + lines + users + towers + marker;
  if (selectedRegion !== null) {
    const area = regions[selectedRegion];
    const blocked = area.total - area.connected - area.outOfRange;
    element('region-detail').textContent =
      `Region ${selectedRegion + 1}: ${area.connected}/${area.total} connected. ${area.outOfRange} out of range; ${blocked} capacity blocked.`;
  } else {
    element('region-detail').textContent = 'Select a region to inspect it.';
  }
}

function activateMapItem(item) {
  if (item.dataset.tower !== undefined) {
    toggleTower(Number(item.dataset.tower));
  } else {
    selectedRegion = Number(item.dataset.region);
    drawMap();
  }
}

element('map').onclick = (event) => {
  const item = event.target.closest('[data-tower], [data-region]');
  if (item) activateMapItem(item);
};
element('map').onkeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const item = event.target.closest('[data-tower], [data-region]');
  if (!item) return;
  event.preventDefault();
  const selector =
    item.dataset.tower !== undefined
      ? `[data-tower="${item.dataset.tower}"]`
      : `[data-region="${item.dataset.region}"]`;
  activateMapItem(item);
  // Rendering replaces the focused SVG group.
  element('map').querySelector(selector).focus();
};

element('settings').onsubmit = (event) => {
  event.preventDefault();
  updateSettings();
};
element('scenario').onchange = updateSettings;
element('population').onchange = updateSettings;
element('capacity').onchange = updateSettings;
element('links').onchange = drawMap;
element('ranges').onchange = drawMap;
element('users').onchange = drawMap;
element('boost').oninput = render;
element('example').onclick = () => {
  network.towers.forEach((tower) => (tower.active = tower.id !== 2));
  strategy = 'none';
  render();
};
element('restore').onclick = () => {
  network.towers = network.towers.filter((tower) => !tower.temporary);
  network.towers.forEach((tower) => (tower.active = true));
  strategy = 'none';
  render();
};
element('reset-scenario').onclick = () => {
  element('settings').reset();
  element('planning-settings').reset();
  element('boost').value = 35;
  element('links').checked = false;
  element('ranges').checked = false;
  element('users').checked = false;
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

element('planning-settings').onsubmit = (event) => {
  event.preventDefault();
  const extension = Number(element('boost').value);
  const repairs = rankRepairs(network, extension);
  const sweep = rangeSweep(network);
  const bestCoverage = Math.max(...sweep.map((point) => point.connected));
  const range = sweep.find((point) => point.connected === bestCoverage);
  const relay = network.towers.some((tower) => tower.temporary)
    ? null
    : planRelay(
        network,
        Number(element('relay-capacity').value),
        Number(element('relay-range').value),
        extension
      );
  plan = { repairs, sweep, range, relay };
  element('planning-results').hidden = false;
  element('planning-note').textContent =
    `Gains are compared with reassignment at ${extension}% extension: ${recoverNetwork(network, 'combined', extension).connected}/${network.users.length} connected. Options are tested independently; gains cannot be added together.`;
  element('repair-ranking').innerHTML = repairs.length
    ? repairs
        .map(
          (repair) =>
            `<tr><td>${towerName(repair.towerId)}</td><td>${repair.connected}</td><td>+${repair.gain}</td><td><button data-repair="${repair.towerId}">repair</button></td></tr>`
        )
        .join('')
    : '<tr><td colspan="4">No failed towers to repair.</td></tr>';
  element('range-advice').textContent =
    `${range.extension}% is the smallest tested extension that reaches the best result in the 0–100% sweep: ${range.connected}/${network.users.length} connected. ${range.outOfRange} remain out of range; ${range.congested} capacity blocked.`;
  element('range-sweep').innerHTML = sweep
    .map(
      (point) =>
        `<tr><td>${point.extension}%</td><td>${point.connected}</td><td>${point.outOfRange}</td><td>${point.congested}</td></tr>`
    )
    .join('');
  element('relay-advice').textContent = relay
    ? `Best tested relay location: (${relay.x}, ${relay.y}). ${relay.capacity} slots, ${relay.range} reach before extension. ${relay.connected}/${network.users.length} connected, ${relay.gain} more than reassignment with the current extension.`
    : 'A temporary relay is already in this scenario. Remove it to search for a new location.';
  element('apply-relay').disabled = !relay || relay.gain === 0;
  element('planning-export').href =
    'data:text/csv;charset=utf-8,' +
    encodeURIComponent(planningCsv(repairs, sweep, relay, extension));
  drawMap();
};
element('repair-ranking').onclick = (event) => {
  const button = event.target.closest('[data-repair]');
  if (!button || !plan) return;
  network.towers[Number(button.dataset.repair)].active = true;
  strategy = 'combined';
  render();
};
element('apply-range').onclick = () => {
  if (!plan) return;
  element('boost').value = plan.range.extension;
  strategy = 'combined';
  render();
};
element('apply-relay').onclick = () => {
  if (!plan?.relay) return;
  network = withRelay(network, plan.relay);
  strategy = 'combined';
  render();
};
element('remove-relay').onclick = () => {
  network.towers = network.towers.filter((tower) => !tower.temporary);
  render();
};
element('relay-capacity').onchange = () => {
  plan = null;
  element('planning-results').hidden = true;
  drawMap();
};
element('relay-range').onchange = element('relay-capacity').onchange;
