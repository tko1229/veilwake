import type { Direction, Reading, Signal } from './types';
import { COHORT_ORDER, DIRECTIONS, UNSCOUTED_COHORTS } from './types';

/** Render an ISO timestamp in the reader's own locale, or '?' when absent. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '?';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '?';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Relative age, e.g. "12 min ago". Used only to explain cache freshness. */
export function formatAge(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** A number that is genuinely absent is rendered as '?', never as zero. */
export function formatForce(force: number | null | undefined): string {
  if (force === null || force === undefined || !Number.isFinite(force)) return '?';
  return Math.round(force).toString();
}

export function directionLabel(direction: Direction): string {
  return DIRECTIONS[direction]?.label ?? 'unknown';
}

export function directionArrow(direction: Direction): string {
  return DIRECTIONS[direction]?.arrow ?? '?';
}

/**
 * Signals the player is allowed to see for a reading.
 *
 * Before a reach is scouted only whale and exchange flow is legible; the rest of
 * the cohorts stay withheld. This mirrors the engine's withholding rule rather
 * than inventing a second one.
 */
export function visibleSignals(reading: Reading, revealed: boolean): Signal[] {
  const signals = Array.isArray(reading.signals) ? reading.signals : [];
  const allowed = revealed ? signals : signals.filter((signal) => UNSCOUTED_COHORTS.includes(signal.id));
  return [...allowed].sort((a, b) => COHORT_ORDER.indexOf(a.id) - COHORT_ORDER.indexOf(b.id));
}

export function withheldCount(reading: Reading, revealed: boolean): number {
  if (revealed) return 0;
  // The server removes hidden entries entirely. Count the withheld taxonomy,
  // not rows that intentionally never reached the browser.
  return COHORT_ORDER.length - UNSCOUTED_COHORTS.length;
}

/** Compact numeric display that keeps '?' meaningful. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '?';
  return Math.round(value).toLocaleString();
}

export function formatPercent(part: number | null | undefined, whole: number | null | undefined): string {
  if (part === null || part === undefined || whole === null || whole === undefined) return '?';
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return '?';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Clamp helper for progress rendering. */
export function ratio(part: number | null | undefined, whole: number | null | undefined): number {
  if (part === null || part === undefined || whole === null || whole === undefined) return 0;
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(1, part / whole));
}
