# signal rescue

mobile measurements and an outage recovery simulator, inspired by rural connectivity in india.

[open app](https://signal-rescue-suhasaug2011-2968s-projects.vercel.app/)

use the map for local measurements, or click scenarios to test a town, rural route, crowd or single tower. click “test a scenario here” to use those measured locations. click a tower off, then optimize connections. compare a repair or relay if connections are still missing. export the evidence and assumptions together.

[measurement source and limits](DATA.md). linked scenarios use measured locations, not population. tower positions, reach and capacity are assumed.

run the full app with `vercel dev` (Python dependencies in requirements.txt)  
test: `npm test`
