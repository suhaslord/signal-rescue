# signal rescue

what happens when a cell tower goes down? i wanted to compare moving users to other towers with extending their range.

[try it here](https://signal-rescue-suhasaug2011-2968s-projects.vercel.app/)

pick a layout, turn off a tower, then try the recovery options. click an area to see who's still disconnected.

the layouts stay repeatable so the recovery options have the same starting point. range and capacity still limit how many people reconnect. this is simulated coverage, not real carrier data.

to run locally: `python3 -m http.server 8000`  
tests: `npm test`

built with Codex assistance. the font is Bitter; its license is in `Bitter-License.txt`.
