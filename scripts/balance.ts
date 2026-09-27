/**
 * Rehearsal balance check. Zero network, zero credits.
 * Run: npx tsx scripts/balance.ts
 */
import { advanceWave, createGame, demoLanes, demoResolution, demoWaveWeather, resolveWave } from '../shared/engine.ts';
import type { Doctrine, GameState, Stance } from '../shared/types.ts';

type Plan = Record<string, Stance>;
function run(name: string, routes: Plan[], doctrine: Doctrine = 'keeper', extras: ((wave: number) => Parameters<typeof resolveWave>[3]) | null = null) {
  let g: GameState = createGame({ id: 'sim', mode: 'demo', doctrine, lanes: demoLanes(1), weather: demoWaveWeather(1), now: Date.now() });
  const log: string[] = [];
  for (let wave = 1; wave <= 3 && g.phase !== 'finished'; wave += 1) {
    g = resolveWave(g, routes[wave - 1], demoResolution(wave), extras ? extras(wave) : {});
    const r = g.history[g.history.length - 1];
    log.push(`W${wave} ${r.weather}: ` + r.lanes.map((l) => `${l.name.split(' ')[0]} ${l.effectiveStance} base${l.baseHazard} p${l.hazard} d${l.damage} e${l.energy}`).join(' | '));
    g = advanceWave(g, demoLanes(wave + 1), demoWaveWeather(wave + 1));
  }
  console.log(`\n${name}: victory=${g.victory} charge=${g.charge} hull=${g.hull} score=${g.score}`);
  for (const line of log) console.log('  ' + line);
  return g;
}

const route: Plan[] = [
  { north: 'brace', east: 'harvest', west: 'brace' },
  { north: 'harvest', east: 'brace', west: 'brace' },
  { north: 'brace', east: 'brace', west: 'harvest' },
];
const all = (s: Stance): Plan[] => [1, 2, 3].map(() => ({ north: s, east: s, west: s }));
run('Documented route (keeper)', route);
run('Blind harvest', all('harvest'));
run('Brace everything', all('brace'));
run('Documented route (engineer)', route, 'engineer');
run('Documented route (cartographer)', route, 'cartographer');
run('Greedy + alert on false calm', [
  { north: 'harvest', east: 'harvest', west: 'brace' },
  { north: 'harvest', east: 'brace', west: 'harvest' },
  { north: 'brace', east: 'harvest', west: 'harvest' },
], 'keeper', (wave) => ({ alert: { laneId: ['north', 'east', 'west'][[0, 2, 1][wave - 1]], condition: 'smart_out' } }));
