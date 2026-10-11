// Speed-test cells supply locations, not population or infrastructure.
const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export function areaScenario(records, bounds, capacity = 40, layout = 'town', reachKm = 5) {
  if (!records.length) throw new Error('No measured locations selected.');
  const [west, south, east, north] = bounds;
  const latitude = (south + north) / 2;
  const kmPerRadian = 6371 * Math.cos((latitude * Math.PI) / 180);
  const left = (west * Math.PI) / 180,
    top = mercator(north);
  const widthKm = (((east - west) * Math.PI) / 180) * kmPerRadian;
  const heightKm = (top - mercator(south)) * kmPerRadian;
  const pixelsPerKm = Math.min(740 / widthKm, 380 / heightKm);
  const xOffset = (800 - widthKm * pixelsPerKm) / 2;
  const yOffset = (440 - heightKm * pixelsPerKm) / 2;
  const project = (lon, lat) => ({
    x: xOffset + ((lon * Math.PI) / 180 - left) * kmPerRadian * pixelsPerKm,
    y: yOffset + (top - mercator(lat)) * kmPerRadian * pixelsPerKm
  });
  const ordered = [...records].sort((a, b) => a.quadkey.localeCompare(b.quadkey));
  // Bound the browser's matching/planning work; select evenly across spatial quadkeys.
  const count = Math.min(500, ordered.length);
  const users = Array.from({ length: count }, (_, id) => {
    const record = ordered[Math.floor((id * ordered.length) / count)];
    return { id, ...project(record.lon, record.lat), record };
  });
  const positions =
    layout === 'single'
      ? [[400, 220]]
      : layout === 'rural'
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
  return {
    users,
    layout,
    towers: positions.map(([x, y], id) => ({
      id,
      x,
      y,
      active: true,
      capacity,
      range: reachKm * pixelsPerKm
    })),
    geography: { bounds: [...bounds], pixelsPerKm, widthKm, heightKm, project },
    available: ordered.length
  };
}
export function scenarioReport(context, network, operating, result, assumptions) {
  const quote = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const metadata = {
    source: 'Speedtest by Ookla; CC BY-NC-SA 4.0',
    source_url: 'https://github.com/teamookla/ookla-open-data',
    quarter: context.period,
    bounds_w_s_e_n: context.bounds.join(';'),
    minimum_tests: context.minimum,
    simulated_points: network.users.length,
    available_cells: network.available,
    ...assumptions,
    towers: JSON.stringify(
      operating.towers.map(({ id, x, y, active, capacity, range }) => ({
        id,
        x,
        y,
        active,
        capacity,
        assumed_range_km: range / network.geography.pixelsPerKm
      }))
    ),
    limits:
      'Measured locations are not people. Tower positions, reach, slots and power are assumptions. Connections do not predict speeds or real outages.'
  };
  const rows = Object.entries(metadata).map(([key, value]) => [key, value].map(quote).join(','));
  rows.push(
    '',
    'quadkey,longitude,latitude,measured_download_mbps,measured_upload_mbps,measured_delay_ms,tests,simulated_connected,assigned_assumed_tower'
  );
  for (const point of network.users) {
    const r = point.record,
      assigned = result.assignments[point.id];
    rows.push(
      [
        r.quadkey,
        r.lon,
        r.lat,
        r.downKbps / 1000,
        r.upKbps / 1000,
        r.latencyMs,
        r.tests,
        assigned >= 0,
        assigned >= 0 ? assigned + 1 : ''
      ]
        .map(quote)
        .join(',')
    );
  }
  return rows.join('\n') + '\n';
}
