import type { ReactNode } from 'react';
import type { GameState, LaneResult, Modifier, RoundResult, Stance } from '../types';
import { ALERTS, CALLS, STANCES, TOOLS } from '../types';
import type { PracticeKey } from '../manualData';
import { Badge, Button, Modal, ProofBlock } from '../components';
import { IconArrowRight, IconBolt, IconExternal, IconHull, IconShift, IconTarget } from '../icons';

export interface ResolutionPanelProps {
  open: boolean;
  game: GameState;
  round: RoundResult;
  before: GameState | null;
  onNext: () => void;
  onClose: () => void;
  busy: boolean;
  nansenHref: (wave: number, laneId: string) => string;
  onPractice: (keys: PracticeKey[]) => void;
  /** Rehearsal coach card, rendered inside the dialog because the page behind it is inert. */
  coach?: ReactNode;
}

function Delta({
  label,
  from,
  to,
  invert,
}: {
  label: string;
  from: number | null;
  to: number | null;
  invert?: boolean;
}) {
  const known = from !== null && to !== null;
  const diff = known ? (to as number) - (from as number) : 0;
  const tone = !known || diff === 0 ? 'delta__flat' : (invert ? diff > 0 : diff < 0) ? 'delta__down' : 'delta__up';
  const sign = known && diff > 0 ? '+' : '';

  return (
    <div className="delta">
      <span className="delta__label">{label}</span>
      <span className="delta__vals">
        <span className="delta__flat">{from ?? '?'}</span>
        <span aria-hidden="true"> → </span>
        <span className={tone}>
          {to ?? '?'} {known ? `(${sign}${diff})` : ''}
        </span>
      </span>
    </div>
  );
}

const fmt = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0');

function sourceName(mod: Modifier): string {
  if (mod.source === 'market') return 'Token Screener';
  if (mod.source === 'weather') return 'Perp Screener';
  if (mod.source === 'perp') return 'Perp Screener';
  if (mod.source === 'combo') return 'Flows × Flow Intelligence';
  return TOOLS[mod.source].nansen;
}

/** The pressure ledger: every source, its value, and whether the player looked before committing. */
function PressureLedger({ lane }: { lane: LaneResult }) {
  const total = lane.baseHazard + lane.modifiers.reduce((s, m) => s + m.value, 0);
  return (
    <table className="ledger">
      <caption className="sr-only">Pressure sources for {lane.name}</caption>
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Reading</th>
          <th scope="col">Pressure</th>
          <th scope="col">Before you chose</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Flow Intelligence · 5m</td>
          <td>{lane.pattern}</td>
          <td className="num">{lane.baseHazard}</td>
          <td>{lane.scouted ? <span className="ledger__seen">scouted</span> : <span className="ledger__missed">fog</span>}</td>
        </tr>
        {lane.modifiers.map((mod) => (
          <tr key={`${mod.source}-${mod.label}`}>
            <td>{sourceName(mod)}</td>
            <td>{mod.label.split(' · ').slice(1).join(' · ') || mod.label}</td>
            <td className={mod.value > 0 ? 'num is-up' : mod.value < 0 ? 'num is-down' : 'num'}>{fmt(mod.value)}</td>
            <td>{mod.seen ? <span className="ledger__seen">seen</span> : <span className="ledger__missed">not opened</span>}</td>
          </tr>
        ))}
        {lane.incoming > 0 ? (
          <tr>
            <td>Neighbor diversion</td>
            <td>pushed in from the previous reach</td>
            <td className="num is-up">+{lane.incoming}</td>
            <td><span className="ledger__seen">your plan</span></td>
          </tr>
        ) : null}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total pressure{total !== lane.hazard - lane.incoming ? ' (bounded 2–40)' : ''}</td>
          <td className="num">{lane.hazard}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function LaneReport({ lane, wave, href, onPractice }: { lane: LaneResult; wave: number; href: string; onPractice: (keys: PracticeKey[]) => void }) {
  const stance: Stance = lane.stance;
  return (
    <article className="lanereport" aria-label={`${lane.name} report`}>
      <header className="lanereport__head">
        <h4 className="lanereport__name" style={{ fontFamily: 'var(--serif)', textTransform: 'none', letterSpacing: 0, color: 'var(--forest)', fontSize: 'var(--step-1)' }}>
          {lane.name} <span className="mono lanereport__token">{lane.token.symbol} · {lane.token.chain}</span>
        </h4>
        <Badge tone="accent">
          {STANCES[lane.effectiveStance].glyph} {STANCES[lane.effectiveStance].name}
          {lane.effectiveStance !== stance ? ' (alert)' : ''}
        </Badge>
        <Badge title="A fictional pressure pattern derived from the available cohort flows.">{lane.pattern}</Badge>
        {lane.changed ? (
          <Badge tone="warn">
            <IconShift size={12} /> cohorts shifted
          </Badge>
        ) : null}
        {lane.alert ? (
          <Badge tone={lane.alert.fired ? 'accent' : 'muted'} title={ALERTS[lane.alert.condition].description}>
            Smart Alert · {lane.alert.fired ? (lane.alert.switched ? 'fired & braced' : 'fired') : 'quiet'}
          </Badge>
        ) : null}
        {lane.call !== 'pass' ? (
          <Badge tone={lane.callHit === true ? 'accent' : lane.callHit === false ? 'warn' : 'muted'} title="A teaching call scored against the real 5m read, not investment advice.">
            {CALLS[lane.call].glyph} Call: {CALLS[lane.call].name}
            {lane.callHit === true ? ' · right +12' : lane.callHit === false ? ' · missed −4' : ' · unscorable'}
          </Badge>
        ) : null}
      </header>

      <div className="lanereport__grid">
        <div>
          <p className="lanereport__narr">{lane.explanation}</p>
          <p className="lanereport__lesson">{lane.lesson}</p>
          <a className="manual-entry__link" href={href} target="_blank" rel="noopener noreferrer" onClick={() => onPractice(['logbook'])}>
            <IconExternal size={13} /> Check {lane.token.symbol} on Nansen yourself
          </a>
        </div>

        <div className="deltas">
          <div className="delta">
            <span className="delta__label">
              <IconHull size={12} /> damage
            </span>
            <span className="delta__vals">
              <span className={lane.damage > 0 ? 'delta__down' : 'delta__flat'}>{lane.damage}</span>
            </span>
          </div>
          <div className="delta">
            <span className="delta__label">
              <IconBolt size={12} /> charge
            </span>
            <span className="delta__vals">
              <span className={lane.energy > 0 ? 'delta__up' : 'delta__flat'}>+{lane.energy}</span>
            </span>
          </div>
          <div className="delta">
            <span className="delta__label">
              <IconTarget size={12} /> points
            </span>
            <span className="delta__vals">
              <span className={lane.points > 0 ? 'delta__up' : 'delta__flat'}>{lane.points}</span>
            </span>
          </div>
          <div className="delta">
            <span className="delta__label">Nansen views read</span>
            <span className="delta__vals">
              <span className="num">{lane.opened.length + (lane.scouted ? 1 : 0)}/6</span>
            </span>
          </div>
        </div>
      </div>

      <details className="lanereport__more" data-coach="ledger" open>
        <summary>Pressure ledger — what each Nansen view said</summary>
        <PressureLedger lane={lane} />
      </details>

      <details className="lanereport__more">
        <summary>Reading proof for {lane.name} (wave {wave})</summary>
        <div style={{ marginTop: 10 }}>
          <ProofBlock laneName={lane.name} kind="resolution" reading={lane.reading} />
        </div>
      </details>
    </article>
  );
}

export function ResolutionPanel({ open, game, round, before, onNext, onClose, busy, nansenHref, onPractice, coach }: ResolutionPanelProps) {
  const isFinal = game.phase === 'finished' || game.wave >= game.maxWaves;
  const nextLabel = isFinal ? 'See final results' : `Next wave · ${Math.min(game.wave + 1, game.maxWaves)} of ${game.maxWaves}`;
  const missed = round.lanes.flatMap((lane) => lane.modifiers.filter((m) => !m.seen && m.value > 0 && m.source in TOOLS)).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Wave ${round.wave} — what the current did`}
      wide
      autofocusSelector="[data-autofocus]"
      footer={
        <>
          <span className="modal__foot-note">
            Every number below comes from the resolved wave. Nothing here is projected forward.
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Back to the board
          </Button>
          <Button variant="primary" data-autofocus data-coach="next" onClick={onNext} disabled={busy} icon={<IconArrowRight size={16} />}>
            {busy ? 'Reading the next wave…' : nextLabel}
          </Button>
        </>
      }
    >
      <div className="round">
        {coach}
        <div className="round__summary">
          <h3 className="round__title">{round.title}</h3>
          <Badge tone={round.damage > 0 ? 'warn' : 'muted'}>{round.damage} hull lost</Badge>
          <Badge>+{round.energy} beacon charge</Badge>
          <Badge tone="accent">+{round.points} points</Badge>
          <Badge tone="muted">Storm glass: {round.weather}</Badge>
        </div>

        <div className="surface" style={{ padding: '12px 14px' }}>
          <h4 style={{ marginBottom: 8 }}>Before → after</h4>
          <div className="deltas">
            <Delta label="Hull" from={before?.hull ?? null} to={game.hull} />
            <Delta label="Charge" from={before?.charge ?? null} to={game.charge} />
            <Delta label="Supply" from={before?.energy ?? null} to={game.energy} />
            <Delta label="Score" from={before?.score ?? null} to={game.score} />
          </div>
          {!before ? (
            <p className="honestnote" style={{ marginTop: 10 }}>
              The previous state was not held in memory for this wave, so only the current values are shown. Missing
              values stay as <strong>?</strong> rather than being guessed.
            </p>
          ) : null}
          {missed > 0 ? (
            <p className="honestnote honestnote--warn" style={{ marginTop: 10 }}>
              {missed} unopened Nansen {missed === 1 ? 'view' : 'views'} added pressure you could have seen. The ledgers below
              show which — that is where an analyst would have looked.
            </p>
          ) : null}
        </div>

        <div className="rules">
          {round.lanes.map((lane) => (
            <LaneReport key={lane.laneId} lane={lane} wave={round.wave} href={nansenHref(round.wave, lane.laneId)} onPractice={onPractice} />
          ))}
        </div>

        <p className="honestnote">
          Pressure values are the game’s fictional layer. The reading proof under each reach shows the real timestamp,
          timeframe, endpoint and request id behind it.
        </p>
      </div>
    </Modal>
  );
}
