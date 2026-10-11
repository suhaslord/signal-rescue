# Measurements

Speedtest by Ookla Global Fixed and Mobile Network Performance Maps, accessed October 11, 2026.
[Source](https://github.com/teamookla/ookla-open-data) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

`measurements.json` is an adapted mobile-data snapshot for 2025 Q4 and 2026 Q1. Original Parquet URLs are stored in the file. Local records were filtered by tile centroid within the listed bounds; metric fields were renamed. Chittamur and Lathrop include nearby areas, not just village/city boundaries.

World records group original zoom-16 tiles by their first six quadkey digits. Download, upload and latency are weighted by test count. Test counts and the number of measured tiles are summed. Device counts are omitted globally because a device can occur in multiple tiles. Cells span about 626 km at the equator; local tiles span about 610 m. Both shrink with latitude.

The adapted dataset remains CC BY-NC-SA 4.0. No endorsement by Ookla is implied. Samples come from people who ran Speedtest, not a representative survey. Missing measurements do not mean missing service. Quarter comparisons use matching cells, not matching devices. Regional averages hide local variation. This data cannot identify towers, confirm outages or attribute failures to electricity.

Leaflet 1.9.4 is bundled under its BSD 2-Clause license (Leaflet-License.txt). Basemap tiles are requested from OpenStreetMap on demand and credited on the map. No bulk tile downloads or prefetching.

The simulation is independent: assumed users, tower locations, capacities, ranges and battery durations. It does not calibrate coverage from speed measurements.
