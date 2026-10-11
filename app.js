import {makeNetwork, assignUsers, recoverNetwork, resultsCsv} from './model.js';

const element = id => document.getElementById(id);
const towerName = id => `T${id + 1}`;
const strategyNames = {
  none: 'No recovery', balanced: 'Reassignment',
  boost: 'Range extension', combined: 'Both'
};
let network = makeNetwork();
let strategy = 'none';
let current;
let selectedRegion = null;

function coverage(result) {
  return `${(100 * result.connected / network.users.length).toFixed(1)}%`;
}

function updateSettings() {
  if (!element('settings').reportValidity()) return;
  const previous = network.towers.map(tower => tower.active);
  network = makeNetwork(
    element('scenario').value,
    Number(element('population').value),
    Number(element('capacity').value)
  );
  network.towers.forEach((tower, id) => tower.active = previous[id]);
  render();
}

function toggleTower(id) {
  network.towers[id].active = !network.towers[id].active;
  render();
}

function render() {
  const extension = Number(element('boost').value);
  const healthy = assignUsers({
    ...network, towers: network.towers.map(tower => ({...tower, active: true}))
  });
  const outage = assignUsers(network);
  current = recoverNetwork(network, strategy, extension);
  element('boost-value').value = `${extension}%`;
  element('recovery-heading').textContent = strategy === 'none' ? 'Recovery' : strategyNames[strategy];

  const metrics = [
    ['Connected', result => `${result.connected} / ${network.users.length}`],
    ['Coverage', coverage],
    ['Out of range', result => result.outOfRange],
    ['Capacity blocked', result => result.congested]
  ];
  element('metrics').innerHTML = metrics.map(([label, value]) => `
    <tr><td>${label}</td><td>${value(healthy)}</td><td>${value(outage)}</td>
    <td>${strategy === 'none' ? '—' : value(current)}</td></tr>`).join('');

  element('tower-controls').innerHTML = network.towers.map(tower => `
    <tr><td>${towerName(tower.id)}</td><td>
    <button data-tower="${tower.id}" aria-label="Toggle tower ${towerName(tower.id)}"
      aria-pressed="${tower.active}">${tower.active ? 'on' : 'off'}</button>
    </td><td>${current.loads[tower.id]} / ${tower.capacity}</td></tr>`).join('');
  element('tower-controls').querySelectorAll('button').forEach(button => {
    button.onclick = () => toggleTower(Number(button.dataset.tower));
  });

  element('comparison').innerHTML = ['balanced', 'boost', 'combined'].map(key => {
    const result = recoverNetwork(network, key, extension);
    return `<tr><td>${strategyNames[key]}</td><td>${result.connected}</td>
      <td>${coverage(result)}</td><td>${result.multiplier.toFixed(2)}×</td></tr>`;
  }).join('');
  document.querySelectorAll('[data-strategy]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.strategy === strategy);
  });

  const failed = network.towers.filter(tower => !tower.active).length;
  const restored = current.connected - outage.connected;
  const remaining = [];
  if (current.outOfRange) remaining.push(`${current.outOfRange} out of range`);
  if (current.congested) remaining.push(`${current.congested} waiting for a free slot`);
  let message = strategy === 'none'
    ? `${current.connected} connected. ${failed} ${failed === 1 ? 'tower' : 'towers'} off.`
    : `${restored} reconnected. ${current.connected} connected in total.`;
  if (remaining.length) message += ` ${remaining.join('; ')}.`;
  if (failed === network.towers.length) message = 'All towers are off. Even the best algorithm needs a tower.';
  element('status').textContent = message;
  element('export').href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(resultsCsv(network, extension));
  drawMap();
}

function drawMap() {
  const ranges = element('ranges').checked ? network.towers
    .filter(tower => tower.active)
    .map(tower => `<circle cx="${tower.x}" cy="${tower.y}" r="${tower.range * current.multiplier}"
      fill="none" stroke="#bbb" stroke-dasharray="4 4"/>`).join('') : '';

  const lines = element('links').checked ? network.users.map(user => {
    const tower = network.towers[current.assignments[user.id]];
    if (!tower) return '';
    return `<path d="M${user.x} ${user.y}L${tower.x} ${tower.y}" stroke="#aaa" stroke-opacity=".4"/>`;
  }).join('') : '';

  const regions = Array.from({length: 32}, () => ({total: 0, connected: 0, outOfRange: 0}));
  for (const user of network.users) {
    const column = Math.min(7, Math.floor(user.x / 100));
    const row = Math.min(3, Math.floor(user.y / 110));
    const region = regions[row * 8 + column];
    region.total++;
    if (current.assignments[user.id] >= 0) region.connected++;
    else if (!network.towers.some(tower => tower.active &&
      Math.hypot(user.x - tower.x, user.y - tower.y) <= tower.range * current.multiplier)) region.outOfRange++;
  }

  const areas = regions.map((region, id) => {
    const x = id % 8 * 100;
    const y = Math.floor(id / 8) * 110;
    const missed = region.total - region.connected;
    return `<g class="region" data-region="${id}" tabindex="0" role="button"
      aria-label="Region ${id + 1}: ${region.connected} of ${region.total} connected"
      aria-pressed="${selectedRegion === id}">
      <rect class="region-border" x="${x + 1}" y="${y + 1}" width="98" height="108"
        fill="${region.total ? '#faf9f4' : '#fff'}" stroke="#d9d5ca" stroke-width=".7"/>
      ${missed ? `<rect x="${x + 3}" y="${y + 3}" width="94" height="104" fill="url(#missed)" opacity="${0.2 + missed / region.total * 0.6}"/>` : ''}
      <text class="region-count" x="${x + 88}" y="${y + 96}" text-anchor="end">${region.total ? `${region.connected}/${region.total}` : '–'}</text>
    </g>`;
  }).join('');

  const users = element('users').checked ? network.users.map(user => {
    const assigned = current.assignments[user.id];
    return `<circle class="user-dot" cx="${user.x}" cy="${user.y}" r="2.5"
      fill="${assigned >= 0 ? '#176b38' : '#bd2424'}" pointer-events="none"/>`;
  }).join('') : '';

  const towers = network.towers.map(tower => {
    const {x, y, id, active} = tower;
    const ink = active ? '#333' : '#ad3225';
    const symbol = `<g class="mast" stroke="${ink}" stroke-width="1.6" fill="none">
      <path d="M${x} ${y - 14}L${x - 9} ${y + 10}M${x} ${y - 14}L${x + 9} ${y + 10}M${x - 6} ${y + 3}H${x + 6}M${x - 4} ${y - 3}H${x + 4}"/>
      ${active ? `<path d="M${x - 9} ${y - 20}q-5 7 0 14M${x + 9} ${y - 20}q5 7 0 14"/>`
        : `<path d="M${x - 12} ${y - 18}L${x + 12} ${y + 9}"/>`}
    </g>`;
    return `<g class="tower" data-tower="${id}" tabindex="0" role="button"
      aria-label="${towerName(id)} on map" aria-pressed="${active}">
      <title>${towerName(id)}: ${active ? `${current.loads[id]} of ${tower.capacity} slots used. Click to switch off.` : 'off. Click to bring it back.'}</title>
      <rect x="${x - 19}" y="${y - 20}" width="38" height="49" fill="#fffefb"/>
      ${symbol}<text x="${x}" y="${y + 21}" text-anchor="middle" font-size="22" font-weight="700">${towerName(id)}</text></g>`;
  }).join('');

  const pattern = `<defs><pattern id="missed" width="7" height="7" patternUnits="userSpaceOnUse">
    <path d="M-1 1L1-1M0 7L7 0M6 8L8 6" stroke="#b95742" stroke-width=".6"/>
  </pattern></defs>`;
  element('map').innerHTML = pattern + areas + ranges + lines + users + towers;
  function inspectRegion(id) {
    selectedRegion = id;
    drawMap();
  }
  element('map').querySelectorAll('.region').forEach(region => {
    region.onclick = () => inspectRegion(Number(region.dataset.region));
    region.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const id = Number(region.dataset.region);
        inspectRegion(id);
        element('map').querySelector(`[data-region="${id}"]`).focus();
      }
    };
  });
  if (selectedRegion !== null) {
    const area = regions[selectedRegion];
    const blocked = area.total - area.connected - area.outOfRange;
    element('region-detail').textContent = `Region ${selectedRegion + 1}: ${area.connected}/${area.total} connected. ${area.outOfRange} out of range; ${blocked} capacity blocked.`;
  } else {
    element('region-detail').textContent = 'Select a region to inspect it.';
  }
  element('map').querySelectorAll('.tower').forEach(tower => {
    tower.onclick = () => toggleTower(Number(tower.dataset.tower));
    tower.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const id = Number(tower.dataset.tower);
        toggleTower(id);
        element('map').querySelector(`[data-tower="${id}"]`).focus();
      }
    };
  });
}

element('settings').onsubmit = event => {
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
  network.towers.forEach(tower => tower.active = tower.id !== 2);
  strategy = 'none';
  render();
};
element('restore').onclick = () => {
  network.towers.forEach(tower => tower.active = true);
  strategy = 'none';
  render();
};
element('reset-scenario').onclick = () => {
  element('settings').reset();
  element('boost').value = 35;
  element('links').checked = false;
  element('ranges').checked = false;
  element('users').checked = false;
  selectedRegion = null;
  network = makeNetwork();
  strategy = 'none';
  render();
};
document.querySelectorAll('[data-strategy]').forEach(button => {
  button.onclick = () => {
    strategy = button.dataset.strategy;
    render();
  };
});
render();
