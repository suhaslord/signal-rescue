import { areaScenario, scenarioReport } from './area-scenario.js';
import {
  makeNetwork,
  assignUsers,
  recoverNetwork,
  resultsCsv,
  rankRepairs,
  rangeSweep,
  planRelay,
  withRelay,
  planningCsv,
  powerOutage,
  powerTimeline,
  optimizeConnections
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
let operating = network;
let areaContext = null;
let selectedPoint = null;

function coverage(result) {
  return `${((100 * result.connected) / network.users.length).toFixed(1)}%`;
}

function updateSettings() {
  if (!element('settings').reportValidity()) return;
  // Editing the scenario should not silently bring failed towers back online.
  const previous = network;
  const towerStates = network.towers.map((tower) => tower.active);
  network = areaContext
    ? areaScenario(
        areaContext.records,
        areaContext.bounds,
        Number(element('capacity').value),
        element('scenario').value,
        Number(element('area-reach').value)
      )
    : makeNetwork(
        element('scenario').value,
        Number(element('population').value),
        Number(element('capacity').value)
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

function render() {
  operating = element('grid-outage').checked
    ? powerOutage(
        network,
        Number(element('outage-hours').value),
        Number(element('backup-hours').value)
      )
    : network;
  plan = null;
  element('planning-results').hidden = true;
  element('planning-note').textContent = 'Compare again after changing the scenario.';
  element('optimization-summary').textContent = 'Ready to optimize this scenario.';
  document.querySelectorAll('[data-layout]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.layout === element('scenario').value);
    button.disabled = !!areaContext && button.dataset.layout === 'crowd';
  });
  element('scenario-caption').textContent = areaContext
    ? 'Using measured locations from your selected area; towers are assumed.'
    : {
        town: 'Five towers across a town.',
        rural: 'Five towers along a rural route.',
        single: 'One tower serving nearby users.',
        crowd: 'Most users gathered near the centre.'
      }[element('scenario').value];
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
    towers: operating.towers.filter((tower) => !tower.temporary)
  });
  current = recoverNetwork(operating, strategy, extension);
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
    'data:text/csv;charset=utf-8,' + encodeURIComponent(resultsCsv(operating, extension));
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
  element('metrics').innerHTML = metrics
    .map(
      ([label, value]) => `
    <tr><td>${label}</td><td>${value(healthy)}</td><td>${value(outage)}</td>
    <td>${strategy === 'none' && !network.towers.some((tower) => tower.temporary) ? '—' : value(current)}</td></tr>`
    )
    .join('');
}

function renderTowerTable() {
  element('tower-controls').innerHTML = operating.towers
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
      const result = recoverNetwork(operating, key, extension);
      return `<tr><td>${strategyNames[key]}</td><td>${result.connected}</td>
      <td>${coverage(result)}</td><td>${result.multiplier.toFixed(2)}×</td></tr>`;
    })
    .join('');
  document.querySelectorAll('[data-strategy]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.strategy === strategy);
  });
}

function renderStatus(outage) {
  const failed = operating.towers.filter((tower) => !tower.active).length;
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
      !operating.towers.some(
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
    ? operating.towers
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
  const areas = areaContext ? measuredMarkup() : regionMarkup(regions);

  const users = element('users').checked
    ? network.users
        .map((user) => {
          const assigned = current.assignments[user.id];
          return `<circle class="user-dot" cx="${user.x}" cy="${user.y}" r="2.5"
      fill="${assigned >= 0 ? '#176b38' : '#bd2424'}" pointer-events="none"/>`;
        })
        .join('')
    : '';

  const towers = operating.towers
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
  if (areaContext) {
    const point = network.users[selectedPoint];
    element('region-detail').textContent = point
      ? `Measured ${(point.record.downKbps / 1000).toFixed(1)} Mbps download · ${point.record.tests} tests. Scenario: ${current.assignments[point.id] >= 0 ? 'connected to T' + (current.assignments[point.id] + 1) : 'disconnected'}. ${point.record.lat.toFixed(4)}, ${point.record.lon.toFixed(4)}.`
      : 'Select a measured location for its observed speed and simulated connection.';
    element('point-actions').hidden = !point;
    element('inspect-point').hidden = !point;
  } else if (selectedRegion !== null) {
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
  } else if (item.dataset.point !== undefined) {
    selectedPoint = Number(item.dataset.point);
    drawMap();
  } else {
    selectedRegion = Number(item.dataset.region);
    drawMap();
  }
}

element('map').onclick = (event) => {
  const item = event.target.closest('[data-tower], [data-region], [data-point]');
  if (item) activateMapItem(item);
};
element('map').onkeydown = (event) => {
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
  network.towers.forEach(
    (tower) => (tower.active = tower.id !== (network.towers.length === 1 ? 0 : 2))
  );
  strategy = 'none';
  render();
};
element('restore').onclick = () => {
  network.towers = network.towers.filter((tower) => !tower.temporary);
  element('grid-outage').checked = false;
  network.towers.forEach((tower) => {
    tower.active = true;
    tower.powerRestored = false;
  });
  strategy = 'none';
  render();
};
element('reset-scenario').onclick = () => {
  areaContext = null;
  selectedPoint = null;
  element('settings').reset();
  element('planning-settings').reset();
  element('power-settings').reset();
  element('boost').value = 35;
  element('optimization-limit').value = 35;
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
  const repairs = rankRepairs(operating, extension);
  const sweep = rangeSweep(operating);
  const bestCoverage = Math.max(...sweep.map((point) => point.connected));
  const range = sweep.find((point) => point.connected === bestCoverage);
  const relay = network.towers.some((tower) => tower.temporary)
    ? null
    : planRelay(
        operating,
        Number(element('relay-capacity').value),
        Number(element('relay-range').value) * (areaContext ? network.geography.pixelsPerKm : 1),
        extension
      );
  plan = { repairs, sweep, range, relay };
  element('planning-results').hidden = false;
  element('planning-note').textContent =
    `Baseline: ${recoverNetwork(operating, 'combined', extension).connected}/${network.users.length}, reassignment + ${extension}% range. Compare options separately; don’t add gains.`;
  element('repair-ranking').innerHTML = repairs.length
    ? repairs
        .map(
          (repair) =>
            `<tr><td>${towerName(repair.towerId)}</td><td>${repair.connected}</td><td>+${repair.gain}</td><td><button data-repair="${repair.towerId}">repair</button></td></tr>`
        )
        .join('')
    : '<tr><td colspan="4">No failed towers to repair.</td></tr>';
  element('range-advice').textContent =
    `Best tested: ${range.connected}/${network.users.length} at ${range.extension}% (smallest matching extension). ${range.outOfRange} out of range; ${range.congested} capacity blocked.`;
  element('range-sweep').innerHTML = sweep
    .map(
      (point) =>
        `<tr><td>${point.extension}%</td><td>${point.connected}</td><td>${point.outOfRange}</td><td>${point.congested}</td></tr>`
    )
    .join('');
  element('relay-advice').textContent = relay
    ? `Relay at (${relay.x}, ${relay.y}): ${relay.connected}/${network.users.length}, +${relay.gain}. ${relay.capacity} slots; ${areaContext ? (relay.range / network.geography.pixelsPerKm).toFixed(1) + ' km assumed reach' : relay.range + ' reach'} before extension.`
    : 'Remove the current relay to search again.';
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
  network.towers[Number(button.dataset.repair)].powerRestored = element('grid-outage').checked;
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

function renderPower() {
  const enabled = element('grid-outage').checked;
  element('outage-hours-value').value = `${element('outage-hours').value} h`;
  element('power-summary').textContent = enabled
    ? `${operating.towers.filter((tower) => tower.active).length} towers powered. Repairs restore power; relays have independent power.`
    : 'Backup duration is an assumption, not measured tower data.';
  element('power-history').hidden = !enabled;
  if (!enabled) return;
  const points = powerTimeline(
    network,
    Number(element('backup-hours').value),
    strategy,
    Number(element('boost').value)
  );
  element('power-rows').innerHTML = points
    .map(
      (point) =>
        `<tr><td>${point.hours}</td><td>${point.active}</td><td>${point.connected}</td></tr>`
    )
    .join('');
  const csv =
    'hours,powered_towers,connected,backup_hours\n' +
    points
      .map((point) =>
        [point.hours, point.active, point.connected, element('backup-hours').value].join(',')
      )
      .join('\n') +
    '\n';
  element('power-export').href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
}
element('power-settings').onsubmit = (event) => {
  event.preventDefault();
  if (element('power-settings').reportValidity()) render();
};
element('grid-outage').onchange = () => {
  network.towers.forEach((tower) => {
    tower.powerRestored = false;
  });
  render();
};
element('backup-hours').onchange = () => {
  if (element('power-settings').reportValidity()) render();
};
element('outage-hours').oninput = render;

function measuredMarkup() {
  const project = network.geography.project;
  const cells = network.users
    .map((point) => {
      const [w, s, e, n] = point.record.bounds;
      const a = project(w, n),
        b = project(e, s);
      const disconnected = current.assignments[point.id] < 0;
      const speed = point.record.downKbps / 1000;
      const fill = speed < 12.5 ? '#b54a36' : speed < 25 ? '#b99547' : '#547b71';
      return `<g data-point="${point.id}" tabindex="0" role="button" aria-label="Measured location ${point.id + 1}: ${speed.toFixed(1)} Mbps, scenario ${disconnected ? 'disconnected' : 'connected'}">
      <rect x="${a.x}" y="${a.y}" width="${Math.max(3, b.x - a.x)}" height="${Math.max(3, b.y - a.y)}" fill="${fill}" opacity=".7" />
      ${disconnected ? `<path d="M${point.x - 4} ${point.y - 4}l8 8m-8 0l8-8" stroke="#111" stroke-width="1.5"/>` : ''}
      <title>${speed.toFixed(1)} Mbps observed; ${point.record.tests} tests. ${disconnected ? 'Disconnected' : 'Connected'} in scenario.</title>
    </g>`;
    })
    .join('');
  const [w, s, e, n] = areaContext.bounds;
  return (
    cells +
    `<g pointer-events="none" font-size="11" fill="#555"><text x="8" y="16">${n.toFixed(3)}° N · ${w.toFixed(3)}° E</text><text x="792" y="434" text-anchor="end">${s.toFixed(3)}° N · ${e.toFixed(3)}° E</text><text x="8" y="434">${network.geography.widthKm.toFixed(1)} km across · assumed towers</text></g>`
  );
}
function renderAreaContext() {
  element('area-context').hidden = !areaContext;
  element('reach-label').hidden = !areaContext;
  element('population').disabled = !!areaContext;
  element('scenario').querySelector('option[value=crowd]').disabled = !!areaContext;
  element('repair-unit').textContent = areaContext ? 'Additional locations' : 'Additional users';
  element('relay-unit').textContent = areaContext ? ' (km)' : '';
  element('relay-range').min = areaContext ? '0.1' : '25';
  element('relay-range').max = areaContext ? '100' : '300';
  element('relay-range').step = areaContext ? '0.1' : '1';
  element('planner-limits').textContent = areaContext
    ? 'Assumed reach in km, ignoring terrain and interference. Relay needs power and backhaul. Compare options separately.'
    : 'Simulated reach, not metres. Relay needs power and backhaul. Options use reassignment; repairs and relay use the current extension.';
  element('point-label').textContent = areaContext ? 'Locations' : 'Users';
  element('example').textContent =
    network.towers.length === 1 ? 'disable tower' : 'disable center tower';
  element('scenario-legend').textContent = areaContext
    ? 'Tile colors: measured download speed (<12.5 / 12.5–25 / 25+ Mbps). ×: disconnected in the scenario. T: assumed tower.'
    : 'Shading marks disconnected users. Click an area for counts or a tower to switch it.';
  if (!areaContext) {
    element('point-actions').hidden = true;
    element('inspect-point').hidden = true;
    return;
  }
  element('population').value = network.users.length;
  element('move-tower').innerHTML = network.towers
    .map((t) => `<option value="${t.id}">${towerName(t.id)}</option>`)
    .join('');
  element('area-title').textContent = `${areaContext.name} · ${areaContext.period}`;
  const tests = network.users.reduce((sum, p) => sum + p.record.tests, 0);
  const slow = network.users.filter((p) => p.record.downKbps < 25000);
  const lostSlow = slow.filter((p) => current.assignments[p.id] < 0).length;
  element('area-evidence').textContent =
    `${network.users.length} measured locations, ${tests.toLocaleString()} tests${network.available > 500 ? `; sampled from ${network.available} cells` : ''}. ${slow.length} recorded under 25 Mbps; ${lostSlow} of these are disconnected under the current assumptions.`;
  element('area-report').href =
    'data:text/csv;charset=utf-8,' +
    encodeURIComponent(
      scenarioReport(areaContext, network, operating, current, {
        layout: element('scenario').value,
        simulated_connected: current.connected,
        simulated_out_of_range: current.outOfRange,
        simulated_capacity_blocked: current.congested,
        strategy,
        range_extension_percent: element('boost').value,
        grid_power_off: element('grid-outage').checked,
        backup_hours: element('backup-hours').value,
        elapsed_hours: element('outage-hours').value
      })
    );
}
document.addEventListener('area-scenario', (event) => {
  areaContext = event.detail;
  selectedRegion = selectedPoint = null;
  element('power-settings').reset();
  element('planning-settings').reset();
  element('scenario').value = 'town';
  element('capacity').value = Math.max(1, Math.ceil(Math.min(500, areaContext.records.length) / 4));
  element('area-reach').value = 5;
  element('ranges').checked = true;
  strategy = 'none';
  network = areaScenario(
    areaContext.records,
    areaContext.bounds,
    Number(element('capacity').value),
    'town',
    5
  );
  element('relay-range').value = 5;
  render();
});
element('area-reach').onchange = updateSettings;
element('inspect-point').onclick = () => {
  const point = network.users[selectedPoint];
  if (point) document.dispatchEvent(new CustomEvent('inspect-location', { detail: point.record }));
};

element('place-tower').onclick = () => {
  const point = network.users[selectedPoint];
  const tower = network.towers[Number(element('move-tower').value)];
  if (!point || !tower) return;
  tower.x = point.x;
  tower.y = point.y;
  render();
};

function showView(view) {
  const scenarios = view === 'scenarios';
  element('scenarios').hidden = !scenarios;
  element('measurements').hidden = scenarios;
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
    element('scenario').value = layout;
    element('power-settings').reset();
    element('planning-settings').reset();
    element('boost').value = 35;
    element('users').checked = true;
    element('optimization-limit').value = 35;
    selectedRegion = selectedPoint = null;
    strategy = 'none';
    if (areaContext) {
      element('capacity').value =
        layout === 'single'
          ? Math.min(200, areaContext.records.length)
          : Math.ceil(Math.min(500, areaContext.records.length) / 4);
      network = areaScenario(
        areaContext.records,
        areaContext.bounds,
        Number(element('capacity').value),
        layout,
        Number(element('area-reach').value)
      );
      element('relay-range').value = 5;
    } else {
      element('population').value = layout === 'single' ? 80 : 180;
      element('capacity').value = layout === 'single' ? 100 : 40;
      network = makeNetwork(
        layout,
        Number(element('population').value),
        Number(element('capacity').value)
      );
    }
    render();
  };
});
element('optimize').onclick = () => {
  if (!element('optimization-limit').reportValidity()) {
    element('manual-recovery').open = true;
    return;
  }
  const choice = optimizeConnections(operating, Number(element('optimization-limit').value));
  element('boost').value = choice.extension;
  strategy = 'combined';
  render();
  const noun = areaContext ? 'locations' : 'users';
  element('optimization-summary').textContent =
    `${choice.before} → ${choice.connected} of ${network.users.length} ${noun} connected. Reassignment + ${choice.extension}% range increase. ${choice.outOfRange} out of range; ${choice.congested} capacity blocked.`;
  if (!operating.towers.some((t) => t.active))
    element('optimization-summary').textContent =
      '0 connected. No working tower; compare a repair or powered relay below.';
};
element('optimization-limit').onchange = () => {
  element('optimization-summary').textContent = 'Range limit changed. Optimize again.';
};
