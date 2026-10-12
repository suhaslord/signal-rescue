export function getValue(record, metric) {
  const value =
    metric === 'latency' ? record.latencyMs : metric === 'up' ? record.upKbps : record.downKbps;
  return value === null || !Number.isFinite(value) || value < 0
    ? null
    : metric === 'latency'
      ? value
      : value / 1000;
}

export function summarize(records, metric, minTests, threshold) {
  const usable = records.filter(
    (record) => record.tests >= minTests && getValue(record, metric) !== null
  );
  const tests = usable.reduce((sum, record) => sum + record.tests, 0);
  const flagged = usable.filter((record) =>
    metric === 'latency'
      ? getValue(record, metric) > threshold
      : getValue(record, metric) < threshold
  ).length;
  return {
    tiles: usable.length,
    tests,
    flagged,
    average: tests
      ? usable.reduce((sum, record) => sum + getValue(record, metric) * record.tests, 0) / tests
      : null
  };
}

export function compareData(previous, current, metric, minTests) {
  const old = new Map(
    previous.filter((record) => record.tests >= minTests).map((record) => [record.quadkey, record])
  );
  const changes = [];
  for (const record of current) {
    const earlier = old.get(record.quadkey);
    if (!earlier || record.tests < minTests) continue;
    const before = getValue(earlier, metric);
    const after = getValue(record, metric);
    if (before !== null && after !== null) changes.push(after - before);
  }
  changes.sort((a, b) => a - b);
  const middle = Math.floor(changes.length / 2);
  return {
    matched: changes.length,
    medianChange: changes.length
      ? changes.length % 2
        ? changes[middle]
        : (changes[middle - 1] + changes[middle]) / 2
      : null
  };
}

export function dataCsv(records) {
  const header =
    'period,quadkey,longitude,latitude,download_mbps,upload_mbps,latency_ms,tests,devices,measured_tiles';
  return (
    header +
    '\n' +
    records
      .map((record) =>
        [
          record.period,
          record.quadkey,
          record.lon,
          record.lat,
          getValue(record, 'down'),
          getValue(record, 'up'),
          getValue(record, 'latency'),
          record.tests,
          record.devices,
          record.tiles
        ].join(',')
      )
      .join('\n') +
    '\n'
  );
}
