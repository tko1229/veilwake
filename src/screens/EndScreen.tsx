import type { GameState, LaneResult } from '../types';
import { DOCTRINES, TOOL_ORDER } from '../types';
import type { PlayerStats } from '../storage';
import { deriveOutcome, researchPrompt } from '../outcome';
import { PRACTICE_KEYS, PRACTICE_NAMES, type PracticeKey } from '../manualData';
import { Badge, Button, CopyButton, ModePlaque, SectionHead } from '../components';
import { IconArrowRight, IconBeacon, IconCheck, IconExternal, IconHelp, IconRefresh } from '../icons';

export interface EndScreenProps {
  game: GameState;
  stats: PlayerStats;
  practiced: PracticeKey[];
  onNewRun: (mode: 'live' | 'demo') => void;
  onBackToWelcome: () => void;
  onOpenRules: () => void;
  onOpenManual: () => void;
  onPractice: (keys: PracticeKey[]) => void;
  nansenHref: (wave: number, laneId: string) => string;
}

function LogbookEntry({ lane, wave, href, onPractice }: { lane: LaneResult; wave: number; href: string; onPractice: (keys: PracticeKey[]) => void }) {
  const verdicts = lane.modifiers.filter((mod) => (TOOL_ORDER as string[]).includes(mod.source));
  const prompt = researchPrompt(lane);
  return (
    <li className="logbook__entry">
      <div className="logbook__top">
        <span className="badge">W{wave}</span>
        <strong className="logbook__symbol">{lane.token.symbol}</strong>
        <span className="mono logbook__chain">{lane.token.chain}</span>
        <span className="logbook__pattern">{lane.pattern}</span>
        <span className="mono logbook__read">{lane.opened.length + (lane.scouted ? 1 : 0)}/6 views read</span>
      </div>
      {verdicts.length > 0 ? (
        <p className="logbook__verdicts">
          {verdicts.map((mod) => (
            <span key={mod.source} className={mod.seen ? 'logbook__v logbook__v--seen' : 'logbook__v'}>
              {mod.label}
            </span>
          ))}
        </p>
      ) : null}
      <div className="logbook__actions">
        <a className="btn btn--ghost btn--sm" href={href} target="_blank" rel="noopener noreferrer" onClick={() => onPractice(['logbook'])}>
          <IconExternal size={14} /> Open on Nansen
        </a>
        <span onClickCapture={() => onPractice(['ai'])}>
          <CopyButton text={prompt} label="Copy Nansen AI prompt" />
        </span>
      </div>
    </li>
  );
}

export function EndScreen({ game, stats, practiced, onNewRun, onBackToWelcome, onOpenRules, onOpenManual, onPractice, nansenHref }: EndScreenProps) {
  const outcome = deriveOutcome(game);
  const doctrineName = DOCTRINES[game.doctrine]?.name ?? game.doctrine;
  const practicedCount = PRACTICE_KEYS.filter((key) => practiced.includes(key)).length;

  return (
    <div className="end">
      <header>
        <div className="end__verdict">
          <ModePlaque mode={game.mode} />
          <Badge tone={outcome.victory ? 'accent' : 'warn'}>{outcome.victory ? 'Run complete' : 'Run ended'}</Badge>
          <Badge>{doctrineName} doctrine</Badge>
          <Badge>
            {game.history.length} of {game.maxWaves} waves resolved
          </Badge>
        </div>
        <h1 style={{ marginTop: 18 }}>{outcome.verdictTitle}</h1>
        <p className="welcome__lede">{outcome.verdictNote}</p>
      </header>

      <div className="end__hero">
        <section className="surface startblock" aria-labelledby="end-score-title">
          <p className="end__scorelabel">Final score</p>
          <p className="end__score">{game.score}</p>
          <p className="end__title" id="end-score-title">
            Rank · {outcome.rank}
          </p>

          <div className="statgrid" style={{ marginTop: 18 }}>
            <div className="statgrid__cell">
              <p className="statgrid__label">Charge</p>
              <p className="statgrid__value">
                {game.charge}/{game.target}
              </p>
            </div>
            <div className="statgrid__cell">
              <p className="statgrid__label">Hull left</p>
              <p className="statgrid__value">{game.hull}</p>
            </div>
            <div className="statgrid__cell">
              <p className="statgrid__label">Supply left</p>
              <p className="statgrid__value">{game.energy}</p>
            </div>
          </div>

          <div className="statgrid" style={{ marginTop: 10 }}>
            <div className="statgrid__cell">
              <p className="statgrid__label">Damage taken</p>
              <p className="statgrid__value">{outcome.totals.damageTaken}</p>
            </div>
            <div className="statgrid__cell">
              <p className="statgrid__label">Supply spent</p>
              <p className="statgrid__value">{outcome.totals.supplySpent}</p>
            </div>
            <div className="statgrid__cell">
              <p className="statgrid__label">Nansen views</p>
              <p className="statgrid__value">{outcome.totals.viewsOpened}</p>
            </div>
          </div>

          <p className="honestnote" style={{ marginTop: 16 }}>
            Your record on this device: {stats.runs} {stats.runs === 1 ? 'run' : 'runs'}, {stats.wins}{' '}
            {stats.wins === 1 ? 'win' : 'wins'}, best score {stats.bestScore}. Only these counters are kept locally.
          </p>
        </section>

        <section className="surface startblock" aria-labelledby="end-ach-title">
          <SectionHead
            title="Achievements"
            id="end-ach-title"
            note={outcome.achievements.length === 0 ? 'none this run' : `${outcome.achievements.length} earned`}
          />
          {outcome.achievements.length > 0 ? (
            <ul className="achievements">
              {outcome.achievements.map((achievement) => (
                <li className="achievement" key={achievement.id}>
                  <span style={{ color: 'var(--vermilion-2)' }} aria-hidden="true">
                    <IconCheck size={18} />
                  </span>
                  <span>
                    <span className="achievement__name">{achievement.name}</span>
                    <span className="achievement__desc" style={{ display: 'block' }}>
                      {achievement.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="honestnote">
              No achievement conditions were met this run. They are read straight off the resolved waves — nothing is
              awarded for simply finishing.
            </p>
          )}

          <hr className="rule" style={{ margin: '16px 0' }} />

          <SectionHead title="Wave by wave" note="from the resolved history" />
          {game.history.length > 0 ? (
            <ul className="waves">
              {game.history.map((round) => (
                <li className="waverow" key={round.wave}>
                  <span className="badge">W{round.wave}</span>
                  <span className="waverow__title wrap-anywhere">{round.title}</span>
                  <span className="waverow__stats">
                    {round.damage} hull · +{round.energy} supply · +{round.points} pts
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="honestnote">No wave was resolved before the run ended.</p>
          )}
        </section>
      </div>

      <section className="surface startblock" aria-labelledby="end-logbook-title">
        <SectionHead
          title="Research logbook — continue on Nansen"
          id="end-logbook-title"
          note={`${outcome.totals.viewsOpened} Nansen views opened this run`}
        />
        <p className="startblock__body">
          The game ends at the decision; the research does not. Every reach you sailed is a real token. Open it in Token God
          Mode to repeat what you did here, add it to a watchlist, or paste the prompt into Nansen AI.
          {game.mode === 'demo' ? ' (Rehearsal tokens are fictional, so their links open the Nansen Token Screener.)' : ' Links work while this voyage is still afloat on the server.'}
        </p>
        <ul className="logbook">
          {game.history.flatMap((round) =>
            round.lanes.map((lane) => (
              <LogbookEntry key={`${round.wave}-${lane.laneId}`} lane={lane} wave={round.wave} href={nansenHref(round.wave, lane.laneId)} onPractice={onPractice} />
            )),
          )}
        </ul>

        <hr className="rule" style={{ margin: '16px 0' }} />

        <SectionHead title="Nansen skills practiced" note={`${practicedCount}/${PRACTICE_KEYS.length} on this device`} />
        <ul className="skills">
          {PRACTICE_KEYS.map((key) => (
            <li key={key} className={practiced.includes(key) ? 'skill skill--done' : 'skill'}>
              {practiced.includes(key) ? <IconCheck size={13} /> : <span aria-hidden="true">○</span>} {PRACTICE_NAMES[key]}
            </li>
          ))}
        </ul>
        <div className="startblock__actions">
          <Button variant="ghost" onClick={onOpenManual} icon={<IconBeacon size={15} />}>
            Open the field manual
          </Button>
        </div>
      </section>

      <section className="surface startblock" aria-labelledby="end-actions-title">
        <SectionHead title="What next" id="end-actions-title" note="results below are spoiler-free" />

        <div className="startblock__actions">
          <Button variant="primary" size="lg" onClick={() => onNewRun('live')} icon={<IconBeacon size={16} />}>
            New live run
          </Button>
          <Button variant="solid" size="lg" onClick={() => onNewRun('demo')} icon={<IconRefresh size={16} />}>
            {game.mode === 'demo' ? 'Replay the tutorial' : 'Play the tutorial'}
          </Button>
          <Button variant="ghost" onClick={onBackToWelcome} icon={<IconArrowRight size={16} />}>
            Back to the title
          </Button>
          <Button variant="quiet" onClick={onOpenRules} icon={<IconHelp size={15} />}>
            Rules &amp; cohort legend
          </Button>
        </div>

        <p className="honestnote" style={{ marginTop: 16 }}>
          The copied summary contains your score, doctrine, charge, hull and achievements only. It names no reach, no
          hazard and no reading, so it cannot spoil the fog for someone else.
        </p>

        <div style={{ marginTop: 12 }}>
          <CopyButton text={outcome.shareText} label="Copy spoiler-free results" />
        </div>

        <details style={{ marginTop: 14 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--step--2)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--forest-3)',
            }}
          >
            Read the summary before copying
          </summary>
          <pre
            className="errdetail"
            style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)' }}
          >
            {outcome.shareText}
          </pre>
        </details>
      </section>
    </div>
  );
}
