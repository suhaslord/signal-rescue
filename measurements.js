import {
  metricValue,
  measurementSummary,
  compareMeasurements,
  measurementsCsv
} from './measurement-model.js';

const get = (id) => document.getElementById(id);
const colors = { slow: '#b54a36', middle: '#b99547', fast: '#547b71', small: '#b4b5ae' };
const map = L.map('measurement-map', {
  scrollWheelZoom: false,
  minZoom: 1,
  maxZoom: 18,
  zoomSnap: 0.25
});
map.fitBounds([
  [-60, -180],
  [75, 180]
]);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  noWrap: true,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
map.attributionControl.addAttribution(
  '<a href="https://github.com/teamookla/ookla-open-data">Speedtest by Ookla</a>'
);
const cells = L.layerGroup().addTo(map);
let data,
  records = [],
  level = 6,
  loadedQuery,
  selected;
let popupPanning = false;
let requestNumber = 0,
  debounce,
  loading = false;
const cache = new Map();

function viewQuery(period = get('measurement-quarter').value) {
  const b = map.getBounds();
  const level = Math.min(16, Math.floor(map.getZoom()) + 4);
  // Round bounds outward so small movements can reuse a cached response.
  const step = 360 / 2 ** level;
  const floor = (v) => Math.floor(v / step) * step;
  const ceil = (v) => Math.ceil(v / step) * step;
  const bounds = [
    Math.max(-180, floor(b.getWest())),
    Math.max(-85.1, floor(b.getSouth())),
    Math.min(180, ceil(b.getEast())),
    Math.min(85.1, ceil(b.getNorth()))
  ];
  return {
    period,
    level,
    bounds,
    url:
      '/api/tiles?' +
      new URLSearchParams({ period, level, bbox: bounds.map((v) => v.toFixed(6)).join(',') })
  };
}
async function queryData(query) {
  if (cache.has(query.url)) return cache.get(query.url);
  const response = await fetch(query.url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Measurements did not load.');
  cache.set(query.url, result);
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return result;
}
function detail(record) {
  const metric = get('measurement-metric').value;
  const unit = metric === 'latency' ? 'ms' : 'Mbps';
  const value = metricValue(record, metric);
  return `<strong>${value?.toFixed(1) ?? '—'} ${unit}</strong><br>Download ${metricValue(record, 'down')?.toFixed(1)} Mbps<br>Upload ${metricValue(record, 'up')?.toFixed(1)} Mbps<br>Delay ${metricValue(record, 'latency')?.toFixed(1)} ms<br>${record.tests.toLocaleString()} tests${record.devices ? ' · ' + record.devices + ' devices' : ''}<br>${record.lat.toFixed(3)}, ${record.lon.toFixed(3)}`;
}
function paint() {
  if (loading || !get('measurement-filters').reportValidity()) return;
  get('use-area').disabled =
    level !== 16 || !records.some((r) => r.tests >= Number(get('measurement-min-tests').value));
  get('area-hint').textContent =
    level === 16
      ? 'Use the visible measured locations in an outage scenario.'
      : 'Zoom into a local area first.';
  const metric = get('measurement-metric').value;
  const delay = metric === 'latency';
  const threshold = Number(get('measurement-threshold').value);
  const minimum = Number(get('measurement-min-tests').value);
  const unit = delay ? 'ms' : 'Mbps';
  get('threshold-unit').textContent = unit;
  get('threshold-direction').textContent = delay ? 'Slow above' : 'Slow below';
  const summary = measurementSummary(records, metric, minimum, threshold);
  get('measurement-summary').textContent = summary.tiles
    ? `${summary.flagged.toLocaleString()} of ${summary.tiles.toLocaleString()} measured areas ${delay ? 'above' : 'below'} ${threshold} ${unit}.`
    : records.length
      ? 'No cells meet your sample filter. Lower it to see more.'
      : 'No mobile measurements here for this quarter.';
  const ranges = delay
    ? [`over ${threshold} ms`, `${threshold / 2}–${threshold} ms`, `up to ${threshold / 2} ms`]
    : [`under ${threshold / 2} Mbps`, `${threshold / 2}–${threshold} Mbps`, `${threshold}+ Mbps`];
  get('measurement-scale').innerHTML =
    ['slow', 'middle', 'fast']
      .map(
        (key, i) =>
          `<span class="key"><span class="swatch" style="background:${colors[key]}"></span>${ranges[i]}</span>`
      )
      .join('') +
    `<span class="key">blank: ${minimum > 1 ? 'no data or filtered' : 'no data'}</span>`;
  get('measurement-resolution').textContent =
    level === 16
      ? 'Detailed tiles · about 610 m at the equator. Click a tile for its tests.'
      : `Regional averages · about ${Math.round(40075 / 2 ** level)} km at the equator. Zoom in for more detail.`;
  cells.clearLayers();
  get('measurement-detail').hidden = true;
  for (const record of records) {
    const value = metricValue(record, metric);
    const small = record.tests < minimum || value === null;
    if (small) continue;
    const bucket = delay
      ? value > threshold
        ? 'slow'
        : value > threshold / 2
          ? 'middle'
          : 'fast'
      : value < threshold / 2
        ? 'slow'
        : value < threshold
          ? 'middle'
          : 'fast';
    const [w, s, e, n] = record.bounds;
    const cell = L.rectangle(
      [
        [s, w],
        [n, e]
      ],
      { weight: 0, fillColor: colors[bucket], fillOpacity: level < 12 ? 0.5 : 0.72 }
    ).addTo(cells);
    cell.bindTooltip(`${value.toFixed(1)} ${unit} · ${record.tests.toLocaleString()} tests`);
    const select = () => {
      selected = record.quadkey;
      cell
        .bindPopup(
          detail(record) + (level < 16 ? '<br><button class=look-closer>look closer</button>' : ''),
          { autoPan: true }
        )
        .openPopup();
    };
    cell.on('click', select);
    const path = cell.getElement();
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute(
      'aria-label',
      `${value.toFixed(1)} ${unit}, ${record.tests} tests, ${record.lat.toFixed(3)}, ${record.lon.toFixed(3)}`
    );
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  }
  get('measurement-export').href =
    'data:text/csv;charset=utf-8,' + encodeURIComponent(measurementsCsv(records));
}
async function loadView() {
  if (!data) return;
  clearTimeout(debounce);
  const version = ++requestNumber;
  get('use-area').disabled = true;
  get('measurement-export').removeAttribute('href');
  get('measurement-retry').hidden = true;
  map.closePopup();
  get('measurement-compare').open = false;
  if (map.getZoom() < 5) {
    records = data.records.filter(
      (r) => r.region === 'world' && r.period === get('measurement-quarter').value
    );
    loading = false;
    level = 6;
    loadedQuery = null;
    paint();
    return;
  }
  loading = true;
  records = [];
  const query = viewQuery();
  cells.clearLayers();
  get('measurement-summary').textContent = 'Loading measurements for this area…';
  get('measurement-resolution').textContent = 'The first request can take a little longer.';
  try {
    const result = await queryData(query);
    if (version !== requestNumber) return;
    loading = false;
    records = result.records;
    level = result.level;
    loadedQuery = query;
    paint();
  } catch (error) {
    if (version !== requestNumber) return;
    loading = false;
    records = [];
    loadedQuery = null;
    get('measurement-summary').textContent = 'Could not load this area. Try again.';
    get('measurement-resolution').textContent = '';
    get('measurement-retry').hidden = false;
    console.warn('Area measurements unavailable', error.message);
  }
}
async function compare() {
  if (!get('measurement-compare').open) return;
  if (loading || !records.length) {
    get('measurement-comparison').textContent = 'Load this area first.';
    return;
  }
  const version = requestNumber;
  const metric = get('measurement-metric').value;
  const minimum = Number(get('measurement-min-tests').value);
  get('measurement-comparison').textContent = 'Loading the other quarter…';
  try {
    const periods = data.periods.map((p) => p.id);
    let before, after;
    if (loadedQuery) {
      const other = { ...loadedQuery, period: periods.find((p) => p !== loadedQuery.period) };
      other.url =
        '/api/tiles?' +
        new URLSearchParams({
          period: other.period,
          level: other.level,
          bbox: other.bounds.map((v) => v.toFixed(6)).join(',')
        });
      const result = await queryData(other);
      before = loadedQuery.period === periods[0] ? records : result.records;
      after = loadedQuery.period === periods[1] ? records : result.records;
    } else {
      before = data.records.filter((r) => r.region === 'world' && r.period === periods[0]);
      after = data.records.filter((r) => r.region === 'world' && r.period === periods[1]);
    }
    if (version !== requestNumber) return;
    const result = compareMeasurements(before, after, metric, minimum);
    get('measurement-comparison').textContent = result.matched
      ? `${periods[0]} → ${periods[1]}: median change ${result.medianChange >= 0 ? '+' : ''}${result.medianChange.toFixed(1)} ${metric === 'latency' ? 'ms' : 'Mbps'} across ${result.matched} matched cells. Different tests and devices; this doesn't prove an outage.`
      : 'No matching cells with enough tests in both quarters.';
  } catch {
    get('measurement-comparison').textContent =
      'The other quarter did not load. Close and reopen to retry.';
  }
}
map.on('popupopen', (event) => {
  const button = event.popup.getElement().querySelector('.look-closer');
  if (button)
    button.onclick = () => {
      const point = event.popup.getLatLng();
      map.stop();
      popupPanning = false;
      map.closePopup();
      map.setView(point, Math.min(14, Math.max(5, map.getZoom() + 3)), { animate: false });
      loadView();
    };
});
map.on('autopanstart', () => {
  popupPanning = true;
});
map.on('movestart', () => {
  if (!data || popupPanning) return;
  requestNumber++;
  loading = true;
  records = [];
  cells.clearLayers();
  get('use-area').disabled = true;
  get('measurement-export').removeAttribute('href');
  get('measurement-compare').open = false;
  get('measurement-summary').textContent = 'Loading measurements for this area…';
});
map.on('moveend', () => {
  if (popupPanning) {
    popupPanning = false;
    return;
  }
  clearTimeout(debounce);
  debounce = setTimeout(loadView, 500);
});
get('measurement-area').onchange = () => {
  const region = data.regions.find((r) => r.id === get('measurement-area').value);
  if (region.id === 'world')
    map.fitBounds([
      [-60, -180],
      [75, 180]
    ]);
  else {
    const [w, s, e, n] = region.bounds;
    map.setView([(s + n) / 2, (w + e) / 2], 12);
  }
};
get('measurement-home').onclick = () => {
  get('measurement-area').value = 'world';
  map.fitBounds([
    [-60, -180],
    [75, 180]
  ]);
};
get('measurement-quarter').onchange = loadView;
get('measurement-metric').onchange = () => {
  get('measurement-threshold').value = get('measurement-metric').value === 'latency' ? 100 : 25;
  get('measurement-compare').open = false;
  paint();
};
get('measurement-settings').onsubmit = (event) => event.preventDefault();
get('measurement-filters').onsubmit = (event) => {
  event.preventDefault();
  paint();
};
get('measurement-min-tests').onchange = () => {
  paint();
  if (get('measurement-compare').open) compare();
};
get('measurement-threshold').onchange = paint;
get('measurement-retry').onclick = loadView;
get('measurement-compare').ontoggle = compare;
try {
  const response = await fetch('./measurements.json');
  if (!response.ok) throw new Error('Missing snapshot');
  data = await response.json();
  get('measurement-area').disabled = false;
  get('measurement-quarter').innerHTML = data.periods
    .map((p) => `<option value="${p.id}">${p.id}</option>`)
    .join('');
  get('measurement-quarter').value = data.periods.at(-1).id;
  get('measurement-periods').textContent = data.periods.map((p) => p.id).join(' / ');
  await loadView();
} catch (error) {
  get('measurement-summary').textContent = 'Measurements did not load. Please reload.';
  console.error(error);
}

get('use-area').onclick = () => {
  if (loading || level !== 16 || !get('measurement-filters').reportValidity()) return;
  const minimum = Number(get('measurement-min-tests').value);
  const b = map.getBounds();
  const bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const visible = records.filter(
    (r) =>
      r.tests >= minimum &&
      r.lon >= bounds[0] &&
      r.lon <= bounds[2] &&
      r.lat >= bounds[1] &&
      r.lat <= bounds[3]
  );
  if (!visible.length) {
    get('area-hint').textContent = 'No qualifying locations inside this view.';
    return;
  }
  document.dispatchEvent(
    new CustomEvent('area-scenario', {
      detail: {
        records: visible,
        bounds,
        minimum,
        period: get('measurement-quarter').value,
        name:
          get('measurement-area').value === 'world'
            ? 'Selected area'
            : get('measurement-area').selectedOptions[0].textContent
      }
    })
  );
  get('area-context').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
document.addEventListener('inspect-location', (event) => {
  get('measurements').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const r = event.detail;
  map.setView([r.lat, r.lon], 14, { animate: false });
  L.popup().setLatLng([r.lat, r.lon]).setContent(detail(r)).openOn(map);
});

document.addEventListener('view-changed', (event) => {
  if (event.detail === 'measurements') map.invalidateSize({ pan: false });
});
