import type { Mode } from './types';
import { PRACTICE_KEYS, type PracticeKey } from './manualData';

/**
 * Local persistence, deliberately tiny.
 *
 * Stored: the active session id, the mode it was started in, whether the rules
 * dialog was dismissed, whether the tutorial was completed, three cumulative
 * counters about this player, and the names of the Nansen skills this player
 * has practiced (flags, not data).
 * Not stored: lanes, readings, provenance, hazards, history, scores per run, or
 * anything derived from Nansen rows. Nothing here is a raw API artefact.
 */
const KEY = 'veilwake.v1';

export interface PlayerStats {
  wins: number;
  bestScore: number;
  runs: number;
}

export interface PersistedState {
  sessionId: string | null;
  mode: Mode | null;
  tutorialDismissed: boolean;
  /** Played the guided rehearsal through all three chapters at least once. */
  tutorialCompleted: boolean;
  stats: PlayerStats;
  practiced: PracticeKey[];
}

const EMPTY: PersistedState = {
  sessionId: null,
  mode: null,
  tutorialDismissed: false,
  tutorialCompleted: false,
  stats: { wins: 0, bestScore: 0, runs: 0 },
  practiced: [],
};

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    // Probe: private modes can throw on write.
    const probe = '__veilwake_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function coerceInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function coerceMode(value: unknown): Mode | null {
  return value === 'live' || value === 'demo' ? value : null;
}

export function readState(): PersistedState {
  const store = safeStorage();
  if (!store) return { ...EMPTY, stats: { ...EMPTY.stats }, practiced: [] };

  const raw = store.getItem(KEY);
  if (!raw) return { ...EMPTY, stats: { ...EMPTY.stats }, practiced: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY, stats: { ...EMPTY.stats }, practiced: [] };
    return {
      sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : null,
      mode: coerceMode(parsed.mode),
      tutorialDismissed: parsed.tutorialDismissed === true,
      tutorialCompleted: parsed.tutorialCompleted === true,
      stats: {
        wins: coerceInt(parsed.stats?.wins),
        bestScore: coerceInt(parsed.stats?.bestScore),
        runs: coerceInt(parsed.stats?.runs),
      },
      practiced: Array.isArray(parsed.practiced)
        ? PRACTICE_KEYS.filter((key) => (parsed.practiced as unknown[]).includes(key))
        : [],
    };
  } catch {
    return { ...EMPTY, stats: { ...EMPTY.stats }, practiced: [] };
  }
}

function writeState(state: PersistedState): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Storage full or blocked: the game remains fully playable without it. */
  }
}

/** Remember the run so a refresh can resume it. */
export function rememberSession(sessionId: string, mode: Mode): PersistedState {
  const next: PersistedState = { ...readState(), sessionId, mode };
  writeState(next);
  return next;
}

/** Forget the run but keep mode, tutorial flag and counters. */
export function forgetSession(): PersistedState {
  const next: PersistedState = { ...readState(), sessionId: null };
  writeState(next);
  return next;
}

export function setTutorialDismissed(dismissed: boolean): PersistedState {
  const next: PersistedState = { ...readState(), tutorialDismissed: dismissed };
  writeState(next);
  return next;
}

/** Remember that the guided rehearsal was played through all three chapters. */
export function setTutorialCompleted(): PersistedState {
  const current = readState();
  if (current.tutorialCompleted) return current;
  const next: PersistedState = { ...current, tutorialCompleted: true };
  writeState(next);
  return next;
}

/** Count a run as started. Called once per successfully created game. */
export function recordRunStarted(): PersistedState {
  const current = readState();
  const next: PersistedState = { ...current, stats: { ...current.stats, runs: current.stats.runs + 1 } };
  writeState(next);
  return next;
}

/** Count a finished run. Victories and best score only move upward. */
export function recordRunFinished(victory: boolean, score: number): PersistedState {
  const current = readState();
  const safeScore = coerceInt(score);
  const next: PersistedState = {
    ...current,
    stats: {
      runs: current.stats.runs,
      wins: current.stats.wins + (victory ? 1 : 0),
      bestScore: Math.max(current.stats.bestScore, safeScore),
    },
  };
  writeState(next);
  return next;
}

/** Mark Nansen skills as practiced. Only the skill names are stored. */
export function recordPractice(keys: PracticeKey[]): PersistedState {
  const current = readState();
  const merged = PRACTICE_KEYS.filter((key) => current.practiced.includes(key) || keys.includes(key));
  if (merged.length === current.practiced.length) return current;
  const next: PersistedState = { ...current, practiced: merged };
  writeState(next);
  return next;
}
