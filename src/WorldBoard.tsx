import { useId } from 'react';
import type { AlertCondition, AlertPlan, CallChoice, GameState, Lane, Mode, Stance, Weather } from './types';
import { ALERTS, CALLS, PREVIEW_COPY, PREVIEW_LABEL, STANCES, TOOLS, TOOL_ORDER } from './types';
import type { PracticeKey } from './manualData';
import { ReadingPanel, Badge, Button, Meter, Pips } from './components';
import { PressureChip, ProvenanceLine, formatChange, formatPrice } from './Investigation';
import { IconAlert, IconBolt, IconExternal, IconGate, IconHull, IconLayers, IconLens, IconLock, IconShift, IconTarget, IconWave } from './icons';

const ROMAN = ['I', 'II', 'III', 'IV'];

/** Preview condition -> how disturbed the surface looks. */
const TURBULENCE: Record<string, number> = { quiet: 0, restless: 1, volatile: 2, uncertain: 3 };

/* --------------------------------------------------------------- Water band */

/**
 * The surface of a reach. It shows the *legible* condition only: before a scout
 * the basin is under fog, and the shape of the water is the preview, not the
 * hidden hazard.
 */
function WaterBand({ preview, revealed }: { preview: string; revealed: boolean }) {
  const rawId = useId();
  const gid = `w${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const turbulence = TURBULENCE[preview] ?? 1;
  const top = 84 - turbulence * 11;
  const amp = 3 + turbulence * 2.4;

  const crest = (y: number, a: number) =>
    `M0 ${y} C 40 ${y - a}, 80 ${y + a}, 120 ${y - a * 0.6} S 200 ${y + a}, 240 ${y - a * 0.8} S 300 ${y + a * 0.6}, 320 ${y}`;

  return (
    <svg viewBox="0 0 320 132" preserveAspectRatio="none" role="img" aria-label={`${PREVIEW_LABEL[preview] ?? 'Surface'}. ${PREVIEW_COPY[preview as keyof typeof PREVIEW_COPY] ?? ''}`}>
      <defs>
        <linearGradient id={`${gid}-air`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf9f3" />
          <stop offset="100%" stopColor="#e8e8dc" />
        </linearGradient>
        <linearGradient id={`${gid}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8cfb8" />
          <stop offset="100%" stopColor="#aeb89c" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="320" height="132" fill={`url(#${gid}-air)`} />

      {/* Water body */}
      <path d={`${crest(top, amp)} L320 132 L0 132 Z`} fill={`url(#${gid}-water)`} />

      {/* Static surface lines */}
      <path d={crest(top, amp)} fill="none" stroke="#6f7d73" strokeWidth="1" opacity="0.55" />
      <path d={crest(top + 14, amp * 0.7)} fill="none" stroke="#fbf9f3" strokeWidth="1" opacity="0.5" />
      <path d={crest(top + 30, amp * 0.5)} fill="none" stroke="#fbf9f3" strokeWidth="1" opacity="0.35" />

      {/* Fog of war over the unscouted basin */}
      {revealed ? (
        <circle cx="236" cy="34" r="26" fill="#f5f2e9" opacity="0.18" />
      ) : (
        <g>
          <circle cx="72" cy="30" r="34" fill="#f5f2e9" opacity="0.62" />
          <circle cx="150" cy="22" r="40" fill="#f5f2e9" opacity="0.55" />
          <circle cx="238" cy="32" r="32" fill="#f5f2e9" opacity="0.6" />
          <circle cx="186" cy="46" r="24" fill="#f5f2e9" opacity="0.45" />
        </g>
      )}

      {/* Depth rule */}
      <line x1="0" y1="131" x2="320" y2="131" stroke="#b6ac93" strokeWidth="1" />
    </svg>
  );
}

/* -------------------------------------------------------------- Gate strip */

function gateLabel(stance: Stance): string {
  if (stance === 'harvest') return 'Gates open';
  if (stance === 'brace') return 'Gates half-closed';
  return 'Gates sealed';
}

/**
 * Segmented lock gates. Nine slats whose travel is set by the chosen stance:
 * open for harvest, half for brace, sealed for divert.
 */
function GateStrip({ stance }: { stance: Stance }) {
  const slats = 9;
  const travel = stance === 'harvest' ? 0.32 : stance === 'brace' ? 0.62 : 1;
  const topRail = 10;
  const bottomRail = 46;
  const span = bottomRail - topRail;

  return (
    <svg viewBox="0 0 320 56" preserveAspectRatio="none" role="img" aria-label={gateLabel(stance)}>
      <rect x="0" y="0" width="320" height="56" fill="#fbf9f3" />
      <line x1="8" y1={topRail} x2="312" y2={topRail} stroke="#1f2d26" strokeWidth="2" />
      <line x1="8" y1={bottomRail} x2="312" y2={bottomRail} stroke="#1f2d26" strokeWidth="2" />

      {Array.from({ length: slats }, (_, index) => {
        const x = 14 + index * ((320 - 28) / slats);
        const width = (320 - 28) / slats - 6;
        const height = span * travel;
        const y = topRail + (span - height);
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={width}
            height={height}
            fill={stance === 'divert' ? '#c36547' : '#46584e'}
            opacity={stance === 'harvest' ? 0.72 : 0.9}
          />
        );
      })}

      {stance === 'divert' ? (
        <g stroke="#a44e2f" strokeWidth="1.6" fill="none">
          <path d="M300 22 l6 6 -6 6" />
          <path d="M20 22 l-6 6 6 6" />
        </g>
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------- Reach */

function IntelChips({ lane, onOpen }: { lane: Lane; onOpen: () => void }) {
  return (
    <ul className="intel-chips" aria-label={`Nansen views on ${lane.name}`}>
      {TOOL_ORDER.map((tool) => {
        const clue = lane.intel?.[tool];
        const opened = (lane.opened ?? []).includes(tool);
        return (
          <li key={tool}>
            <button type="button" className={opened ? 'intel-chip intel-chip--open' : 'intel-chip'} onClick={onOpen} title={`${TOOLS[tool].nansen} — ${TOOLS[tool].question}`}>
              <span className="intel-chip__name">{TOOLS[tool].nansen}</span>
              {opened && clue ? (
                <span className="intel-chip__verdict">
                  {clue.verdict}{' '}
                  <b className={clue.pressure > 0 ? 'is-up' : clue.pressure < 0 ? 'is-down' : ''}>
                    {clue.pressure > 0 ? `+${clue.pressure}` : clue.pressure < 0 ? `−${Math.abs(clue.pressure)}` : '±0'}
                  </b>
                </span>
              ) : (
                <span className="intel-chip__lock" aria-label="not opened">
                  <IconLock size={11} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Reach({
  lane,
  index,
  stance,
  onStance,
  call,
  onCall,
  alertHere,
  alertElsewhere,
  onAlert,
  onOpenTgm,
  onScout,
  busy,
  lenses,
  neighborName,
}: {
  lane: Lane;
  index: number;
  stance: Stance;
  onStance: (stance: Stance) => void;
  call: CallChoice;
  onCall: (call: CallChoice) => void;
  alertHere: AlertCondition | null;
  alertElsewhere: string | null;
  onAlert: (condition: AlertCondition | null) => void;
  onOpenTgm: () => void;
  onScout: () => void;
  busy: boolean;
  lenses: number;
  neighborName: string;
}) {
  const revealed = lane.revealed;
  const headId = `reach-${lane.id}-name`;
  const order: Stance[] = ['harvest', 'brace', 'divert'];
  const preview = lane.preview ?? 'uncertain';
  const openedCount = (lane.opened ?? []).length + (revealed ? 1 : 0);
  const smart = lane.context.signals.find((s) => s.id === 'smart_trader');
  const smartNow = smart && smart.force !== null ? `${smart.direction === 'in' ? 'inflow' : smart.direction === 'out' ? 'outflow' : smart.direction} ${smart.force}` : 'unknown';

  const scoutLabel = revealed ? 'Flows scouted' : lenses < 1 ? 'No lenses left' : 'Scout flows · 1 lens';
  const scoutDisabled = busy || revealed || lenses < 1;

  return (
    <article
      className={['reach', revealed ? 'reach--revealed' : ''].filter(Boolean).join(' ')}
      aria-labelledby={headId}
    >
      <header className="reach__head">
        <span className="reach__index" aria-hidden="true">
          {ROMAN[index] ?? index + 1}
        </span>
        <h3 className="reach__name" id={headId}>
          {lane.name}
        </h3>
        <span className="reach__head-right">
          <span className="reach__token">
            {lane.token.symbol} · {lane.token.chain}
          </span>
          {revealed ? <Badge tone="accent">scouted</Badge> : <Badge tone="muted">fog</Badge>}
        </span>
      </header>

      <div className="reach__body">
        <div className="waterband">
          <WaterBand preview={preview} revealed={revealed} />
          <div className="waterband__caption">
            <span>
              <IconWave size={13} /> {PREVIEW_LABEL[preview] ?? 'Surface'}
            </span>
            <span>{revealed ? 'basin read' : 'fog of war'}</span>
          </div>
        </div>

        <div className="gates">
          <GateStrip stance={stance} />
          <div className="gates__caption">
            <span>
              <IconGate size={13} /> {gateLabel(stance)}
            </span>
            <span>{STANCES[stance].name}</span>
          </div>
        </div>

        <div className="readings">
          <div className="market-strip" data-coach={`market-${lane.id}`} aria-label={`Token Screener snapshot for ${lane.token.symbol}`}>
            <span><em>Price</em><strong>{formatPrice(lane.market.priceUsd)}</strong></span>
            <span><em>24h</em><strong className={lane.market.priceChangePct !== null && lane.market.priceChangePct < 0 ? 'is-out' : ''}>{formatChange(lane.market.priceChangePct)}</strong></span>
            <span><em>Vol</em><strong>{lane.market.volumeBand ?? '?'}/3</strong></span>
            <span><em>Liq</em><strong className={lane.market.liquidityBand !== null && lane.market.liquidityBand <= 1 ? 'is-out' : ''}>{lane.market.liquidityBand ?? '?'}/3</strong></span>
          </div>
          {lane.perp.listed ? (
            <p className="perp-line">
              <span>Perp shadow</span> {lane.perp.detail}
            </p>
          ) : null}
          <div data-coach={`flows-${lane.id}`}>
            <ReadingPanel reading={lane.context} kind="context" revealed={revealed} laneName={lane.name} />
          </div>
          <details className="baseline-details"><summary>Compare the 1-day baseline</summary><ReadingPanel reading={lane.baseline} kind="baseline" revealed={revealed} laneName={lane.name} /></details>
          {revealed && <p className="reach-clue">Trader out + whale in = crosscurrent. Exchange in = gate pressure. Missing does not mean safe.</p>}
          <IntelChips lane={lane} onOpen={onOpenTgm} />
          {revealed ? (
            <div className="callbox" data-coach={`call-${lane.id}`} role="group" aria-label={`Timeframe call for ${lane.name}`}>
              <p className="callbox__label">
                Call · Smart traders are <b>{smartNow}</b> over 1h. In the 5m read they…
              </p>
              <div className="callbox__opts">
                {(['hold', 'turn', 'pass'] as CallChoice[]).map((option) => (
                  <button key={option} type="button" className="chip" aria-pressed={call === option} disabled={busy} onClick={() => onCall(option)} title={CALLS[option].description}>
                    {CALLS[option].glyph} {CALLS[option].name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="alertbox" data-coach={`alert-${lane.id}`}>
            <span className="alertbox__label">
              <IconAlert size={13} /> Smart Alert
            </span>
            <select value={alertHere ?? ''} disabled={busy} onChange={(event) => onAlert(event.target.value ? (event.target.value as AlertCondition) : null)}>
              <option value="">{alertElsewhere ? `On ${alertElsewhere} — move here?` : 'None on this reach'}</option>
              {(Object.keys(ALERTS) as AlertCondition[]).map((id) => (
                <option key={id} value={id}>
                  {ALERTS[id].name}
                </option>
              ))}
            </select>
          </label>
          {alertHere ? <p className="alertbox__note">{ALERTS[alertHere].description} If it fires while you harvest, the gates brace in time — free.</p> : null}
        </div>

        <div className="reach__actions">
          <div className="reach__tools">
            <Button
              variant={revealed ? 'ghost' : 'primary'}
              onClick={onScout}
              disabled={scoutDisabled}
              data-coach={`scout-${lane.id}`}
              icon={<IconLens size={16} />}
              aria-describedby={`${headId}-scout-note`}
            >
              {scoutLabel}
            </Button>
            <Button variant="solid" onClick={onOpenTgm} data-coach={`tgm-${lane.id}`} icon={<IconLayers size={16} />} title="Open the Token God Mode panel for this reach">
              Token God Mode · {openedCount}/6
            </Button>
          </div>
          <p className="sr-only" id={`${headId}-scout-note`}>
            {revealed
              ? `${lane.name} flows have already been scouted this wave.`
              : `Spending a lens reveals every Flow Intelligence cohort for ${lane.name}.`}
          </p>

          <div className="stances" data-coach={`stances-${lane.id}`} role="group" aria-label={`Stance for ${lane.name}`}>
            {order.map((option) => (
              <button
                key={option}
                type="button"
                className="stance"
                data-coach={`stance-${lane.id}-${option}`}
                aria-pressed={stance === option}
                disabled={busy}
                onClick={() => onStance(option)}
                title={`${STANCES[option].name} — ${STANCES[option].description}`}
              >
                <span className="stance__glyph" aria-hidden="true">
                  {STANCES[option].glyph}
                </span>
                <span className="stance__name">{STANCES[option].name}</span>
                <span className="stance__cost">{STANCES[option].cost} supply</span>
              </button>
            ))}
          </div>

          {stance === 'divert' ? (
            <p className="shiftnote">
              <IconShift size={15} />
              <span>
                Divert seals {lane.name} and pushes the pressure onto {neighborName}. Protecting one reach loads the
                next.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------- Storm glass */

function StormGlass({ weather, onPractice }: { weather: Weather; onPractice: (keys: PracticeKey[]) => void }) {
  return (
    <details
      className="stormglass"
      data-coach="stormglass"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) onPractice(['weather']);
      }}
    >
      <summary>
        <span className="stormglass__kicker">Storm glass · Hyperliquid Perp Screener</span>
        <strong className="stormglass__name">{weather.name}</strong>
        <PressureChip value={weather.pressure} />
        <span className="stormglass__hint">on every reach this wave · details</span>
      </summary>
      <div className="stormglass__body">
        <p>{weather.detail}</p>
        {weather.facts.length > 0 ? (
          <dl className="tgm-facts tgm-facts--tight">
            {weather.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="tgm-panel__lesson">
          <strong>Analyst habit.</strong> Before judging a spot token, check the market backdrop: what Smart Money is doing
          with leverage on Hyperliquid tells you which way the wind blows for everything else.
        </p>
        <ProvenanceLine provenance={weather.provenance} />
        <a className="manual-entry__link" href="https://app.nansen.ai/tokens?chains=hyperliquid" target="_blank" rel="noopener noreferrer">
          <IconExternal size={13} /> Hyperliquid perps on Nansen
        </a>
      </div>
    </details>
  );
}

/* -------------------------------------------------------------- Settlement */

/**
 * The circular lockwork at the centre of the settlement: charge on the outer
 * ring, hull on the inner ring, supply beside it.
 */
function SettlementDial({ hull, charge, target, mode }: { hull: number; charge: number; target: number; mode: Mode }) {
  const chargeR = 124;
  const hullR = 103;
  const chargeC = 2 * Math.PI * chargeR;
  const hullC = 2 * Math.PI * hullR;
  const chargeRatio = target > 0 ? Math.max(0, Math.min(1, charge / target)) : 0;
  const hullRatio = Math.max(0, Math.min(1, hull / 100));
  const hullTone = hullRatio <= 0.3 ? '#8d5a3c' : '#33443b';
  const ticks = 18;
  const litTicks = Math.max(0, Math.min(ticks, Math.floor((charge / (target || 1)) * ticks)));

  return (
    <div className="dial">
      <svg
        viewBox="0 0 300 300"
        role="img"
        aria-label={`Settlement lockwork. Charge ${charge} of ${target}. Hull ${hull} of 100. ${mode === 'live' ? 'Live data run.' : 'Fictional demo run.'}`}
      >
        <circle cx="150" cy="150" r="140" fill="none" stroke="#cec7b2" strokeWidth="1" />

        {/* Charge ticks */}
        {Array.from({ length: ticks }, (_, index) => {
          const angle = (index / ticks) * Math.PI * 2 - Math.PI / 2;
          const inner = 133;
          const outer = 141;
          const lit = index < litTicks;
          return (
            <line
              key={index}
              x1={150 + Math.cos(angle) * inner}
              y1={150 + Math.sin(angle) * inner}
              x2={150 + Math.cos(angle) * outer}
              y2={150 + Math.sin(angle) * outer}
              stroke={lit ? '#c36547' : '#cec7b2'}
              strokeWidth={lit ? 2.4 : 1.4}
            />
          );
        })}

        {/* Charge ring */}
        <circle cx="150" cy="150" r={chargeR} fill="none" stroke="#ded8c8" strokeWidth="9" />
        <circle
          cx="150"
          cy="150"
          r={chargeR}
          fill="none"
          stroke="#c36547"
          strokeWidth="9"
          strokeDasharray={`${chargeC * chargeRatio} ${chargeC}`}
          transform="rotate(-90 150 150)"
        />

        {/* Hull ring */}
        <circle cx="150" cy="150" r={hullR} fill="none" stroke="#ded8c8" strokeWidth="7" />
        <circle
          cx="150"
          cy="150"
          r={hullR}
          fill="none"
          stroke={hullTone}
          strokeWidth="7"
          strokeDasharray={`${hullC * hullRatio} ${hullC}`}
          transform="rotate(-90 150 150)"
        />

        <circle cx="150" cy="150" r="84" fill="#fbf9f3" stroke="#cec7b2" strokeWidth="1" />

        {/* Beacon at the centre of the settlement */}
        <g stroke="#1f2d26" strokeWidth="1.4" fill="none" opacity="0.5">
          <path d="M150 62v14" />
          <path d="M108 78l9 9M192 78l-9 9" />
        </g>
      </svg>

      <div className="dial__center">
        <span className="dial__charge num">{charge}</span>
        <span className="dial__of">of {target} charge</span>
        <span className="dial__label">Settlement</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Objective */

function ObjectiveStrip({ game }: { game: GameState }) {
  const wavesDone = game.history.length;
  return (
    <section className="objective" data-coach="objective" aria-label="Run objective">
      <div>
        <p className="objective__claim">
          Reach {game.target} charge within {game.maxWaves} waves. Keep the lights on.
        </p>
        <p className="section-head__note" style={{ marginLeft: 0 }}>
          <IconTarget size={13} /> Wave {Math.min(game.wave, game.maxWaves)} of {game.maxWaves} · {wavesDone}{' '}
          {wavesDone === 1 ? 'wave resolved' : 'waves resolved'}
        </p>
      </div>

      <div className="objective__meta">
        <Meter label="Charge" value={game.charge} max={game.target} tone="charge" />
        <Meter label="Hull" value={game.hull} max={100} tone={game.hull <= 30 ? 'low' : 'hull'} />
        <div className="meter">
          <div className="meter__top">
            <span className="meter__label">
              <IconBolt size={13} /> Supply
            </span>
            <span className="meter__value num">{game.energy}</span>
          </div>
          <Pips value={Math.min(game.energy, 12)} max={Math.max(game.energy, 1)} label="Supply" />
        </div>
        <div className="meter">
          <div className="meter__top">
            <span className="meter__label">
              <IconLens size={13} /> Lenses
            </span>
            <span className="meter__value num">{game.intel}</span>
          </div>
          <Pips value={Math.min(game.intel, 12)} max={Math.max(game.intel, 1)} label="Lenses" />
        </div>
        <div className="meter">
          <div className="meter__top">
            <span className="meter__label">
              <IconHull size={13} /> Score
            </span>
            <span className="meter__value num">{game.score}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- Board */

export interface WorldBoardProps {
  game: GameState;
  plans: Record<string, Stance>;
  onPlan: (laneId: string, stance: Stance) => void;
  calls: Record<string, CallChoice>;
  onCall: (laneId: string, call: CallChoice) => void;
  alert: AlertPlan | null;
  onAlert: (laneId: string, condition: AlertCondition | null) => void;
  onOpenTgm: (laneId: string) => void;
  onScout: (laneId: string) => void;
  onPractice: (keys: PracticeKey[]) => void;
  busy: boolean;
}

export function WorldBoard({ game, plans, onPlan, calls, onCall, alert, onAlert, onOpenTgm, onScout, onPractice, busy }: WorldBoardProps) {
  const alertLane = alert ? game.lanes.find((lane) => lane.id === alert.laneId) ?? null : null;
  return (
    <div className="board">
      <ObjectiveStrip game={game} />
      <StormGlass weather={game.weather} onPractice={onPractice} />
      <div className="board-instruction"><span><b>01</b> Open Nansen views</span><span><b>02</b> Set gates &amp; one Smart Alert</span><span><b>03</b> Resolve the current</span><small>Strength bands 0–3 are game units, not USD.</small></div>

      <div className="lockwork">
        {game.lanes.map((lane, index) => {
          const neighbor = game.lanes[(index + 1) % game.lanes.length];
          const stance = plans[lane.id] ?? 'harvest';
          const here = alert && alert.laneId === lane.id ? alert.condition : null;
          return (
            <Reach
              key={lane.id}
              lane={lane}
              index={index}
              stance={stance}
              call={calls[lane.id] ?? 'pass'}
              onCall={(next) => onCall(lane.id, next)}
              alertHere={here}
              alertElsewhere={alertLane && alertLane.id !== lane.id ? alertLane.name : null}
              onAlert={(condition) => onAlert(lane.id, condition)}
              onOpenTgm={() => onOpenTgm(lane.id)}
              onStance={(next) => onPlan(lane.id, next)}
              onScout={() => onScout(lane.id)}
              busy={busy || game.phase !== 'planning'}
              lenses={game.intel}
              neighborName={neighbor ? neighbor.name : 'the next reach'}
            />
          );
        })}
      </div>

      <section className="settlement" aria-label="Settlement">
        <div className="settlement__col">
          <Meter label="Hull integrity" value={game.hull} max={100} tone={game.hull <= 30 ? 'low' : 'hull'} />
          <Meter label="Charge toward target" value={game.charge} max={game.target} tone="charge" />
          <p className="honestnote">
            Hull at 0 ends the run. Charge only counts if it reaches {game.target} before the last wave closes.
          </p>
        </div>

        <SettlementDial hull={game.hull} charge={game.charge} target={game.target} mode={game.mode} />

        <div className="settlement__col settlement__col--right">
          <div className="meter">
            <div className="meter__top">
              <span className="meter__label">Score</span>
              <span className="meter__value num">{game.score}</span>
            </div>
            <p className="honestnote" style={{ marginTop: 6 }}>
              Points come from what each reach actually yielded, not from how confident the plan looked.
            </p>
          </div>
          <div className="meter">
            <div className="meter__top">
              <span className="meter__label">
                <IconBolt size={13} /> Supply left
              </span>
              <span className="meter__value num">{game.energy}</span>
            </div>
            <Pips value={Math.min(game.energy, 12)} max={Math.max(game.energy, 1)} label="Supply left" />
            <p className="honestnote" style={{ marginTop: 6 }}>
              Brace costs 1 supply, divert costs 2. Harvest costs nothing and exposes everything.
            </p>
          </div>
          <div className="meter">
            <div className="meter__top">
              <span className="meter__label">
                <IconLens size={13} /> Lenses left
              </span>
              <span className="meter__value num">{game.intel}</span>
            </div>
            <Pips value={Math.min(game.intel, 12)} max={Math.max(game.intel, 1)} label="Lenses left" />
          </div>
        </div>
      </section>
    </div>
  );
}
