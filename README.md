# Signal Rescue

A browser-local educational cellular-network failure and recovery simulator. Plain HTML, CSS and JavaScript; no dependencies or backend.

Serve the project directory with a static web server. Run model checks with `npm test` (Node 22+). On Vercel, use the Other framework preset, no build/install command, and `.` as the output directory.

## Model

Deterministic synthetic users and five towers. Outage association uses nearest-first assignment with geometric range and capacity limits. Reassignment uses augmenting paths for maximum-cardinality capacitated matching. Range extension is adjustable from 0% to 100%. All runs remain subject to physical reach and tower capacity. Settings preserve outages; reset restores the original scenario. CSV exports the computed comparison results.

This model does not implement 5G protocol stacks, propagation, interference, terrain, or real carrier data. It uses original standalone code rather than university lab code.

## Development record

Initial implementation generated with Codex following Suhas's project and visual direction. AI assistance must be disclosed in the competition submission. Before entering, Suhas should review, understand, test, and make substantive technical contributions to the app; the current generated implementation alone does not establish those contributions.
