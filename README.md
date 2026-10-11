# signal rescue

an outage recovery simulator, motivated by rural connectivity problems in india.

[try it here](https://signal-rescue-suhasaug2011-2968s-projects.vercel.app/)

turn off a tower and compare recovery options. the planner ranks repairs, checks range changes, and searches 144 locations for one temporary relay. you can apply an option and export the comparison.

the layouts are repeatable. range and capacity limit connections. relay placement assumes power and backhaul; this is simulated coverage, not real carrier data or a deployment plan.

to run locally: `python3 -m http.server 8000`  
tests: `npm test`
