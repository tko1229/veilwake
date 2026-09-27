import { test } from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReading,createGame,publicGame,scoutLane,investigateLane,resolveWave,advanceWave,demoLanes,demoResolution,demoWaveWeather,interpret,validatePlans,modifiersFor} from '../shared/engine.ts';
import type {Stance} from '../shared/types.ts';
const newGame = () => createGame({id:'unit',mode:'demo',doctrine:'keeper',lanes:demoLanes(1),weather:demoWaveWeather(1),now:Date.now()});
const provenance={endpoint:'test',fetchedAt:new Date().toISOString(),timeframe:'1h',requestId:null,cached:false};
const HARVEST={north:'harvest',east:'harvest',west:'harvest'} as Record<string,Stance>;
test('normalization never silently turns missing or malformed values into zero',()=>{
  const r=normalizeReading({whale_net_flow_usd:null,exchange_net_flow_usd:0,smart_trader_net_flow_usd:'12',top_pnl_net_flow_usd:Infinity},provenance);
  assert.equal(r.available,1);assert.equal(r.signals.find(s=>s.id==='exchange')!.force,0);assert.equal(r.signals.find(s=>s.id==='whale')!.force,null);
});
test('normalization uses independent bounded quantization and discards raw information',()=>{
  const r=normalizeReading({whale_net_flow_usd:1e12,exchange_net_flow_usd:-123456,secret_wallet:'0x123'},provenance);
  assert.equal(r.signals.find(s=>s.id==='whale')!.force,3);assert.equal(r.signals.find(s=>s.id==='exchange')!.direction,'out');assert.ok(!JSON.stringify(r).includes('123456'));assert.ok(!JSON.stringify(r).includes('secret_wallet'));
});
test('fog is enforced on both context and baseline server responses',()=>{
  const original=newGame(),visible=publicGame(original);assert.equal(visible.lanes[0].context.signals.length,2);assert.equal(visible.lanes[0].baseline.signals.length,2);assert.equal(original.lanes[0].context.signals.length,6);
});
test('scouting consumes exactly one lens and rejects duplicates without mutation',()=>{
  const g=newGame(),s=scoutLane(g,'north');assert.equal(g.intel,5);assert.equal(s.intel,4);assert.equal(publicGame(s).lanes[0].context.signals.length,6);assert.throws(()=>scoutLane(s,'north'));assert.throws(()=>scoutLane(s,'other'));
});
test('toolkit clues are stripped server-side until opened, then revealed one by one',()=>{
  const g=newGame();
  assert.equal(Object.keys(g.lanes[0].intel).length,5,'the server holds all five clues');
  assert.deepEqual(publicGame(g).lanes[0].intel,{},'the browser receives none of them');
  const opened=investigateLane(g,'north','buyers');
  assert.equal(opened.intel,g.intel-1);
  assert.deepEqual(Object.keys(publicGame(opened).lanes[0].intel),['buyers']);
  assert.deepEqual(publicGame(opened).lanes[1].intel,{},'other reaches stay fogged');
  assert.equal(g.lanes[0].opened.length,0,'investigation does not mutate its input');
});
test('the profiler needs the buyers ledger first, duplicates and empty lenses are refused',()=>{
  const g=newGame();
  assert.throws(()=>investigateLane(g,'north','profiler'),/Who Bought\/Sold first/);
  const withLedger=investigateLane(g,'north','buyers');
  const profiled=investigateLane(withLedger,'north','profiler');
  assert.deepEqual(profiled.lanes[0].opened,['buyers','profiler']);
  assert.throws(()=>investigateLane(profiled,'north','buyers'),/already open/);
  assert.throws(()=>investigateLane({...g,intel:0},'north','trades'),/No lenses/);
  assert.throws(()=>investigateLane(g,'north','labels' as never),/Unknown Nansen view/);
});
test('an unopened clue still shapes the wave: looking changes knowledge, not the world',()=>{
  const blind=resolveWave(newGame(),HARVEST,demoResolution(1));
  let informed=newGame();
  for(const tool of ['buyers','trades','transfers','trend'] as const) informed=investigateLane(informed,'north',tool);
  const seen=resolveWave(informed,HARVEST,demoResolution(1));
  assert.equal(blind.history[0].lanes[0].hazard,seen.history[0].lanes[0].hazard);
  assert.ok(blind.history[0].lanes[0].modifiers.filter(m=>m.source==='buyers').every(m=>!m.seen));
  assert.ok(seen.history[0].lanes[0].modifiers.filter(m=>m.source==='buyers').every(m=>m.seen));
  assert.match(blind.history[0].lanes[0].explanation,/You did not open/);
});
test('toolkit, harbor, weather and perp modifiers all enter the pressure ledger',()=>{
  const lane=demoLanes(1)[0];
  const mods=modifiersFor(lane,demoResolution(1)[0],demoWaveWeather(3));
  const sources=new Set(mods.map(m=>m.source));
  for(const source of ['weather','perp','buyers','trades','transfers','trend','profiler','combo']) assert.ok(sources.has(source as never),`missing ${source}`);
  assert.ok(mods.some(m=>m.source==='combo'&&m.value===1),'weekly distribution + fresh trader exit is a long ebb');
});
test('a Smart Alert that fires braces a harvesting gate for free; a quiet one changes nothing',()=>{
  const g=newGame();
  const fired=resolveWave(g,HARVEST,demoResolution(1),{alert:{laneId:'north',condition:'smart_out'}});
  const lane=fired.history[0].lanes[0];
  assert.deepEqual(lane.alert,{condition:'smart_out',fired:true,switched:true});
  assert.equal(lane.effectiveStance,'brace');
  assert.equal(fired.energy,g.energy,'the alert costs no supply');
  const plain=resolveWave(g,HARVEST,demoResolution(1));
  assert.ok(lane.damage<plain.history[0].lanes[0].damage);
  const quiet=resolveWave(g,HARVEST,demoResolution(1),{alert:{laneId:'east',condition:'whale_out'}});
  assert.deepEqual(quiet.history[0].lanes[1].alert,{condition:'whale_out',fired:false,switched:false});
  assert.equal(quiet.history[0].lanes[1].damage,plain.history[0].lanes[1].damage);
});
test('timeframe calls are scored against the real short read, never a price',()=>{
  const g=newGame();
  const right=resolveWave(g,HARVEST,demoResolution(1),{calls:{north:'hold'}});
  const wrong=resolveWave(g,HARVEST,demoResolution(1),{calls:{north:'turn'}});
  const pass=resolveWave(g,HARVEST,demoResolution(1));
  assert.equal(right.history[0].lanes[0].callHit,true);
  assert.equal(wrong.history[0].lanes[0].callHit,false);
  assert.equal(pass.history[0].lanes[0].callHit,null);
  assert.equal(right.history[0].lanes[0].points-pass.history[0].lanes[0].points,12);
});
test('invalid alerts and calls are rejected before anything changes',()=>{
  const g=newGame();const snapshot=JSON.stringify(g);
  assert.throws(()=>resolveWave(g,HARVEST,demoResolution(1),{alert:{laneId:'nowhere',condition:'smart_out'}}));
  assert.throws(()=>resolveWave(g,HARVEST,demoResolution(1),{alert:{laneId:'north',condition:'moon' as never}}));
  assert.throws(()=>resolveWave(g,HARVEST,demoResolution(1),{calls:{north:'maybe' as never}}));
  assert.equal(JSON.stringify(g),snapshot);
});
test('invalid and overspent plans rejected before resolution',()=>{
  const g=newGame();assert.throws(()=>validatePlans(g,{}));assert.throws(()=>validatePlans(g,{north:'harvest',east:'harvest',west:'hack' as Stance}));assert.throws(()=>validatePlans({...g,energy:1},{north:'brace',east:'brace',west:'brace'}));
});
test('actor identity changes world behavior even with identical gross directions',()=>{
  const lane=demoLanes(1)[0],resolution=demoResolution(1)[0];const before=interpret(lane,resolution);const modified=structuredClone(resolution);modified.signals.find(s=>s.id==='smart_trader')!.direction='in';const after=interpret(lane,modified);assert.equal(before.pattern,'The false calm');assert.notEqual(before.hazard,after.hazard);
});
test('diversion creates an actual neighboring externality',()=>{
  const g=newGame(),r=demoResolution(1);const baseline=resolveWave(g,HARVEST,r);const diverted=resolveWave(g,{north:'divert',east:'harvest',west:'harvest'},r);assert.equal(diverted.history[0].lanes[0].damage,0);assert.ok(diverted.history[0].lanes[1].damage>baseline.history[0].lanes[1].damage);assert.equal(g.history.length,0);
});
test('informed deterministic rehearsal wins in three waves',()=>{
  let g=newGame();const routes:Record<string,Stance>[]=[{north:'brace',east:'harvest',west:'brace'},{north:'harvest',east:'brace',west:'brace'},{north:'brace',east:'brace',west:'harvest'}];for(let i=0;i<3;i++){g=resolveWave(g,routes[i],demoResolution(i+1));g=advanceWave(g,demoLanes(i+2),demoWaveWeather(i+2));}assert.equal(g.phase,'finished');assert.equal(g.victory,true);assert.equal(g.charge,24);assert.equal(g.hull,39);assert.equal(g.score,933);
});
test('blind harvesting loses the authored rehearsal',()=>{
  let g=newGame();for(let wave=1;wave<=3 && g.phase!=='finished';wave++){g=resolveWave(g,HARVEST,demoResolution(wave));g=advanceWave(g,demoLanes(wave+1),demoWaveWeather(wave+1));}assert.equal(g.victory,false);assert.equal(g.hull,0);
});
test('bracing everything survives but fails the energy objective',()=>{
  let g=newGame();for(let wave=1;wave<=3;wave++){g=resolveWave(g,{north:'brace',east:'brace',west:'brace'},demoResolution(wave));g=advanceWave(g,demoLanes(wave+1),demoWaveWeather(wave+1));}assert.equal(g.victory,false);assert.equal(g.charge,9);assert.ok(g.hull>0);
});
test('lenses and supply refill after each wave and calls/alerts reset',()=>{
  const g=resolveWave(newGame(),HARVEST,demoResolution(1),{alert:{laneId:'north',condition:'smart_out'},calls:{north:'hold'}});
  const next=advanceWave(g,demoLanes(2),demoWaveWeather(2));
  assert.equal(next.intel,Math.min(10,g.intel+2));assert.equal(next.alert,null);assert.deepEqual(next.calls,{});assert.equal(next.weather.name,'Fair wind');
});
test('all missing live resolution fails without changing any state',()=>{
  const g={...newGame(),mode:'live' as const};const snapshot=JSON.stringify(g);assert.throws(()=>resolveWave(g,HARVEST,[1,2,3].map(()=>normalizeReading({},provenance))));assert.equal(JSON.stringify(g),snapshot);
});
test('all 27 stance combinations are finite and deterministic',()=>{
  const stances:Stance[]=['harvest','brace','divert'];for(const north of stances)for(const east of stances)for(const west of stances){const plans={north,east,west};const a=resolveWave(newGame(),plans,demoResolution(1));assert.ok(Number.isFinite(a.score)&&a.hull>=0&&a.energy>=0);assert.ok(a.history[0].lanes.every(r=>Number.isFinite(r.hazard)&&r.hazard>=2&&r.hazard<=40+r.incoming));}
});
