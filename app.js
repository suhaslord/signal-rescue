import {makeNetwork,assignUsers,recoverNetwork} from './model.js';

const $ = id => document.getElementById(id);
let network, current, recovered = false;
const percent = n => `${Math.round(n/network.users.length*100)}%`;
const name = id => `T${id+1}`;

function start() {
  network = makeNetwork($('scenario').value,Number($('population').value),Number($('capacity').value));
  $('population-value').value = $('population').value;
  $('capacity-value').value = $('capacity').value;
  recovered = false;
  render();
}

function toggle(id) {
  network.towers[id].active = !network.towers[id].active;
  recovered = false;
  render();
}

function render() {
  const healthy = assignUsers({...network,towers:network.towers.map(t=>({...t,active:true}))});
  const outage = assignUsers(network);
  current = recovered ? recoverNetwork(network,$('strategy').value) : outage;
  $('tower-controls').innerHTML = network.towers.map(t=>`<div class="tower-row"><span>${name(t.id)}</span><button data-id="${t.id}" aria-label="Toggle tower ${name(t.id)}" aria-pressed="${t.active}">${t.active?'on':'off'}</button></div>`).join('');
  $('tower-controls').querySelectorAll('button').forEach(button=>button.onclick=()=>toggle(Number(button.dataset.id)));
  drawMap();
  const rows = [['Connected users',r=>r.connected],['Coverage',r=>percent(r.connected)],['Out of range',r=>r.outOfRange],['At capacity',r=>r.congested]];
  $('metrics').innerHTML = rows.map(([label,value])=>`<tr><td>${label}</td><td>${value(healthy)}</td><td>${value(outage)}</td><td>${recovered?value(current):'—'}</td></tr>`).join('');
  $('loads').innerHTML = network.towers.map(t=>`<div><div class="load-label"><span>${name(t.id)}</span><span>${t.active?`${current.loads[t.id]}/${t.capacity}`:'off'}</span></div><div class="bar"><div style="width:${current.loads[t.id]/t.capacity*100}%"></div></div></div>`).join('');
  const strategies = [['balanced','Balance connections'],['boost','Extend range'],['combined','Range + balancing']];
  const activeCount = network.towers.filter(t=>t.active).length;
  $('comparison').innerHTML = strategies.map(([key,label])=>{const r=recoverNetwork(network,key);return `<tr><td>${label}</td><td>${r.connected}</td><td>${percent(r.connected)}</td><td>${activeCount?(r.cost/activeCount).toFixed(2):'—'}×</td></tr>`;}).join('');
  $('status').textContent = recovered ? `${current.connected-outage.connected} connections restored · ${current.connected} of ${network.users.length} users connected` : `${current.connected} of ${network.users.length} users connected · ${network.towers.filter(t=>!t.active).length} towers offline`;
}

function drawMap() {
  const grid = Array.from({length:9},(_,i)=>`<path d="M ${i*100} 0 V 440" stroke="#f0f0eb"/>`).join('')+Array.from({length:5},(_,i)=>`<path d="M 0 ${i*100} H 800" stroke="#f0f0eb"/>`).join('');
  const circles = network.towers.filter(t=>t.active).map(t=>`<circle cx="${t.x}" cy="${t.y}" r="${t.range*current.multiplier}" fill="#719881" fill-opacity=".025" stroke="#bbb" stroke-dasharray="3 4"/>`).join('');
  const lines = $('links').checked ? network.users.map(u=>{const t=network.towers[current.assignments[u.id]];return t?`<path d="M${u.x} ${u.y}L${t.x} ${t.y}" stroke="#457451" stroke-opacity=".16"/>`:'';}).join('') : '';
  const users = network.users.map(u=>`<circle cx="${u.x}" cy="${u.y}" r="3" fill="${current.assignments[u.id]>=0?'#457451':'#c5392b'}"><title>User ${u.id+1}: ${current.assignments[u.id]>=0?name(current.assignments[u.id]):'disconnected'}</title></circle>`).join('');
  const towers = network.towers.map(t=>`<g class="tower" data-id="${t.id}" tabindex="0" role="button" aria-label="${name(t.id)}, ${t.active?'active':'offline'}. Toggle tower." aria-pressed="${t.active}"><title>${name(t.id)} · ${t.active?'active':'offline'}</title><rect x="${t.x-18}" y="${t.y-20}" width="36" height="42" fill="#fff" fill-opacity=".85"/>${t.active?`<polygon points="${t.x},${t.y-14} ${t.x-10},${t.y+7} ${t.x+10},${t.y+7}" fill="#555"/>`:`<path d="M${t.x-9} ${t.y-10}l18 18m0-18l-18 18" stroke="#b43128" stroke-width="3"/>`}<text x="${t.x}" y="${t.y+20}" text-anchor="middle" font-size="11" font-family="Verdana">${name(t.id)}</text></g>`).join('');
  $('map').innerHTML = grid+circles+lines+users+towers;
  $('map').querySelectorAll('.tower').forEach(el=>{el.onclick=()=>toggle(Number(el.dataset.id));el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(Number(el.dataset.id));}};});
}

['scenario','population','capacity'].forEach(id=>$(id).addEventListener('change',start));
$('links').onchange=drawMap;
$('strategy').onchange=()=>{recovered=false;render();};
$('recover').onclick=()=>{recovered=true;render();};
$('restore').onclick=()=>{network.towers.forEach(t=>t.active=true);recovered=false;render();};
$('reset').onclick=start;
$('export').onclick=()=>{
  const outage=assignUsers(network);
  const rows=[['strategy','connected','users','out_of_range','capacity_blocked','range_multiplier','range_cost'],['outage',outage.connected,network.users.length,outage.outOfRange,outage.congested,outage.multiplier,outage.cost]];
  for(const strategy of ['balanced','boost','combined']) {const r=recoverNetwork(network,strategy);rows.push([strategy,r.connected,network.users.length,r.outOfRange,r.congested,r.multiplier,r.cost]);}
  const url=URL.createObjectURL(new Blob([rows.map(row=>row.join(',')).join('\n')],{type:'text/csv'}));
  const link=document.createElement('a');link.href=url;link.download='signal-rescue-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
start();
