import {
  metricValue,
  measurementSummary,
  compareMeasurements,
  measurementsCsv
} from './measurement-model.js';

const get = (id) => document.getElementById(id);
const map = L.map('measurement-map', {
  scrollWheelZoom: false,
  worldCopyJump: false,
  minZoom: 1,
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
let data;
let selected;
let previousArea;

function describe(record) {
  const detail = `${record.lat.toFixed(3)}, ${record.lon.toFixed(3)} · Download ${metricValue(record, 'down')?.toFixed(1) ?? '—'} Mbps · Upload ${metricValue(record, 'up')?.toFixed(1) ?? '—'} Mbps · Latency ${metricValue(record, 'latency')?.toFixed(1) ?? '—'} ms · ${record.tests.toLocaleString()} tests`;
  return (
    detail +
    (record.region === 'world'
      ? ` across ${record.tiles.toLocaleString()} measured tiles.`
      : `, ${record.devices} devices.`)
  );
}

function renderMeasurements() {
  if (!data || !get('measurement-settings').reportValidity()) return;
  const region = data.regions.find((region) => region.id === get('measurement-area').value);
  const period = get('measurement-quarter').value;
  const metric = get('measurement-metric').value;
  const unit = metric === 'latency' ? 'ms' : 'Mbps';
  const minimum = Number(get('measurement-min-tests').value);
  const threshold = Number(get('measurement-threshold').value);
  get('threshold-unit').textContent = unit;
  get('threshold-direction').textContent = metric === 'latency' ? 'Flag above' : 'Flag below';
  const records = data.records.filter(
    (record) => record.region === region.id && record.period === period
  );
  const summary = measurementSummary(records, metric, minimum, threshold);
  get('measurement-summary').textContent = summary.tiles
    ? `${summary.tiles.toLocaleString()} qualifying cells · ${summary.tests.toLocaleString()} tests · ${summary.flagged.toLocaleString()} flagged. Test-weighted average: ${summary.average.toFixed(1)} ${unit}.`
    : 'No qualifying measurements. Lower the minimum test count or choose another quarter.';
  get('measurement-resolution').textContent =
    region.id === 'world'
      ? 'World: regional averages, cells about 626 km wide at the equator. Choose Chittamur or Lathrop for detailed tiles.'
      : 'Local: measured tiles about 610 m wide at the equator. These bounds include the surrounding area.';
  if (previousArea !== region.id) {
    selected = undefined;
    map.closePopup();
    const [w, s, e, n] = region.bounds;
    if (region.id === 'world')
      map.fitBounds([
        [-60, -180],
        [75, 180]
      ]);
    else
      map.fitBounds(
        [
          [s, w],
          [n, e]
        ],
        { padding: [10, 10] }
      );
    previousArea = region.id;
  }
  cells.clearLayers();
  let chosen;
  for (const record of records) {
    const value = metricValue(record, metric);
    const small = record.tests < minimum || value === null;
    const flagged = metric === 'latency' ? value > threshold : value < threshold;
    const color = small ? '#b6b5ae' : flagged ? '#b64c37' : '#527449';
    const [w, s, e, n] = record.bounds;
    const cell = L.rectangle(
      [
        [s, w],
        [n, e]
      ],
      {
        color: record.quadkey === selected ? '#000080' : color,
        weight: record.quadkey === selected ? 2 : 0.5,
        fillColor: color,
        fillOpacity: region.id === 'world' ? 0.55 : 0.7
      }
    ).addTo(cells);
    cell.bindTooltip(
      `${value === null ? 'No value' : value.toFixed(1) + ' ' + unit} · ${record.tests.toLocaleString()} tests`
    );
    const select = () => {
      selected = record.quadkey;
      get('measurement-detail').textContent =
        describe(record) + (small ? ' Below sample minimum.' : '');
      cell.bindPopup(describe(record)).openPopup();
    };
    cell.on('click', select);
    const path = cell.getElement();
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute('aria-label', describe(record));
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
    if (record.quadkey === selected) chosen = record;
  }
  get('measurement-detail').textContent = chosen
    ? describe(chosen)
    : 'Click a measured cell for its sample counts and values. Drag to explore; use + / − to zoom.';
  const periods = data.periods.map((period) => period.id);
  const previous = data.records.filter(
    (record) => record.region === region.id && record.period === periods[0]
  );
  const current = data.records.filter(
    (record) => record.region === region.id && record.period === periods[1]
  );
  const comparison = compareMeasurements(previous, current, metric, minimum);
  get('measurement-comparison').textContent = comparison.matched
    ? `${periods[0]} → ${periods[1]}: ${comparison.matched.toLocaleString()} matched cells; median change ${comparison.medianChange >= 0 ? '+' : ''}${comparison.medianChange.toFixed(1)} ${unit}. Same areas, not necessarily the same devices. Changes do not establish an outage or its cause.`
    : 'No cells with enough tests in both quarters.';
  get('measurement-periods').textContent = periods.join(' / ');
  get('measurement-export').href =
    'data:text/csv;charset=utf-8,' + encodeURIComponent(measurementsCsv(records));
}

get('measurement-settings').onsubmit = (event) => {
  event.preventDefault();
  renderMeasurements();
};
for (const id of [
  'measurement-area',
  'measurement-quarter',
  'measurement-min-tests',
  'measurement-threshold'
]) {
  get(id).onchange = renderMeasurements;
}
get('measurement-metric').onchange = () => {
  get('measurement-threshold').value = get('measurement-metric').value === 'latency' ? 100 : 10;
  renderMeasurements();
};
try {
  const response = await fetch('./measurements.json');
  if (!response.ok) throw new Error('Data file unavailable');
  data = await response.json();
  get('measurement-quarter').innerHTML = data.periods
    .map((period) => `<option value="${period.id}">${period.id}</option>`)
    .join('');
  get('measurement-quarter').value = data.periods.at(-1).id;
  renderMeasurements();
} catch (error) {
  console.error('Measurement load failed', error);
  get('measurement-summary').textContent =
    'Measurements could not load. Reload to retry; the simulator still works.';
}
