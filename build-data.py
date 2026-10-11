# Rebuild the snapshot: pip install duckdb; python build-data.py
# Downloads public mobile Parquet data for two quarters.
import json, re, math
from datetime import date
from pathlib import Path
import duckdb
con=duckdb.connect()
con.execute('INSTALL httpfs')
con.execute('LOAD httpfs')
regions=[{'id':'chittamur','name':'Chittamur area, Andhra Pradesh','bounds':[79.85,13.75,80.2,14.1]}, {'id':'lathrop','name':'Lathrop area, California','bounds':[-121.38,37.74,-121.17,37.9]}]
periods=[('2025 Q4',2025,4,'2025-10-01'),('2026 Q1',2026,1,'2026-01-01')]
output={'source':'Speedtest by Ookla Global Fixed and Mobile Network Performance Maps','sourceUrl':'https://github.com/teamookla/ookla-open-data','license':'CC BY-NC-SA 4.0','licenseUrl':'https://creativecommons.org/licenses/by-nc-sa/4.0/','accessed':date.today().isoformat(),'regions':regions,'periods':[],'records':[]}

# Coarse world cells keep the browser snapshot small; local examples retain native tiles.
for label,year,quarter,date in periods:
 url=f'https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=mobile/year={year}/quarter={quarter}/{date}_performance_mobile_tiles.parquet'
 print('reading',label,flush=True)
 output['periods'].append({'id':label,'url':url})
 for region in regions:
  west,south,east,north=region['bounds']
  rows=con.execute('SELECT quadkey,tile,tile_x,tile_y,avg_d_kbps,avg_u_kbps,avg_lat_ms,tests,devices FROM read_parquet(?) WHERE tile_x BETWEEN ? AND ? AND tile_y BETWEEN ? AND ? ORDER BY quadkey',[url,west,east,south,north]).fetchall()
  for key,tile,lon,lat,down,up,latency,tests,devices in rows:
   coords=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',tile)]
   xs=coords[::2];ys=coords[1::2]
   output['records'].append({'region':region['id'],'period':label,'quadkey':key,'bounds':[min(xs),min(ys),max(xs),max(ys)],'lon':lon,'lat':lat,'downKbps':down,'upKbps':up,'latencyMs':latency,'tests':tests,'devices':devices})
  print(region['id'],len(rows),'tiles',sum(r[7] for r in rows),'tests',flush=True)
 rows=con.execute('SELECT substr(quadkey,1,6) AS area, sum(avg_d_kbps::DOUBLE*tests)/sum(tests), sum(avg_u_kbps::DOUBLE*tests)/sum(tests), sum(avg_lat_ms::DOUBLE*tests)/sum(tests), sum(tests),count(*) FROM read_parquet(?) WHERE tests>0 GROUP BY area ORDER BY area',[url]).fetchall()
 for key,down,up,latency,tests,count in rows:
  b=bounds(key)
  output['records'].append(dict(region='world',period=label,quadkey=key,bounds=b,lon=(b[0]+b[2])/2,lat=(b[1]+b[3])/2,downKbps=round(down,2),upKbps=round(up,2),latencyMs=round(latency,2),tests=tests,tiles=count))
 print(len(rows),'regions',flush=True)
output['regions'].insert(0,dict(id='world',name='World',bounds=[-180,-70,180,85]))
output['aggregation']='World: test-weighted zoom 6 averages. Local: original zoom 16 tiles.'
Path(__file__).with_name('measurements.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
print('saved',len(output['records']),'records',flush=True)
