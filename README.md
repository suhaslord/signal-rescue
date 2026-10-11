# signal rescue

mobile measurements and an outage recovery simulator, inspired by rural connectivity in india.

[open app](https://signal-rescue-suhasaug2011-2968s-projects.vercel.app/)

zoom anywhere for local measurements, compare quarters, or start with chittamur and lathrop. click “test a scenario here” to use those measured locations. change assumed towers, test a failure, and compare repairs or a relay. export the evidence and assumptions together.

[measurement source and limits](DATA.md). linked scenarios use measured locations, not population. tower positions, reach and capacity are assumed.

run the full app with `vercel dev` (Python dependencies in requirements.txt)  
test: `npm test`
