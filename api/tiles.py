import json
import logging
import math
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import duckdb

PERIODS = {
    '2025 Q4': '2025/quarter=4/2025-10-01',
    '2026 Q1': '2026/quarter=1/2026-01-01',
}


def request_area(query):
    period = query.get('period', ['2026 Q1'])[0]
    if period not in PERIODS:
        raise ValueError('Choose one of the available quarters.')
    try:
        level = int(query['level'][0])
        box = [float(v) for v in query['bbox'][0].split(',')]
    except (KeyError, ValueError, IndexError):
        raise ValueError('A map area and resolution are required.')
    if len(box) != 4 or not all(math.isfinite(v) for v in box):
        raise ValueError('Invalid map bounds.')
    w, s, e, n = box
    if not (-180 <= w < e <= 180 and -85.1 <= s < n <= 85.1):
        raise ValueError('Map bounds are outside the supported projection.')
    if e-w > 120 or n-s > 100 or not 7 <= level <= 16:
        raise ValueError('Zoom in to load detailed measurements.')
    size = 2**level
    mercator_y = lambda lat: (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2
    columns = math.ceil((e-w)/360*size)+1
    rows = math.ceil((mercator_y(s)-mercator_y(n))*size)+1
    if columns*rows > 4096:
        raise ValueError('This resolution needs a smaller map area. Zoom in.')
    return period, level, box


def cell_bounds(key):
    x = y = 0
    for digit in key:
        x = x*2 + (int(digit) & 1)
        y = y*2 + (int(digit) >> 1)
    size = 2**len(key)
    latitude = lambda y: math.degrees(math.atan(math.sinh(math.pi*(1-2*y/size))))
    return [x/size*360-180, latitude(y+1), (x+1)/size*360-180, latitude(y)]


def measurements(period, level, box):
    # Only signed DuckDB core extensions; install into the writable temporary directory.
    with duckdb.connect(config={'threads': 2, 'memory_limit': '512MB'}) as db:
        db.execute("SET home_directory='/tmp'")
        db.execute("SET temp_directory='/tmp/signal-rescue-spill'")
        db.execute("SET extension_directory='/tmp/signal-rescue-extensions'")
        db.execute("INSTALL httpfs FROM 'https://extensions.duckdb.org'")
        db.execute('LOAD httpfs')
        db.execute('SET http_timeout=60')
        url = 'https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=mobile/year=' + PERIODS[period] + '_performance_mobile_tiles.parquet'
        # Weighted averages retain test counts. Device counts cannot be summed across tiles.
        rows = db.execute('''
            SELECT substr(quadkey,1,?) AS cell,
              sum(avg_d_kbps::DOUBLE*tests)/sum(tests),
              sum(avg_u_kbps::DOUBLE*tests)/sum(tests),
              sum(avg_lat_ms::DOUBLE*tests)/sum(tests),
              sum(tests), count(*), CASE WHEN ?=16 THEN max(devices) ELSE NULL END
            FROM read_parquet(?)
            WHERE tile_x BETWEEN ? AND ? AND tile_y BETWEEN ? AND ? AND tests>0
            GROUP BY cell ORDER BY cell LIMIT 5001
        ''', [level, level, url, box[0], box[2], box[1], box[3]]).fetchall()
    if len(rows) > 5000:
        raise ValueError('Too many measured cells. Zoom in or choose a smaller area.')
    result = []
    for key, down, up, latency, tests, tiles, devices in rows:
        b = cell_bounds(key)
        result.append(dict(region='view', period=period, quadkey=key, bounds=b,
                           lon=(b[0]+b[2])/2, lat=(b[1]+b[3])/2,
                           downKbps=round(down,2), upKbps=round(up,2),
                           latencyMs=round(latency,2), tests=tests, tiles=tiles, devices=devices))
    return dict(records=result, level=level, period=period, bounds=box, sourceUrl=url)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            period, level, box = request_area(parse_qs(urlparse(self.path).query))
            payload = measurements(period, level, box)
            status = 200
        except ValueError as error:
            payload, status = {'error': str(error)}, 400
        except Exception:
            logging.exception('Mobile measurement query failed')
            payload, status = {'error': 'The data source did not respond. Please retry.'}, 503
        raw = json.dumps(payload, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' if status==200 else 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
