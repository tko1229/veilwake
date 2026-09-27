import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CoachAction, CoachStep } from './coachSteps';
import { Button } from './components';
import { IconAlert, IconArrowRight, IconBeacon, IconCheck, IconClose, IconHelp, IconRefresh } from './icons';

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function selectorFor(targets: string[]): string {
  return targets.map((t) => `[data-coach="${t.replace(/"/g, '')}"]`).join(',');
}

/** Visible = rendered with a box and not inside a closed <dialog>. */
function isVisible(el: Element): boolean {
  if (el.getClientRects().length === 0) return false;
  const dialog = el.closest('dialog');
  return !dialog || dialog.open;
}

/** When a modal is open, only its content counts; the page behind it is inert. */
function inActiveLayer(el: Element): boolean {
  const openDialog = document.querySelector('dialog[open]');
  return !openDialog || openDialog.contains(el);
}

function visibleTargets(targets: string[]): HTMLElement[] {
  if (targets.length === 0) return [];
  return Array.from(document.querySelectorAll<HTMLElement>(selectorFor(targets))).filter((el) => isVisible(el) && inActiveLayer(el));
}

/** The first visible element for the highest-priority target that exists. */
function firstTarget(targets: string[]): HTMLElement | null {
  for (const target of targets) {
    const match = visibleTargets([target])[0];
    if (match) return match;
  }
  return null;
}

export function scrollToCoachTarget(targets: string[], force = false): void {
  const el = firstTarget(targets);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const inModal = document.querySelector('dialog[open]') !== null;
  // Inside a modal the coach card is sticky at the top; on the board the resolve bar is sticky at the bottom.
  const sticky = document.querySelector('dialog[open] .coach--inline');
  const topLimit = Math.max(90, sticky ? sticky.getBoundingClientRect().bottom + 12 : 0);
  const bottomLimit = window.innerHeight - (inModal ? 90 : 130);
  const offscreen = rect.top < topLimit || rect.bottom > bottomLimit;
  if (force || offscreen) el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Pulses every element whose data-coach key is in `targets`. A MutationObserver
 * re-applies the class when React re-renders or a modal mounts new content.
 * It observes childList only, so toggling the class never re-triggers it.
 */
export function useCoachHighlight(targets: string[] | null, stepId: string | null): void {
  const key = targets && targets.length > 0 ? `${stepId}|${targets.join(',')}` : '';
  useEffect(() => {
    if (!key || !targets) return;
    const selector = selectorFor(targets);
    let frame = 0;
    const apply = () => {
      frame = 0;
      document.querySelectorAll('.coach-target').forEach((el) => {
        if (!el.matches(selector)) el.classList.remove('coach-target');
      });
      document.querySelectorAll(selector).forEach((el) => el.classList.add('coach-target'));
    };
    apply();
    const observer = new MutationObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Let a freshly opened modal lay out before deciding whether to scroll.
    const scrollTimer = window.setTimeout(() => scrollToCoachTarget(targets), 180);
    return () => {
      observer.disconnect();
      window.clearTimeout(scrollTimer);
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll('.coach-target').forEach((el) => el.classList.remove('coach-target'));
    };
    // `key` captures every input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ------------------------------------------------------------ placement */

type Spot = { v: 'top' | 'bottom'; h: 'left' | 'right' };
const SPOTS: Spot[] = [
  { v: 'bottom', h: 'right' },
  { v: 'bottom', h: 'left' },
  { v: 'top', h: 'right' },
  { v: 'top', h: 'left' },
];
/** Keep in sync with .coach--floating in styles.css. */
const NARROW = 650;
const GAP = 16;
const ABOVE_BAR = 124;
const ABOVE_BAR_NARROW = 150;

function spotRect(spot: Spot, cardWidth: number, cardHeight: number) {
  const narrow = window.innerWidth <= NARROW;
  const width = narrow ? window.innerWidth - 16 : Math.min(cardWidth, window.innerWidth - 2 * GAP);
  const left = narrow ? 8 : spot.h === 'right' ? window.innerWidth - GAP - width : GAP;
  const top = spot.v === 'bottom' ? window.innerHeight - (narrow ? ABOVE_BAR_NARROW : ABOVE_BAR) - cardHeight : narrow ? 8 : GAP;
  return { left, top, right: left + width, bottom: top + cardHeight };
}

function overlap(a: { left: number; top: number; right: number; bottom: number }, b: DOMRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Picks the screen corner where the floating card covers the least of what it
 * points at, re-evaluated on scroll and resize. The default corner wins ties,
 * so the card only moves when it would actually hide a target.
 */
function useSpot(targets: string[], card: RefObject<HTMLElement | null>, active: boolean): Spot {
  const [spot, setSpot] = useState<Spot>(SPOTS[0]);
  const key = targets.join(',');
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = card.current;
      const rects = visibleTargets(targets).map((t) => t.getBoundingClientRect()).filter((r) => r.bottom > 0 && r.top < window.innerHeight);
      if (!el || rects.length === 0) return;
      const box = el.getBoundingClientRect();
      let best = SPOTS[0];
      let bestCost = Infinity;
      for (const candidate of SPOTS) {
        const area = spotRect(candidate, box.width, box.height);
        const cost = rects.reduce((sum, r) => sum + overlap(area, r), 0);
        if (cost < bestCost - 1) { best = candidate; bestCost = cost; }
      }
      setSpot((current) => (current.v === best.v && current.h === best.h ? current : best));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    schedule();
    // Smooth scrolling and modal layout settle a little later.
    const late = window.setTimeout(schedule, 450);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  return spot;
}

/* ----------------------------------------------------------------- card */

export interface CoachCardProps {
  step: CoachStep;
  /** Floating on the board and end screen; sticky at the top of a modal. */
  variant: 'floating' | 'inline';
  onAck: (id: string) => void;
  onHide: () => void;
  onAction?: (action: CoachAction) => void;
  onOpenRules?: () => void;
}

const ACTION_LABEL: Record<CoachAction, string> = {
  'start-live': 'Enter the live current',
  replay: 'Replay the tutorial',
};

export function CoachCard({ step, variant, onAck, onHide, onAction, onOpenRules }: CoachCardProps) {
  const [minimized, setMinimized] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const floating = variant === 'floating';
  const spot = useSpot(step.targets, ref, floating);
  useEffect(() => setShowAnswer(false), [step.id]);
  // A new step always deserves attention, even if the card was tucked away.
  useEffect(() => setMinimized(false), [step.id]);

  const finale = step.id === 'finale';
  const progress = finale ? 100 : step.total > 0 ? Math.round((step.index / step.total) * 100) : 100;
  const kicker = finale ? 'Tutorial · complete' : `Tutorial · chapter ${step.chapter} of 3 · ${step.chapterTitle}`;

  if (floating && minimized) {
    return (
      <button
        type="button"
        className="coach-pill"
        data-v={spot.v}
        data-h={spot.h}
        onClick={() => setMinimized(false)}
        aria-label={`Show the tutorial coach: ${step.title}`}
      >
        <IconBeacon size={14} /> Tutorial · {finale ? 'done' : `ch. ${step.chapter} · ${step.index}/${step.total}`}
      </button>
    );
  }

  if (!floating && minimized) {
    // Inside a dialog: collapse to one slim sticky row so the panel or ledger below is readable.
    return (
      <section className="coach coach--inline coach--mini" aria-label="Tutorial coach (minimized)">
        <button type="button" className="coach__expand" onClick={() => setMinimized(false)} aria-expanded={false} aria-label={`Show the tutorial coach: ${step.title}`}>
          <IconBeacon size={14} />
          <span className="coach__mini-kicker">Tutorial {finale ? '' : `${step.index}/${step.total}`}</span>
          <span className="coach__mini-title">{step.title}</span>
          <span aria-hidden="true">▾</span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className={`coach coach--${variant}`}
      data-v={floating ? spot.v : undefined}
      data-h={floating ? spot.h : undefined}
      aria-label="Tutorial coach"
    >
      <header className="coach__head">
        <p className="coach__kicker">{kicker}</p>
        {finale ? null : (
          <span className="coach__count" aria-label={`Step ${step.index} of ${step.total} in this chapter`}>
            {step.index}/{step.total}
          </span>
        )}
        <div className="coach__head-actions">
          <button type="button" className="coach__icon" onClick={() => setMinimized(true)} aria-label="Minimize the tutorial coach" title="Minimize">
            <span aria-hidden="true">–</span>
          </button>
          <button type="button" className="coach__icon" onClick={onHide} aria-label="Hide the tutorial for this run" title="Hide the tutorial (reopen it from the header)">
            <IconClose size={13} />
          </button>
        </div>
      </header>
      <div className="coach__bar" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      <div aria-live="polite" aria-atomic="true">
        <h3 className="coach__title">{step.title}</h3>
        {step.feature ? <p className="coach__feature">Nansen · {step.feature}</p> : null}
        <p className="coach__body">{step.body}</p>
        {step.note ? (
          <p className={`coach__note coach__note--${step.note.tone}`}>
            <span aria-hidden="true">{step.note.tone === 'good' ? <IconCheck size={13} /> : <IconAlert size={13} />}</span>
            <span>
              <span className="sr-only">{step.note.tone === 'good' ? 'Good: ' : 'Heads up: '}</span>
              {step.note.text}
            </span>
          </p>
        ) : null}
      </div>
      {step.answer ? (
        showAnswer ? (
          <p className="coach__answer">
            <strong>Answer:</strong> {step.answer}
          </p>
        ) : (
          <button type="button" className="coach__reveal" onClick={() => setShowAnswer(true)}>
            Show the answer
          </button>
        )
      ) : null}
      <div className="coach__actions">
        {step.ack ? (
          <Button variant="primary" size="sm" onClick={() => onAck(step.id)} icon={<IconArrowRight size={14} />}>
            {step.ack}
          </Button>
        ) : null}
        {onAction
          ? (step.actions ?? []).map((action, index) => (
              <Button
                key={action}
                variant={index === 0 ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => onAction(action)}
                icon={action === 'replay' ? <IconRefresh size={14} /> : <IconArrowRight size={14} />}
              >
                {ACTION_LABEL[action]}
              </Button>
            ))
          : null}
        {step.optional ? (
          <Button variant="ghost" size="sm" onClick={() => onAck(step.id)}>
            {step.skipLabel ?? 'Skip'}
          </Button>
        ) : null}
        {step.targets.length > 0 ? (
          <Button variant="quiet" size="sm" onClick={() => scrollToCoachTarget(step.targets, true)}>
            Show me
          </Button>
        ) : null}
        {step.id === 'w1-intro' && onOpenRules ? (
          <Button variant="quiet" size="sm" onClick={onOpenRules} icon={<IconHelp size={14} />}>
            Full rules
          </Button>
        ) : null}
        {step.id === 'finale' ? (
          <Button variant="quiet" size="sm" onClick={onHide}>
            Close
          </Button>
        ) : null}
      </div>
    </section>
  );
}
