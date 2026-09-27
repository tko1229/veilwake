import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertCondition, AlertPlan, CallChoice, Doctrine, GameState, HealthReport, IntelToolId, Mode, Plans, ScreenId, Stance } from './types';
import { ALERTS, STANCES, TOOLS } from './types';
import { ApiError, api, describeFailure } from './api';
import {
  forgetSession,
  readState,
  recordPractice,
  recordRunFinished,
  recordRunStarted,
  rememberSession,
  setTutorialCompleted,
  setTutorialDismissed,
  type PersistedState,
} from './storage';
import type { PracticeKey } from './manualData';
import { Investigation, MarketFacts, ProvenanceLine } from './Investigation';
import { FieldManual } from './FieldManual';
import {
  Badge,
  Button,
  ExternalLink,
  LiveRegion,
  ModePlaque,
  Modal,
  ProofBlock,
  ProofNotes,
  SectionHead,
  Toasts,
  type ToastMessage,
} from './components';
import { WorldBoard } from './WorldBoard';
import { Welcome } from './screens/Welcome';
import { EndScreen } from './screens/EndScreen';
import { ResolutionPanel } from './screens/ResolutionPanel';
import { OnboardingModal } from './OnboardingModal';
import { AdminView } from './AdminView';
import { CoachCard, useCoachHighlight } from './Coach';
import { coachStep, planEvent, TUTORIAL_DOCTRINE, type CoachAction } from './coachSteps';
import { IconAlert, IconBeacon, IconGauge, IconHelp, IconLayers, IconLens, IconRefresh } from './icons';

const LIVE_QUERIES = [
  'Token Screener — nine active tokens across Ethereum, Base and Solana',
  'Perp Screener — Smart Money positioning on Hyperliquid (the storm glass)',
  'Flow Intelligence — six labeled cohorts, 1h context and 1d baseline',
  'Then, in the background: Who Bought/Sold, DEX Trades, Transfers, Smart Money Flows and a Profiler lookup',
];

type LoadContext =
  | { kind: 'start'; mode: Mode; doctrine: Doctrine }
  | { kind: 'resume'; id: string; mode: Mode };

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  const message = cause instanceof Error ? cause.message : 'Unexpected failure.';
  return new ApiError(message, 'unknown', 0);
}

function seedPlans(game: GameState): Plans {
  const seeded: Plans = {};
  for (const lane of game.lanes) {
    seeded[lane.id] = game.plans?.[lane.id] ?? 'harvest';
  }
  return seeded;
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>('welcome');
  const [mode, setMode] = useState<Mode>('live');
  const [doctrine, setDoctrine] = useState<Doctrine>('keeper');
  const [game, setGame] = useState<GameState | null>(null);
  const [plans, setPlans] = useState<Plans>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [loadingNote, setLoadingNote] = useState('Reading the current…');
  const [loaderRunning, setLoaderRunning] = useState(false);
  const [preResolve, setPreResolve] = useState<GameState | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [firstTimeRules, setFirstTimeRules] = useState(false);
  const [persisted, setPersisted] = useState<PersistedState>(() => readState());
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [live, setLive] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [calls, setCalls] = useState<Record<string, CallChoice>>({});
  const [alert, setAlert] = useState<AlertPlan | null>(null);
  const [tgmLane, setTgmLane] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [coachAcks, setCoachAcks] = useState<ReadonlySet<string>>(() => new Set());
  const [coachHidden, setCoachHidden] = useState(false);
  const ackCoach = useCallback((id: string) => {
    setCoachAcks((current) => new Set(current).add(id));
  }, []);
  // A new run (or a resumed one) starts the coach fresh.
  const coachRunId = game?.id ?? null;
  useEffect(() => {
    setCoachAcks(new Set());
    setCoachHidden(false);
  }, [coachRunId]);

  const pendingRef = useRef<LoadContext | null>(null);
  const recordedRef = useRef<string | null>(null);
  const waveRef = useRef<{ id: string; wave: number } | null>(null);
  const toastId = useRef(0);
  const bootedRef = useRef(false);

  /* ------------------------------------------------------------- helpers */

  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((message) => message.id !== id));
    }, 8000);
  }, []);

  const acceptGame = useCallback((next: GameState) => {
    const previous = waveRef.current;
    const isNewBoard = !previous || previous.id !== next.id || previous.wave !== next.wave;

    // A different voyage must never inherit the previous one's open Token God Mode panel.
    if (!previous || previous.id !== next.id) setTgmLane(null);
    setGame(next);
    if (isNewBoard || next.phase !== 'planning') setPlans(seedPlans(next));
    if (isNewBoard) {
      setCalls(next.phase === 'planning' ? {} : next.calls ?? {});
      setAlert(next.phase === 'planning' ? null : next.alert ?? null);
    }
    waveRef.current = { id: next.id, wave: next.wave };
    setScreen('game');
    setLoadError(null);
    setActionError(null);

    if (next.phase === 'finished' && recordedRef.current !== next.id) {
      recordedRef.current = next.id;
      setPersisted(recordRunFinished(next.victory === true, next.score));
      // All three chapters played: the tutorial counts as done, whatever the result.
      if (next.mode === 'demo' && next.history.length >= next.maxWaves) setPersisted(setTutorialCompleted());
      setPersisted(forgetSession());
      // The end screen replaces a long board; start reading it from the top.
      window.scrollTo({ top: 0 });
    }
  }, []);

  const runLoad = useCallback(
    async (context: LoadContext) => {
      pendingRef.current = context;
      setMode(context.mode);
      setLoadError(null);
      setActionError(null);
      setScreen('loading');
      setLoadingNote(
        context.kind === 'resume'
          ? 'Resuming your run…'
          : context.mode === 'live'
            ? 'Reading the live current…'
            : 'Setting up the rehearsal…',
      );
      setLoaderRunning(false);
      window.requestAnimationFrame(() => setLoaderRunning(true));

      try {
        const next =
          context.kind === 'resume'
            ? await api.getGame(context.id)
            : await api.createGame(context.mode, context.doctrine);

        if (context.kind === 'start') setPersisted(recordRunStarted());

        acceptGame(next);
        if (next.phase !== 'finished') setPersisted(rememberSession(next.id, next.mode));

        if (next.phase === 'resolved' && next.history.length > 0) {
          setPreResolve(null);
          setShowResolution(true);
        }
        setLive(
          context.kind === 'resume'
            ? `Run resumed. Wave ${next.wave} of ${next.maxWaves}.`
            : `Run started. ${next.lanes.length} reaches ahead.`,
        );
      } catch (cause) {
        const error = toApiError(cause);

        if (context.kind === 'resume' && error.isExpired) {
          setPersisted(forgetSession());
          setNotice(
            'Your previous run had already expired, so it could not be resumed. Nothing was lost — the counters on this device are unchanged. Start a fresh run below.',
          );
          setScreen('welcome');
          pendingRef.current = null;
          return;
        }

        setLoadError(error);
        setScreen('loading');
      }
    },
    [acceptGame],
  );

  const handleActionError = useCallback(
    async (cause: unknown) => {
      const error = toApiError(cause);
      const current = game;

      if (error.isConflict && current) {
        try {
          const fresh = await api.getGame(current.id);
          // acceptGame keeps the player's gate choices while the same wave is still
          // being planned (the server only ever holds all-Harvest during planning).
          acceptGame(fresh);
          pushToast('The board was reloaded from the server. Your gate choices were kept.', 'info');
          return;
        } catch {
          /* fall through to the generic path */
        }
      }

      if (error.isExpired) {
        setPersisted(forgetSession());
        setGame(null);
        setTgmLane(null);
        setShowProof(false);
        setShowResolution(false);
        setNotice(
          'That run expired on the server. Nothing is lost locally — start a fresh run whenever you are ready.',
        );
        setScreen('welcome');
        return;
      }

      setActionError(error);
      pushToast(error.message, 'warn');
    },
    [acceptGame, game, pushToast],
  );

  /* ------------------------------------------------------------ bootstrap */

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const stored = readState();
    setPersisted(stored);
    // The first view is the product, not a blocking instruction modal.
    // Rules remain one click away; the board provides contextual guidance.

    void api
      .health()
      .then((report) => {
        setHealth(report);
        setHealthFailed(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthFailed(true);
      });

    if (stored.sessionId && stored.mode) {
      void runLoad({ kind: 'resume', id: stored.sessionId, mode: stored.mode });
    }
  }, [runLoad]);

  /* --------------------------------------------------------------- actions */

  const startRun = useCallback(
    (nextMode: Mode) => {
      setMode(nextMode);
      void runLoad({ kind: 'start', mode: nextMode, doctrine });
    },
    [doctrine, runLoad],
  );

  /** The rehearsal is the tutorial, and the tutorial is written for Keeper's budget. */
  const startTutorial = useCallback(() => {
    setMode('demo');
    void runLoad({ kind: 'start', mode: 'demo', doctrine: TUTORIAL_DOCTRINE });
  }, [runLoad]);

  /** Title and end-screen buttons: live uses the chosen doctrine, the rehearsal is always the tutorial. */
  const startMode = useCallback(
    (nextMode: Mode) => {
      if (nextMode === 'demo') startTutorial();
      else startRun(nextMode);
    },
    [startRun, startTutorial],
  );

  const retryLoad = useCallback(() => {
    const context = pendingRef.current;
    if (context) void runLoad(context);
  }, [runLoad]);

  const switchToRehearsal = useCallback(() => {
    pushToast('You switched to the rehearsal deliberately. Live reads were not used for this run.', 'info');
    startTutorial();
  }, [pushToast, startTutorial]);

  const backToTitle = useCallback(() => {
    setShowResolution(false);
    setPreResolve(null);
    setTgmLane(null);
    setShowProof(false);
    setGame(null);
    setActionError(null);
    setLoadError(null);
    setScreen('welcome');
  }, []);

  const currentWave = game?.wave ?? 1;
  const planLane = useCallback(
    (laneId: string, stance: Stance) => {
      setPlans((current) => ({ ...current, [laneId]: stance }));
      // Lets the tutorial see a click on a stance that was already selected.
      ackCoach(planEvent(currentWave, laneId, stance));
    },
    [ackCoach, currentWave],
  );

  const practice = useCallback((keys: PracticeKey[]) => {
    setPersisted(recordPractice(keys));
  }, []);

  const callLane = useCallback((laneId: string, call: CallChoice) => {
    setCalls((current) => ({ ...current, [laneId]: call }));
  }, []);

  const alertLane = useCallback((laneId: string, condition: AlertCondition | null) => {
    setAlert((current) => {
      if (condition) return { laneId, condition };
      return current && current.laneId === laneId ? null : current;
    });
  }, []);

  const investigateLane = useCallback(
    async (laneId: string, tool: IntelToolId) => {
      if (!game || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        const next = await api.investigate(game.id, laneId, tool, game.revision);
        acceptGame(next);
        practice([tool]);
        const lane = next.lanes.find((item) => item.id === laneId);
        const clue = lane?.intel?.[tool];
        setLive(`${TOOLS[tool].nansen} on ${lane?.name ?? laneId}: ${clue?.verdict ?? 'opened'}. ${next.intel} lenses left.`);
      } catch (cause) {
        await handleActionError(cause);
      } finally {
        setBusy(false);
      }
    },
    [acceptGame, busy, game, handleActionError, practice],
  );

  const scoutLane = useCallback(
    async (laneId: string) => {
      if (!game || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        const next = await api.scout(game.id, laneId, game.revision);
        acceptGame(next);
        practice(['flow']);
        const laneName = next.lanes.find((lane) => lane.id === laneId)?.name ?? laneId;
        setLive(`Scouted ${laneName}. One lens spent, ${next.intel} left.`);
      } catch (cause) {
        await handleActionError(cause);
      } finally {
        setBusy(false);
      }
    },
    [acceptGame, busy, game, handleActionError, practice],
  );

  const resolveWave = useCallback(async () => {
    if (!game || busy) return;
    setBusy(true);
    setActionError(null);
    const snapshot = game;
    const liveCalls = Object.fromEntries(Object.entries(calls).filter(([laneId, call]) => call !== 'pass' && game.lanes.some((lane) => lane.id === laneId)));
    const liveAlert = alert && game.lanes.some((lane) => lane.id === alert.laneId) ? alert : null;
    try {
      const next = await api.resolve(game.id, plans, game.revision, { alert: liveAlert, calls: liveCalls });
      setPreResolve(snapshot);
      acceptGame(next);
      const keys: PracticeKey[] = [];
      if (liveAlert) keys.push('alert');
      if (Object.keys(liveCalls).length > 0) keys.push('call');
      if (keys.length) practice(keys);
      setTgmLane(null);
      setShowResolution(true);
      setLive(`Wave ${snapshot.wave} resolved. ${next.hull} hull, ${next.charge} of ${next.target} charge.`);
    } catch (cause) {
      await handleActionError(cause);
    } finally {
      setBusy(false);
    }
  }, [acceptGame, alert, busy, calls, game, handleActionError, plans, practice]);

  const advanceWave = useCallback(async () => {
    if (!game || busy) return;
    if (game.phase !== 'resolved') {
      setShowResolution(false);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const next = await api.next(game.id, game.revision);
      setShowResolution(false);
      setPreResolve(null);
      acceptGame(next);
      setLive(next.phase === 'finished' ? 'Run finished.' : `Wave ${next.wave} of ${next.maxWaves} begins.`);
    } catch (cause) {
      await handleActionError(cause);
    } finally {
      setBusy(false);
    }
  }, [acceptGame, busy, game, handleActionError]);

  const closeRules = useCallback(() => {
    setShowRules(false);
    setFirstTimeRules(false);
    setPersisted(setTutorialDismissed(true));
  }, []);

  const openRules = useCallback(() => {
    setFirstTimeRules(false);
    setShowRules(true);
  }, []);

  /* ------------------------------------------------------------ derived */

  const totalCost = game
    ? game.lanes.reduce((sum, lane) => sum + (STANCES[plans[lane.id] ?? 'harvest']?.cost ?? 0), 0)
    : 0;
  const overspend = game ? totalCost > game.energy : false;
  const canResolve = Boolean(game) && !busy && game?.phase === 'planning' && !overspend;
  const lastRound = game && game.history.length > 0 ? game.history[game.history.length - 1] : null;

  const resolveHint = overspend
    ? `That plan costs ${totalCost} supply and you hold ${game?.energy ?? 0}. Lower a stance, or harvest a reach for free.`
    : 'Harvest catches the current. Brace holds the gates for 1 supply. Divert seals a reach for 2 and pushes the pressure next door.';

  const alertName = alert && game ? game.lanes.find((lane) => lane.id === alert.laneId)?.name : null;
  const planSummary = game
    ? game.lanes.map((lane) => `${lane.name}: ${STANCES[plans[lane.id] ?? 'harvest']?.name ?? 'Harvest'}`).join(' · ') +
      (alert && alertName ? ` · Smart Alert: ${ALERTS[alert.condition].name} on ${alertName}` : ' · No Smart Alert set')
    : '';

  const actionCopy = actionError && game ? describeFailure(actionError, game.mode) : null;
  // Dialogs make the page behind them inert, so a failure raised from inside one
  // (Next wave, opening a view) is repeated inside the dialog itself.
  const dialogAlert = actionCopy ? (
    <div className="surface" role="alert" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12, borderColor: 'var(--vermilion, #c36547)' }}>
      <IconAlert size={16} />
      <p style={{ margin: 0, flex: '1 1 220px', fontSize: 'var(--step--1)', color: 'var(--forest-2)' }}>
        <strong>{actionCopy.title}.</strong> {actionCopy.body}
      </p>
      <Button variant="quiet" onClick={() => setActionError(null)}>
        Dismiss
      </Button>
    </div>
  ) : null;

  // Tutorial coach: derived from state on every render, so it follows the player.
  const coach =
    game && screen === 'game' && game.mode === 'demo' && !coachHidden
      ? coachStep({ game, plans, calls, alert, tgmLane, acked: coachAcks, liveReady: health?.keyConfigured !== false })
      : null;
  const onCoachAction = (action: CoachAction) => {
    if (action === 'start-live') startRun('live');
    else startTutorial();
  };
  useCoachHighlight(coach ? coach.targets : null, coach ? coach.id : null);
  const coachSurface: 'tgm' | 'report' | 'floating' | null = !coach
    ? null
    : tgmLane !== null && game?.phase !== 'finished'
      ? 'tgm'
      : showResolution && game?.phase !== 'finished'
        ? 'report'
        : 'floating';
  const renderCoach = (variant: 'floating' | 'inline') =>
    coach ? (
      <CoachCard
        step={coach}
        variant={variant}
        onAck={ackCoach}
        onHide={() => setCoachHidden(true)}
        onAction={onCoachAction}
        onOpenRules={openRules}
      />
    ) : null;

  /* --------------------------------------------------------------- render */

  return (
    <div className="shell">
      <a className="skiplink" href="#main">
        Skip to the board
      </a>

      <header className="topbar">
        <div className="shell__inner topbar__inner">
          <div className="brand">
            <span className="brand__mark">VEILWAKE</span>
            <span className="brand__tag">Read the current</span>
          </div>

          {screen === 'game' && game ? <ModePlaque mode={game.mode} compact /> : screen === 'admin' ? <Badge>Engine room</Badge> : <Badge>ON-CHAIN STRATEGY</Badge>}

          <div className="topbar__spacer" />

          <nav className="topbar__nav" aria-label="Game navigation">
            {screen === 'game' && game ? (
              <>
                <Badge>Wave {Math.min(game.wave, game.maxWaves)}/{game.maxWaves}</Badge>
                <Badge tone="accent">Charge {game.charge}/{game.target}</Badge>
                {game.mode === 'demo' && coachHidden ? (
                  <Button variant="quiet" onClick={() => setCoachHidden(false)} icon={<IconBeacon size={15} />} title="Show the tutorial coach again">
                    Tutorial
                  </Button>
                ) : null}
                <Button variant="quiet" onClick={() => setShowProof(true)} icon={<IconLayers size={15} />}>
                  Source proof
                </Button>
              </>
            ) : null}
            <Button variant="quiet" onClick={() => setShowManual(true)} icon={<IconBeacon size={15} />}>
              Field manual
            </Button>
            <Button variant="quiet" onClick={openRules} icon={<IconHelp size={15} />}>
              Rules
            </Button>
            <Button
              variant="quiet"
              onClick={() => setScreen(screen === 'admin' ? (game ? 'game' : 'welcome') : 'admin')}
              icon={<IconGauge size={15} />}
            >
              {screen === 'admin' ? 'Back to game' : 'Engine room'}
            </Button>
            {screen === 'game' && game ? (
              <Button variant="quiet" onClick={backToTitle}>
                Title
              </Button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="shell__inner" id="main" style={{ paddingBottom: 40 }}>
        <LiveRegion message={live} />

        {screen === 'welcome' ? (
          <Welcome
            mode={mode}
            onModeChange={setMode}
            doctrine={doctrine}
            onDoctrineChange={setDoctrine}
            onStart={startMode}
            tutorialCompleted={persisted.tutorialCompleted}
            health={health}
            healthFailed={healthFailed}
            stats={persisted.stats}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
            onOpenRules={openRules}
            onOpenManual={() => setShowManual(true)}
            practicedCount={persisted.practiced.length}
          />
        ) : null}

        {screen === 'loading' ? (
          <div className="centerstage">
            <section className="stagecard" aria-busy={!loadError} aria-labelledby="load-title">
              {loadError ? (
                <>
                  <p className="stagecard__kicker">
                    <IconAlert size={13} /> {mode === 'live' ? 'Live read failed' : 'Rehearsal failed'}
                  </p>
                  <h1 className="stagecard__title" id="load-title">
                    {describeFailure(loadError, mode).title}
                  </h1>
                  <p className="stagecard__body">{describeFailure(loadError, mode).body}</p>

                  <div className="errdetail">
                    <div className="errdetail__row">
                      <span className="errdetail__k">code</span>
                      <span>{loadError.code}</span>
                    </div>
                    <div className="errdetail__row">
                      <span className="errdetail__k">status</span>
                      <span>{loadError.status === 0 ? 'no response' : loadError.status}</span>
                    </div>
                    {loadError.retryAfter ? (
                      <div className="errdetail__row">
                        <span className="errdetail__k">retry after</span>
                        <span>{loadError.retryAfter}s</span>
                      </div>
                    ) : null}
                    <div className="errdetail__row">
                      <span className="errdetail__k">detail</span>
                      <span className="wrap-anywhere">{loadError.message}</span>
                    </div>
                  </div>

                  <div className="stagecard__actions">
                    <Button variant="primary" onClick={retryLoad} icon={<IconRefresh size={16} />}>
                      Retry {pendingRef.current?.kind === 'resume' ? 'resuming' : 'this run'}
                    </Button>
                    {loadError.canDemo === true && mode === 'live' ? (
                      <Button variant="solid" onClick={switchToRehearsal} icon={<IconLens size={16} />}>
                        Switch to the 60-second rehearsal
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={backToTitle}>
                      Back to the title
                    </Button>
                  </div>

                  <p className="stagecard__meta">
                    {mode === 'live'
                      ? 'Live runs are never swapped to a demo automatically. If you want the rehearsal, you choose it.'
                      : 'The rehearsal runs on the same server. If it is unreachable, neither mode will start.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="stagecard__kicker">
                    {pendingRef.current?.kind === 'resume' ? 'Resuming' : mode === 'live' ? 'Live data' : 'Demo · fictional scenario'}
                  </p>
                  <h1 className="stagecard__title" id="load-title">
                    {loadingNote}
                  </h1>
                  <p className="stagecard__body">
                    {mode === 'live'
                      ? 'Querying the Nansen API the way an analyst would. Upstream caches its own reads for roughly 10–30 minutes, so a read can arrive already timestamped. No number is displayed until it is real.'
                      : 'Building a deterministic fictional current. No network reads are used and every value is fixed in advance.'}
                  </p>
                  {mode === 'live' && pendingRef.current?.kind !== 'resume' ? (
                    <ol className="querylist">
                      {LIVE_QUERIES.map((query) => (
                        <li key={query}>{query}</li>
                      ))}
                    </ol>
                  ) : null}
                  <div className="loaderrule" aria-hidden="true">
                    <div className={loaderRunning ? 'loaderrule__fill loaderrule__fill--run' : 'loaderrule__fill'} />
                  </div>
                  <p className="stagecard__meta">
                    {pendingRef.current?.kind === 'resume'
                      ? 'Restoring the run stored on this device.'
                      : 'This usually takes a few seconds. A slow read is still a real read.'}
                  </p>
                </>
              )}
            </section>
          </div>
        ) : null}

        {screen === 'admin' ? <AdminView onBack={() => setScreen(game ? 'game' : 'welcome')} /> : null}

        {screen === 'game' && game ? (
          game.phase === 'finished' ? (
            <EndScreen
              game={game}
              stats={persisted.stats}
              practiced={persisted.practiced}
              onNewRun={startMode}
              onBackToWelcome={backToTitle}
              onOpenRules={openRules}
              onOpenManual={() => setShowManual(true)}
              onPractice={practice}
              nansenHref={(wave, laneId) => api.nansenHref(game.id, wave, laneId)}
            />
          ) : (
            <div className="board">
              <h1 className="sr-only">
                VEILWAKE board — wave {Math.min(game.wave, game.maxWaves)} of {game.maxWaves}, {game.mode === 'live' ? 'live data run' : 'fictional demo run'}
              </h1>

              {actionCopy ? (
                <div className="surface" role="alert" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <IconAlert size={18} />
                  <p style={{ margin: 0, flex: '1 1 260px', fontSize: 'var(--step--1)', color: 'var(--forest-2)' }}>
                    <strong>{actionCopy.title}.</strong> {actionCopy.body}
                  </p>
                  <Button variant="quiet" onClick={() => setActionError(null)}>
                    Dismiss
                  </Button>
                </div>
              ) : null}

              <WorldBoard
                game={game}
                plans={plans}
                onPlan={planLane}
                calls={calls}
                onCall={callLane}
                alert={alert}
                onAlert={alertLane}
                onOpenTgm={(laneId) => setTgmLane(laneId)}
                onScout={(laneId) => void scoutLane(laneId)}
                onPractice={practice}
                busy={busy}
              />

              {game.phase === 'resolved' ? (
                <section className="resolvebar" aria-label="Wave report">
                  <div className="resolvebar__hint">
                    <p className="resolvebar__hintline">Wave {game.wave} is resolved</p>
                    <p className="resolvebar__sub">
                      The report holds each reach's narrative, the before-and-after hull and charge, and the reading
                      proof behind it.
                    </p>
                  </div>
                  <div className="resolvebar__action">
                    <Button variant="ghost" onClick={() => setShowResolution(true)} icon={<IconLayers size={16} />}>
                      Review the wave report
                    </Button>
                    <Button variant="primary" size="lg" disabled={busy} data-coach="next" onClick={() => void advanceWave()}>
                      {busy
                        ? 'Working…'
                        : game.wave >= game.maxWaves
                          ? 'See final results'
                          : `Continue to wave ${game.wave + 1}`}
                    </Button>
                  </div>
                </section>
              ) : (
                <section className="resolvebar" aria-label="Resolve the wave">
                  <div className="resolvebar__hint">
                    <p className="resolvebar__hintline">
                      Selected cost {totalCost} of {game.energy} supply
                    </p>
                    <p className="resolvebar__sub">{resolveHint}</p>
                    <p className="resolvebar__sub wrap-anywhere">{planSummary}</p>
                  </div>
                  <div className="resolvebar__action">
                    <span className={overspend ? 'costchip costchip--over' : 'costchip'}>
                      <span>cost</span>
                      <strong className="num">
                        {totalCost}/{game.energy}
                      </strong>
                    </span>
                    <Button
                      variant="primary"
                      size="lg"
                      disabled={!canResolve}
                      data-coach="resolve"
                      onClick={() => void resolveWave()}
                      aria-describedby="resolve-hint"
                    >
                      {busy ? 'Working…' : `Resolve wave ${game.wave}`}
                    </Button>
                  </div>
                  <p className="sr-only" id="resolve-hint">
                    {overspend
                      ? 'The selected stances cost more supply than you hold, so resolve is disabled.'
                      : `Resolving spends ${totalCost} supply and ends wave ${game.wave}.`}
                  </p>
                </section>
              )}

              <section className="surface startblock" aria-labelledby="board-truth">
                <SectionHead title="Reading the board honestly" id="board-truth" />
                <div className="rules__two">
                  <div className="rulecard">
                    <p className="rulecard__title">Fog of war</p>
                    <p className="rulecard__body">
                      A reach hides most of its cohorts and all five toolkit views until you open them. Before that you
                      see the Token Screener snapshot, whale and exchange flow, the storm glass and the surface — never
                      the hidden pressure. Every view is stripped on the server, not blurred in the browser.
                    </p>
                  </div>
                  <div className="rulecard">
                    <p className="rulecard__title">No claims about intent</p>
                    <p className="rulecard__body">
                      A cohort flow is a windowed observation, not a statement about what any wallet meant or will do
                      next. VEILWAKE never says a specific transaction just happened.
                    </p>
                  </div>
                </div>
                <div className="startblock__actions">
                  <Button variant="ghost" onClick={() => setShowProof(true)} icon={<IconLayers size={16} />}>
                    Open the source-proof panel
                  </Button>
                  <Button variant="quiet" onClick={openRules} icon={<IconHelp size={15} />}>
                    Rules &amp; cohort legend
                  </Button>
                </div>
              </section>
            </div>
          )
        ) : null}
      </main>

      <footer className="footer">
        <div className="shell__inner footer__inner">
          <div>
            <p className="footer__brand">Veilwake</p>
            <p className="footer__note" style={{ marginTop: 6 }}>
              Reaches, hazards, hull and charge are fiction. In LIVE mode, cohort readings come from Nansen;
              DEMO mode is an authored scenario. Overlapping past windows are not predictions or investment advice.
              No raw wallet lists or USD amounts are sent to players or saved on disk.
            </p>
          </div>
          <div className="footer__meta">
            <ExternalLink href="https://nansen.ai">Powered by Nansen API</ExternalLink>
            <p className="footer__note">
              Upstream caches reads for roughly 10–30 minutes. Missing values render as <span className="mono">?</span>,
              never as zero.
            </p>
            <p className="footer__note">
              Stored locally: session id, mode, two tutorial flags, three counters about you and the names of the
              Nansen skills you have practiced. Nothing else.
            </p>
          </div>
        </div>
      </footer>

      <OnboardingModal open={showRules} onClose={closeRules} firstTime={firstTimeRules} onOpenManual={() => { closeRules(); setShowManual(true); }} />

      <FieldManual open={showManual} onClose={() => setShowManual(false)} practiced={persisted.practiced} />

      {game && game.phase !== 'finished' ? (
        <Investigation
          open={tgmLane !== null}
          game={game}
          laneId={tgmLane}
          busy={busy}
          onClose={() => setTgmLane(null)}
          onScout={(laneId) => void scoutLane(laneId)}
          onInvestigate={(laneId, tool) => void investigateLane(laneId, tool)}
          nansenHref={tgmLane ? api.nansenHref(game.id, game.wave, tgmLane) : null}
          onPractice={practice}
          coach={<>{dialogAlert}{coachSurface === 'tgm' ? renderCoach('inline') : null}</>}
        />
      ) : null}

      {game ? (
        <Modal
          open={showProof}
          onClose={() => setShowProof(false)}
          title="API source proof"
          wide
          autofocusSelector="[data-autofocus]"
          footer={
            <>
              <span className="modal__foot-note">
                Fetch times are recorded by this server; request IDs come from Nansen. Rehearsal has no live request IDs.
              </span>
              <Button variant="ghost" data-autofocus onClick={() => setShowProof(false)}>
                Close
              </Button>
            </>
          }
        >
          <div className="proof">
            <ProofNotes />
            <hr className="rule" />
            <h3 style={{ fontSize: 'var(--step-2)', marginBottom: 10 }}>Reads behind this board</h3>
            <article className="proof__reading">
              <header className="proof__head">
                <span className="proof__lane">Storm glass</span>
                <span className="proof__kind">Perp Screener · {game.weather.name}</span>
              </header>
              <ProvenanceLine provenance={game.weather.provenance} />
            </article>
            {game.lanes.map((lane) => (
              <div key={lane.id} style={{ display: 'grid', gap: 10 }}>
                <article className="proof__reading">
                  <header className="proof__head">
                    <span className="proof__lane">{lane.name} · {lane.token.symbol}</span>
                    <span className="proof__kind">Token Screener snapshot</span>
                  </header>
                  <MarketFacts market={lane.market} />
                  <ProvenanceLine provenance={lane.market.provenance} />
                </article>
                <ProofBlock laneName={lane.name} kind="context" reading={lane.context} />
                <ProofBlock laneName={lane.name} kind="baseline" reading={lane.baseline} />
                {Object.values(lane.intel ?? {}).map((clue) =>
                  clue ? (
                    <article className="proof__reading" key={clue.tool}>
                      <header className="proof__head">
                        <span className="proof__lane">{lane.name}</span>
                        <span className="proof__kind">{TOOLS[clue.tool].nansen} · {clue.verdict}</span>
                      </header>
                      <ProvenanceLine provenance={clue.provenance} />
                    </article>
                  ) : null,
                )}
              </div>
            ))}
            <p className="honestnote">
              Where a read reported no value for a cohort, the force is shown as <strong>?</strong>. Request ids are
              shown only when the upstream response carried one.
            </p>
          </div>
        </Modal>
      ) : null}

      {game && lastRound ? (
        <ResolutionPanel
          open={showResolution}
          game={game}
          round={lastRound}
          before={preResolve}
          onNext={() => {
            if (game.phase === 'finished') setShowResolution(false);
            else void advanceWave();
          }}
          onClose={() => setShowResolution(false)}
          busy={busy}
          nansenHref={(wave, laneId) => api.nansenHref(game.id, wave, laneId)}
          onPractice={practice}
          coach={<>{dialogAlert}{coachSurface === 'report' ? renderCoach('inline') : null}</>}
        />
      ) : null}

      {coachSurface === 'floating' ? renderCoach('floating') : null}

      <Toasts messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((message) => message.id !== id))} />
    </div>
  );
}
