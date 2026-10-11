# Signal Rescue

A browser-local educational cellular-network failure and recovery simulator. Plain HTML, CSS and JavaScript; no dependencies or backend.

Serve the project directory with a static web server. Run model checks with `npm test` (Node 22+). On Vercel, use the Other framework preset, no build/install command, and `.` as the output directory.

## Model

Deterministic synthetic users and five towers. Outage association uses nearest-first assignment with geometric range and capacity limits. Reassignment uses augmenting paths for maximum-cardinality capacitated matching. Range extension is adjustable from 0% to 100%. All runs remain subject to physical reach and tower capacity. Settings preserve outages; reset restores the original scenario. CSV exports the computed comparison results.

This model does not implement 5G protocol stacks, propagation, interference, terrain, or real carrier data. It uses original standalone code rather than university lab code.

## Development record

Initial implementation generated with Codex following Suhas's project and visual direction. AI assistance must be disclosed in the competition submission. Before entering, Suhas should review, understand, test, and make substantive technical contributions to the app; the current generated implementation alone does not establish those contributions.

## Display and type

The map groups the same synthetic users into 12 spatial regions and shows disconnected counts in affected areas. Red hatching means at least one user in that region remains disconnected. Region selection shows connected/total counts and reports out-of-range and capacity-blocked users separately; individual positions remain available as a toggle. The display does not add terrain or actual geographic data to the model.

Bitter is bundled as Latin-subset WOFF2 data in fonts.css, with its SIL Open Font License in Bitter-License.txt. The face is by the Bitter Project Authors; source: https://github.com/google/fonts/tree/main/ofl/bitter.
