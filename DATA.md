# Measurements

Speedtest by Ookla Global Fixed and Mobile Network Performance Maps, accessed October 11, 2026.
[Source](https://github.com/teamookla/ookla-open-data) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

`measurements.json` is an adapted mobile-data snapshot for 2025 Q4 and 2026 Q1. Original Parquet URLs are stored in the file. Local records were filtered by tile centroid within the listed bounds; metric fields were renamed. Chittamur and Lathrop include nearby areas, not just village/city boundaries.

World records group original zoom-16 tiles by their first six quadkey digits. Download, upload and latency are weighted by test count. Test counts and the number of measured tiles are summed. Device counts are omitted globally because a device can occur in multiple tiles. Cells span about 626 km at the equator; local tiles span about 610 m. Both shrink with latitude.

The adapted dataset remains CC BY-NC-SA 4.0. No endorsement by Ookla is implied. Samples come from people who ran Speedtest, not a representative survey. Missing measurements do not mean missing service. Quarter comparisons use matching cells, not matching devices. Regional averages hide local variation. This data cannot identify towers, confirm outages or attribute failures to electricity.

Leaflet 1.9.4 is bundled under its BSD 2-Clause license (Leaflet-License.txt). Basemap tiles are requested from OpenStreetMap on demand and credited on the map. No bulk tile downloads or prefetching.

The simulation is independent: assumed users, tower locations, capacities, ranges and battery durations. It does not calibrate coverage from speed measurements.

## Detail anywhere

At zoom 5 and above, `/api/tiles` reads the chosen visible area from the same public mobile Parquet datasets. The server groups tiles at progressively finer quadkey levels (7–16). Zoom 12 and above uses the original zoom-16 measurements. Values remain test-weighted; device counts appear only for original tiles. This covers anywhere with published measurements, not every location on Earth.

Bounds are rounded outward for caching, so counts can include measurements just outside the screen. Regions at the edge of the requested area average only the tiles retrieved in that request. The first query may take several seconds; browser and CDN caches speed up repeated views. Empty results and source failures are shown separately. No tower data is inferred.

Install `requirements.txt` to run the Python data service. `python api_test.py` checks request validation and map projection; `npm test` checks measurement math and simulation.

## Linked area scenarios

“Improve connections here” imports native level-16 tile centroids in the visible map, after the minimum-test filter. Each cell becomes one analysis point; it is not a person, household, or demand estimate. Up to 500 cells are selected evenly across sorted quadkeys. This avoids treating more tests as more population.

The scenario colors represent simulated connection status: green connected, red disconnected, blue newly connected relative to the original assignment. A cross also marks disconnections. Selecting a point reveals its unchanged observed speed and sample count. The default tower layouts are hypothetical. Locations can be changed by selecting a measured point and placing an assumed tower there. Reach in kilometres uses a local Mercator scale at the viewport’s centre latitude; circles ignore terrain, buildings, frequencies, interference, carriers, and backhaul. Capacity means slots for analysis points, not measured subscribers. Changing layout regenerates assumed tower positions; editing reach or capacity preserves manual positions.

The combined CSV records the quarter, bounds, sample filter, selected evidence, assumed towers, power settings and current per-point assignment. It supports an auditable what-if comparison, not a prediction of real outages, coverage or post-recovery speed. Observed slow locations that become disconnected are counted separately; neither measurement causes nor explains the hypothetical outage.

The optimizer checks maximum-matching reassignment and range increases in 5% steps up to the chosen limit (default 35%). With a selected quarter of the area, it maximizes that region’s connected count first, then the total, then chooses the smallest range increase. Without a focus, it maximizes the total. Priority can shift scarce slots away from other areas; both counts and the total are shown.

Before/after views share the same measured locations. The combined export includes focus and original connection counts. If connections remain missing, the app compares individual repairs and one relay across 144 candidate positions, prioritizing the selected area then the total. A suggested hardware change requires a separate preview action and can be undone. These are hypothetical infrastructure changes, not commands to a real network.
