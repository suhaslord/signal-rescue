# Signal Rescue

A browser-local educational cellular-network failure and recovery simulator. Plain HTML, CSS and JavaScript; no dependencies or backend.

Serve the project directory with a static web server. Run model checks with `npm test` (Node 22+). On Vercel, use the Other framework preset, no build/install command, and `.` as the output directory.

## Model

Deterministic synthetic users and five towers. Nearest available tower association subject to geometric range and capacity. Recovery compares constrained-first load balancing and a 35% range extension. An unchanged baseline is retained when recovery cannot improve the connected count. Range cost is a squared-radius proxy, not measured electricity or calibrated RF power.

This model does not implement 5G protocol stacks, propagation, interference, terrain, or real carrier data. It uses original standalone code rather than university lab code.

## Development record

Initial implementation generated with Codex following Suhas's project and visual direction. AI assistance must be disclosed in the competition submission. Before entering, Suhas should review, understand, test, and make substantive technical contributions to the app; the current generated implementation alone does not establish those contributions.
