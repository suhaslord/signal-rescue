# signal rescue

mobile measurements and a connection planner, inspired by rural connectivity in india.

[open app](https://signal-rescue-suhasaug2011-2968s-projects.vercel.app/)

pick a place on the map and click “improve connections here”. choose an area, then improve it. compare before and after, including what changes elsewhere. if connections are still missing, preview a repair or relay. layouts work without a measured area too.

[measurement source and limits](DATA.md). measured points aren't population. towers, capacity and range are assumptions. the model doesn't change real networks or predict speeds.

Codex helped write and revise the implementation. Suhas chose the direction and reviewed the app.

run: `vercel dev` (Python dependencies in requirements.txt)  
test: `npm test`
