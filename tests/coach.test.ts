import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceWave, createGame, demoLanes, demoResolution, demoWaveWeather, investigateLane, publicGame, resolveWave, scoutLane } from '../shared/engine.ts';
import type { AlertPlan, CallChoice, Doctrine, GameState, IntelToolId, Stance } from '../shared/types.ts';
import { coachStep, planEvent, REHEARSAL_ROUTE, TUTORIAL_DOCTRINE, type CoachStep } from '../src/coachSteps.ts';

/** Every `data-coach` hook rendered by the UI, as patterns (template parts become wildcards). */
const UI_HOOKS: RegExp[] = (() => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = [
    ...readdirSync(src).filter((f) => f.endsWith('.tsx') && f !== 'Coach.tsx'),
    ...readdirSync(path.join(src, 'screens')).filter((f) => f.endsWith('.tsx')).map((f) => path.join('screens', f)),
  ];
  const hooks: RegExp[] = [];
  for (const file of files) {
    const text = readFileSync(path.join(src, file), 'utf8');
    for (const match of text.matchAll(/data-coach=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const raw = match[1] ?? match[2];
      const pattern = raw.split(/\$\{[^}]+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z]+');
      hooks.push(new RegExp(`^${pattern}$`));
    }
  }
  return hooks;
})();

/** A tiny stand-in for App: engine state plus the UI state the coach reads. */
function rehearsal(doctrine: Doctrine = TUTORIAL_DOCTRINE) {
  const s = {
    game: createGame({ id: 'coach', mode: 'demo', doctrine, lanes: demoLanes(1), weather: demoWaveWeather(1), now: Date.now() }) as GameState,
    plans: { north: 'harvest', east: 'harvest', west: 'harvest' } as Record<string, Stance>,
    calls: {} as Record<string, CallChoice>,
    alert: null as AlertPlan | null,
    tgmLane: null as string | null,
    acked: new Set<string>(),
    liveReady: true,
  };
  const step = (): CoachStep => {
    const current = coachStep({ game: publicGame(s.game), plans: s.plans, calls: s.calls, alert: s.alert, tgmLane: s.tgmLane, acked: s.acked, liveReady: s.liveReady });
    assert.ok(current, 'the coach always has something to say in a rehearsal');
    for (const target of current.targets) {
      assert.ok(UI_HOOKS.some((hook) => hook.test(target)), `coach target "${target}" (step ${current.id}) has no data-coach hook in the UI`);
    }
    return current;
  };
  /** What App does on a stance click: set the plan and tell the coach, even if nothing changed. */
  const click = (laneId: string, stance: Stance) => { s.plans = { ...s.plans, [laneId]: stance }; s.acked.add(planEvent(s.game.wave, laneId, stance)); };
  const ack = () => s.acked.add(step().id);
  const scout = (laneId: string) => { s.game = scoutLane(s.game, laneId); };
  const open = (laneId: string, tool: IntelToolId) => { s.game = investigateLane(s.game, laneId, tool); };
  const resolve = () => { s.game = resolveWave(s.game, s.plans, demoResolution(s.game.wave), { alert: s.alert, calls: s.calls }); };
  const next = () => {
    s.game = advanceWave(s.game, demoLanes(s.game.wave + 1), demoWaveWeather(s.game.wave + 1));
    s.plans = { north: 'harvest', east: 'harvest', west: 'harvest' }; s.calls = {}; s.alert = null; s.tgmLane = null;
  };
  /** Wave 1 exactly as coached, straight to wave 2. */
  const chapterOne = () => {
    s.acked.add('w1-intro');
    scout('north'); open('north', 'buyers'); open('north', 'trend'); scout('east');
    s.plans = { ...REHEARSAL_ROUTE[1] };
    s.alert = { laneId: 'east', condition: 'smart_out' };
    resolve(); next();
  };
  return { s, step, click, ack, scout, open, resolve, next, chapterOne };
}

test('the coach is silent outside the rehearsal', () => {
  const { s } = rehearsal();
  const live = { ...publicGame(s.game), mode: 'live' as const };
  assert.equal(coachStep({ game: live, plans: s.plans, calls: {}, alert: null, tgmLane: null, acked: new Set() }), null);
});

test('every coach target is checked against the data-coach hooks the UI really renders', () => {
  const known = (target: string) => UI_HOOKS.some((hook) => hook.test(target));
  assert.ok(UI_HOOKS.length >= 15, `found ${UI_HOOKS.length} hooks`);
  for (const target of ['objective', 'stormglass', 'resolve', 'next', 'ledger', 'tgm-close', 'flows-west', 'stance-east-divert', 'tool-profiler', 'alert-north']) {
    assert.ok(known(target), `${target} should be a UI hook`);
  }
  assert.equal(known('stance-east-sideways-left'), false, 'the guard rejects keys the UI does not render');
  assert.equal(TUTORIAL_DOCTRINE, 'keeper');
});

test('chapter 1 walks the analyst workflow on the false calm, following the player', () => {
  const t = rehearsal();
  const { s, step, click, ack, scout, open, resolve, next } = t;

  const intro = step();
  assert.equal(intro.id, 'w1-intro');
  assert.equal(intro.chapter, 1);
  assert.equal(intro.chapterTitle, 'The false calm');
  assert.equal(intro.ack, 'Start the tutorial');
  assert.equal(intro.note, undefined, 'no doctrine warning on the intended doctrine');
  ack();

  const resources = step();
  assert.equal(resources.id, 'w1-resources');
  assert.deepEqual(resources.targets, ['objective']);
  assert.match(resources.body, /Charge \(0\/18\).*Hull \(100\).*Supply \(6\).*Lenses \(5\)/);
  ack();

  const weather = step();
  assert.equal(weather.id, 'w1-weather');
  assert.deepEqual(weather.targets, ['stormglass']);
  assert.match(weather.body, /Crosswind \(±0\) means no push either way/);
  ack();

  assert.equal(step().id, 'w1-open-glass');
  assert.deepEqual(step().targets, ['market-north', 'tgm-north']);
  assert.match(step().body, /\+4\.2% in 24h/);
  s.tgmLane = 'north';

  assert.equal(step().id, 'w1-scout-glass');
  assert.deepEqual(step().targets, ['scout-north']);
  scout('north');

  assert.equal(step().id, 'w1-buyers');
  assert.deepEqual(step().targets, ['tool-buyers']);
  s.tgmLane = null;
  assert.deepEqual(step().targets, ['tgm-north', 'tool-buyers'], 'closing the panel points back at it');
  s.tgmLane = 'east';
  assert.deepEqual(step().targets, ['tgm-close'], 'the wrong panel is closed first');
  assert.match(step().body, /^Close this panel, then open Token God Mode on Glass/);
  s.tgmLane = 'north';
  open('north', 'buyers');

  const trend = step();
  assert.equal(trend.id, 'w1-trend');
  assert.equal(trend.title, 'One big hand. Now the weekly trend', 'the coach reacts to the clue actually opened');
  assert.match(trend.body, /71% of the top-buyer volume/);
  assert.doesNotMatch(trend.body, /churn|sold most of it back/i, 'Glass is concentrated buying, not churn');
  open('north', 'trend');

  assert.equal(step().id, 'w1-brace-glass');
  assert.deepEqual(step().targets, ['tgm-close'], 'stances live on the board');
  assert.match(step().body, /^Go back to the gates\. Smart Money holdings fell 18% over 7 days\./);
  s.tgmLane = null;
  assert.deepEqual(step().targets, ['stance-north-brace']);
  click('north', 'brace');

  assert.equal(step().id, 'w1-scout-ember');
  scout('east');

  const harvest = step();
  assert.equal(harvest.id, 'w1-harvest-ember');
  assert.deepEqual(harvest.targets, ['stance-east-harvest']);
  assert.equal(harvest.ack, 'Keep Ember on Harvest');
  assert.equal(step().id, 'w1-harvest-ember', 'the lesson waits even though Ember starts on Harvest');
  click('east', 'harvest');
  assert.notEqual(step().id, 'w1-harvest-ember', 'clicking the highlighted, already-selected Harvest completes the step');

  assert.equal(step().id, 'w1-brace-moss');
  assert.match(step().body, /Keep your remaining lens:/);
  click('west', 'brace');

  assert.equal(step().id, 'w1-alert');
  assert.deepEqual(step().targets, ['alert-east']);
  s.alert = { laneId: 'east', condition: 'smart_out' };

  const call = step();
  assert.equal(call.id, 'w1-call');
  assert.equal(call.optional, true);
  ack();

  const commit = step();
  assert.equal(commit.id, 'w1-resolve');
  assert.deepEqual(commit.targets, ['resolve']);
  assert.match(commit.body, /Glass brace, Ember harvest, Moss brace, Smart Alert on Ember/);
  assert.equal(s.game.intel, 1, 'the walkthrough leaves one lens for chapter 2');
  resolve();

  const report = step();
  assert.equal(report.id, 'w1-report');
  assert.deepEqual(report.targets, ['ledger', 'next']);
  assert.match(report.body, /Glass braced: \d+ damage from \d+ pressure\./);
  assert.match(report.body, /Ember harvested \+\d+ charge/);
  assert.match(report.body, /Smart Alert on Ember stayed quiet/);
  assert.equal(report.note?.tone, 'good', 'missed views all fell on defended reaches');
  assert.match(report.note?.text ?? '', /all on reaches you defended/);
  next();

  const chapterTwo = step();
  assert.equal(chapterTwo.id, 'w2-intro');
  assert.equal(chapterTwo.chapter, 2);
  assert.equal(chapterTwo.chapterTitle, 'Find the open current');
});

test('work the player already did is credited, and planning steps vanish once the wave resolves', () => {
  const eager = rehearsal();
  eager.scout('north');
  assert.equal(eager.step().id, 'w1-buyers', 'intro, resources, weather, open and scout are all credited');

  const hasty = rehearsal();
  hasty.resolve();
  assert.equal(hasty.step().id, 'w1-report', 'no nagging about stances after the fact');
});

test('an off-script doctrine is flagged, and running out of lenses turns a lens step into a skippable note', () => {
  const { s, step, click, scout, open } = rehearsal('engineer');
  const intro = step();
  assert.equal(intro.note?.tone, 'warn');
  assert.match(intro.note?.text ?? '', /Engineer with 3 lenses/);
  s.acked.add('w1-intro');
  scout('north'); open('north', 'buyers'); open('north', 'trend');
  click('north', 'brace');
  assert.equal(s.game.intel, 0);
  const note = step();
  assert.equal(note.id, 'w1-scout-ember');
  assert.equal(note.optional, true);
  assert.equal(note.skipLabel, 'Skip this view');
  assert.deepEqual(note.targets, []);
  assert.match(note.title, /^Out of lenses/);
  s.acked.add(note.id);
  assert.equal(step().id, 'w1-harvest-ember');
});

test('chapter 2 reacts to a wrong scout, teaches Divert and checks the gates against the evidence', () => {
  const { s, step, click, ack, scout, open, chapterOne } = rehearsal();
  chapterOne();
  ack(); // w2-intro

  const first = step();
  assert.equal(first.id, 'w2-scout');
  assert.deepEqual(first.targets, ['scout-north', 'scout-east', 'scout-west']);
  scout('west'); // Moss is the false calm this wave

  const wrong = step();
  assert.equal(wrong.id, 'w2-rescout');
  assert.equal(wrong.title, 'Not this one: Moss is a false calm');
  assert.deepEqual(wrong.targets, ['scout-north', 'scout-east'], 'only the reaches still under fog');
  assert.equal(wrong.skipLabel, 'Continue anyway');
  scout('north');

  const found = step();
  assert.equal(found.id, 'w2-profiler');
  assert.equal(found.title, 'Glass is an open current. Whose buying is it?');
  assert.deepEqual(found.targets, ['tgm-north'], 'points at the open current, not the first reach scouted');
  s.tgmLane = 'north';
  assert.deepEqual(step().targets, ['tool-buyers']);
  open('north', 'buyers');
  const broke = step();
  assert.equal(broke.id, 'w2-profiler');
  assert.match(broke.title, /^Out of lenses/, 'the wrong scout cost the profiler lens');
  assert.match(broke.body, /^Navigators aboard: The top buyers kept 66%/);
  ack();
  s.tgmLane = null;

  const divert = step();
  assert.equal(divert.id, 'w2-divert');
  assert.deepEqual(divert.targets, ['stance-west-divert'], 'highlights the divert that would flood the harvest');
  assert.match(divert.body, /Glass → Ember → Moss → Glass/);
  assert.match(divert.body, /Diverting Moss would push its pressure straight into Glass/);
  click('west', 'divert'); // a player following the highlight tries it

  const flooded = step();
  assert.equal(flooded.id, 'w2-gates', 'trying Divert counts as meeting it');
  assert.equal(flooded.note?.tone, 'warn');
  assert.match(flooded.note?.text ?? '', /^Moss is set to Divert, which pushes 55% of its pressure into Glass, and Glass is on Harvest\./);
  click('west', 'harvest');

  const gates = step();
  assert.equal(gates.id, 'w2-gates', 'the Divert lesson stays done after the player changes their mind');
  assert.equal(gates.answer, 'Glass: Harvest · Ember: Brace · Moss: Brace');
  assert.equal(gates.note?.tone, 'warn');
  assert.match(gates.note?.text ?? '', /^Careful: Ember is on Harvest, but its surface looks like an undertow/);
  s.plans = { north: 'harvest', east: 'brace', west: 'harvest' };
  assert.match(step().note?.text ?? '', /^Careful: Moss is on Harvest, but its flows read as a false calm/);
  s.plans = { north: 'brace', east: 'brace', west: 'brace' };
  assert.match(step().note?.text ?? '', /^Nothing is on Harvest/);
  s.plans = { ...REHEARSAL_ROUTE[2] };
  assert.deepEqual(step().note, { tone: 'good', text: 'This plan matches the evidence: harvest Glass, defend the rest.' });
});

test('chapter 3 teaches reading the surface and steers away from a reach whose tape says no', () => {
  const { s, step, ack, open, resolve, next, chapterOne } = rehearsal();
  chapterOne();
  s.plans = { ...REHEARSAL_ROUTE[2] };
  resolve(); next();

  const intro = step();
  assert.equal(intro.id, 'w3-intro');
  assert.equal(intro.chapter, 3);
  assert.match(intro.body, /Headwind \(\+1\)/);
  ack();

  const surface = step();
  assert.equal(surface.id, 'w3-surface');
  assert.deepEqual(surface.targets, ['flows-north', 'flows-east', 'flows-west']);
  assert.match(surface.answer ?? '', /^Moss: whales buying, exchanges releasing supply/);
  ack();

  assert.equal(step().id, 'w3-trades');
  assert.deepEqual(step().targets, ['tgm-north', 'tgm-east', 'tgm-west']);
  s.tgmLane = 'north'; // Glass is the undertow this wave
  open('north', 'trades');

  const no = step();
  assert.equal(no.id, 'w3-transfers');
  assert.equal(no.title, 'The tape says no on Glass');
  assert.deepEqual(no.targets, ['tgm-close']);
  assert.match(no.body, /^Close this panel and open Token God Mode on another reach\. Sells carried 61%/);
  s.tgmLane = null;
  assert.deepEqual(step().targets, ['tgm-east', 'tgm-west']);
  s.tgmLane = 'west';
  assert.deepEqual(step().targets, ['tool-transfers']);

  // The player picks Ember instead, the false calm, and gets a second warning.
  s.tgmLane = 'east';
  open('east', 'transfers');
  s.tgmLane = null;
  const gates = step();
  assert.equal(gates.id, 'w3-gates');
  assert.match(gates.body, /^Your evidence: Glass: Ebb tide \(\+2\); Ember: Loading the gates \(\+2\)\./);
  assert.match(gates.body, /Glass and Ember both warned you off, which leaves Moss, and its surface looks open\./, 'the coach helps reason by elimination');
});

test('the coached route lights the beacon, and every report and the finale explain the result', () => {
  const { s, step, ack, scout, open, resolve, next, chapterOne } = rehearsal();
  chapterOne();

  // Chapter 2: find the open current, profile its biggest buyer.
  ack();
  scout('north');
  assert.equal(step().id, 'w2-profiler');
  s.tgmLane = 'north';
  open('north', 'buyers');
  assert.deepEqual(step().targets, ['tool-profiler']);
  open('north', 'profiler');
  s.tgmLane = null;
  const divert = step();
  assert.equal(divert.id, 'w2-divert');
  assert.deepEqual(divert.note?.tone, 'good');
  assert.match(divert.note?.text ?? '', /^Profiler on Glass: Seasoned hand\./);
  ack();
  assert.equal(step().id, 'w2-gates');
  s.plans = { ...REHEARSAL_ROUTE[2] };
  ack();
  const alert2 = step();
  assert.equal(alert2.id, 'w2-alert');
  assert.deepEqual(alert2.targets, ['alert-north'], 'the alert goes where you harvest');
  s.alert = { laneId: 'north', condition: 'smart_out' };
  assert.equal(step().id, 'w2-resolve');
  resolve();
  assert.equal(step().id, 'w2-report');
  next();

  // Chapter 3: pick the candidate from the surface, confirm with tape and cargo.
  ack(); ack(); // intro, surface
  s.tgmLane = 'west';
  assert.match(step().body, /^In Moss's Token God Mode, open DEX Trades/);
  open('west', 'trades');
  const cargo = step();
  assert.equal(cargo.title, 'The tape agrees. Now follow the cargo');
  assert.deepEqual(cargo.targets, ['tool-transfers']);
  assert.match(cargo.body, /^Buys carried 67%/);
  open('west', 'transfers');
  assert.equal(s.game.intel, 0, 'Keeper’s lens budget covers the whole script exactly');
  s.tgmLane = null;
  const gates = step();
  assert.equal(gates.id, 'w3-gates');
  assert.match(gates.body, /^Your evidence: Moss: Flood tide \(−1\), Cargo leaving port \(−1\)\. Moss checks out\./);
  assert.equal(gates.answer, 'Glass: Brace · Ember: Brace · Moss: Harvest');
  s.plans = { ...REHEARSAL_ROUTE[3] };
  assert.equal(step().note?.tone, 'good');
  ack();
  assert.deepEqual(step().targets, ['alert-west']);
  s.alert = { laneId: 'west', condition: 'smart_out' };
  resolve();
  assert.equal(step().id, 'w3-report');
  next();

  assert.equal(s.game.phase, 'finished');
  assert.equal(s.game.victory, true, 'the coached route lights the beacon');
  const finale = step();
  assert.equal(finale.id, 'finale');
  assert.match(finale.title, /the light is on/);
  assert.match(finale.body, /^\d+ charge \(the target was 18\) with \d+ hull left, using 8 of the 8 Nansen views/);
  assert.deepEqual(finale.actions, ['start-live', 'replay']);
  s.liveReady = false;
  assert.deepEqual(step().actions, ['replay'], 'no live button when the server has no key');
  assert.match(step().body, /NANSEN_API_KEY/);
});

test('a wave report traces a diversion from the reach that sent it to the reach that took it', () => {
  const { s, step, resolve } = rehearsal();
  s.plans = { north: 'brace', east: 'harvest', west: 'divert' };
  resolve();
  const report = step();
  assert.equal(report.id, 'w1-report');
  const pushed = /Moss diverted: \d+ damage and no charge, and it pushed (\d+) pressure into Glass\./.exec(report.body);
  assert.ok(pushed, report.body);
  assert.match(report.body, new RegExp(`Glass braced: \\d+ damage from \\d+ pressure \\(${pushed[1]} of it pushed in by Moss's divert\\)\\.`));
});

test('the finale adapts when the rehearsal is lost', () => {
  const blind = rehearsal();
  blind.resolve(); blind.next(); blind.resolve(); blind.next();
  assert.equal(blind.s.game.phase, 'finished');
  const wrecked = blind.step();
  assert.match(wrecked.title, /the gates gave way/);
  assert.match(wrecked.body, /hull ran out in wave 2/);
  assert.deepEqual(wrecked.actions, ['replay', 'start-live'], 'replay comes first after a loss');

  const timid = rehearsal();
  for (let wave = 1; wave <= 3; wave += 1) {
    timid.s.plans = { north: 'brace', east: 'brace', west: 'brace' };
    timid.resolve(); timid.next();
  }
  const dark = timid.step();
  assert.equal(timid.s.game.victory, false);
  assert.match(dark.title, /the light stayed dark/);
  assert.match(dark.body, /reached only 9 of 18 charge/);
});
