import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { CohortId, Mode, Reading, Signal, Stance } from './types';
import { COHORTS, STANCES } from './types';
import { directionArrow, directionLabel, formatAge, formatForce, formatTimestamp, ratio, visibleSignals, withheldCount } from './format';
import { copyText } from './outcome';
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconExternal,
  IconLens,
  IconLock,
} from './icons';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'solid' | 'ghost' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'ghost', size = 'md', block, icon, className, children, ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'ghost' ? `btn--${variant}` : 'btn--ghost',
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Plaque */

export function ModePlaque({ mode, compact }: { mode: Mode; compact?: boolean }) {
  if (mode === 'live') {
    return (
      <span className="plaque plaque--live">
        <span className="plaque__dot" aria-hidden="true" />
        Live data{compact ? '' : ' · Nansen upstream'}
      </span>
    );
  }
  return (
    <span className="plaque plaque--demo">
      <span className="plaque__dot" aria-hidden="true" />
      Demo · fictional scenario
    </span>
  );
}

export function Badge({ children, tone, title }: { children: ReactNode; tone?: 'accent' | 'muted' | 'warn'; title?: string }) {
  const classes = ['badge', tone ? `badge--${tone}` : ''].filter(Boolean).join(' ');
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Meters */

export function Meter({
  label,
  value,
  max,
  tone = 'default',
  display,
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'default' | 'charge' | 'hull' | 'low';
  display?: string;
}) {
  const pct = Math.round(ratio(value, max) * 100);
  const fillClass = ['meter__fill', tone !== 'default' ? `meter__fill--${tone}` : ''].filter(Boolean).join(' ');
  return (
    <div className="meter">
      <div className="meter__top">
        <span className="meter__label">{label}</span>
        <span className="meter__value num">{display ?? `${value} / ${max}`}</span>
      </div>
      <div
        className="meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.max(0, Math.min(value, max))}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={display ?? `${value} of ${max}`}
      >
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Pips({ value, max, label }: { value: number; max: number; label: string }) {
  const shown = Math.min(Math.max(max, 0), 12);
  return (
    <div className="pips" role="img" aria-label={`${label}: ${value} of ${max}`}>
      {Array.from({ length: shown }, (_, index) => (
        <span key={index} className={index < value ? 'pip' : 'pip pip--empty'} aria-hidden="true" />
      ))}
      {max > shown ? <span className="badge badge--muted">+{max - shown}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
  footer,
  autofocusSelector,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  autofocusSelector?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      const target =
        (autofocusSelector ? dialog.querySelector<HTMLElement>(autofocusSelector) : null) ?? dialog;
      // Defer so the browser has laid the dialog out before focus moves.
      const frame = window.requestAnimationFrame(() => target.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    if (dialog.open) dialog.close();
  }, [open, autofocusSelector]);

  return (
    <dialog
      ref={dialogRef}
      className={wide ? 'modal modal--wide' : 'modal'}
      aria-labelledby={headingId}
      tabIndex={-1}
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="modal__inner">
        <header className="modal__head">
          <h2 className="modal__title" id={headingId}>
            {title}
          </h2>
          <div className="modal__head-right">
            <Button variant="quiet" onClick={onClose} icon={<IconClose size={16} />} aria-label="Close dialog">
              Close
            </Button>
          </div>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ Signals */

function cohortOf(id: CohortId) {
  return COHORTS.find((cohort) => cohort.id === id);
}

export function CohortGlyph({ id, large }: { id: CohortId; large?: boolean }) {
  const cohort = cohortOf(id);
  if (!cohort) return <span className="glyph" aria-hidden="true">?</span>;
  return (
    <span
      className={large ? 'glyph glyph--lg' : 'glyph'}
      style={{ color: cohort.color }}
      aria-hidden="true"
      title={cohort.name}
    >
      {cohort.glyph}
    </span>
  );
}

export function SignalRow({ signal }: { signal: Signal }) {
  const cohort = cohortOf(signal.id);
  const unknownForce = signal.force === null || signal.force === undefined;
  const dirClass = signal.direction === 'out' ? 'signal__dir signal__dir--out' : 'signal__dir';

  return (
    <div className="signal">
      <span className="signal__id">
        <CohortGlyph id={signal.id} />
      </span>
      <span className="signal__names">
        <span className="signal__real">{cohort?.name ?? signal.id}</span>
        <span className="signal__fiction"> · {cohort?.fiction ?? 'unmapped'}</span>
      </span>
      <span className="signal__read">
        <span className={dirClass} title={directionLabel(signal.direction)}>
          {directionArrow(signal.direction)} {directionLabel(signal.direction)}
        </span>
        {'  '}
        <span className={unknownForce ? 'signal__force signal__force--unknown' : 'signal__force'}>
          {unknownForce ? '?' : formatForce(signal.force)}
        </span>
      </span>
    </div>
  );
}

export function ReadingPanel({
  reading,
  kind,
  revealed,
  laneName,
}: {
  reading: Reading;
  kind: 'context' | 'baseline';
  revealed: boolean;
  laneName: string;
}) {
  const label = kind === 'context' ? 'Context' : 'Baseline';
  const visible = visibleSignals(reading, revealed);
  const hidden = withheldCount(reading, revealed);
  const age = formatAge(reading.provenance?.fetchedAt ?? null);

  return (
    <div className={revealed ? 'reading' : 'reading reading--locked'}>
      <div className="reading__top">
        <span className="reading__label">
          {kind === 'context' ? <IconLens size={13} /> : null} {label}
        </span>
        <span className="reading__window">
          {reading.provenance?.timeframe ?? '?'}
          {age ? ` · ${age}` : ''}
        </span>
      </div>

      {visible.length > 0 ? (
        <div className="reading__signals">
          {visible.map((signal, index) => (
            <SignalRow key={`${signal.id}-${signal.direction}-${index}`} signal={signal} />
          ))}
        </div>
      ) : (
        <p className="reading__empty">
          <IconAlert size={14} />
          <span>
            No readable flow in this window for {laneName}. An empty window is reported as empty, never as zero.
          </span>
        </p>
      )}

      {hidden > 0 ? (
        <p className="reading__withheld">
          <IconLock size={14} />
          <span>
            {hidden} {hidden === 1 ? 'cohort is' : 'cohorts are'} withheld on this reach. Spend a lens to scout it.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Proof */

export type ProofKind = 'context' | 'baseline' | 'resolution';

const PROOF_KIND_LABEL: Record<ProofKind, string> = {
  context: 'Context read',
  baseline: 'Baseline read',
  resolution: 'Resolution read',
};

export function ProofBlock({
  laneName,
  kind,
  reading,
}: {
  laneName: string;
  kind: ProofKind;
  reading: Reading;
}) {
  const provenance = reading.provenance;
  const age = formatAge(provenance?.fetchedAt ?? null);

  return (
    <article className="proof__reading">
      <header className="proof__head">
        <span className="proof__lane">{laneName}</span>
        <span className="proof__kind">{PROOF_KIND_LABEL[kind]}</span>
        {provenance?.endpoint === 'fictional-game-fixture' ? <Badge tone="muted">fictional fixture</Badge> : provenance?.cached ? <Badge tone="muted">served from cache</Badge> : <Badge tone="accent">Nansen API response</Badge>}
      </header>

      <div className="proof__rows">
        <div className="proof__row">
          <span className="proof__k">endpoint</span>
          <span className="proof__v">{provenance?.endpoint ?? '?'}</span>
        </div>
        <div className="proof__row">
          <span className="proof__k">timeframe</span>
          <span className="proof__v">{provenance?.timeframe ?? '?'}</span>
        </div>
        <div className="proof__row">
          <span className="proof__k">fetched at</span>
          <span className="proof__v">
            {formatTimestamp(provenance?.fetchedAt)}
            {age ? ` (${age})` : ''}
          </span>
        </div>
        <div className="proof__row">
          <span className="proof__k">request id</span>
          <span className="proof__v">{provenance?.requestId ? provenance.requestId : '?'}</span>
        </div>
        <div className="proof__row">
          <span className="proof__k">cohorts read</span>
          <span className="proof__v">{Number.isFinite(reading.available) ? reading.available : '?'}</span>
        </div>
      </div>

      <div className="proof__signals">
        {reading.signals.length > 0 ? (
          reading.signals.map((signal, index) => (
            <SignalRow key={`${signal.id}-${signal.direction}-${index}`} signal={signal} />
          ))
        ) : (
          <p className="reading__empty">
            <IconAlert size={14} />
            <span>This window returned no readable cohort flow.</span>
          </p>
        )}
      </div>
    </article>
  );
}

export function ProofNotes() {
  return (
    <div className="rules">
      <div className="rulecard">
        <p className="rulecard__title">Overlapping windows, not a forecast</p>
        <p className="rulecard__body">
          The 1d baseline, 1h context and 5m resolution reads are <strong>overlapping observation windows over the
          same past</strong>. They describe what has already been recorded. They are not a prediction of future price,
          and VEILWAKE does not present them as one.
        </p>
      </div>
      <div className="rulecard">
        <p className="rulecard__title">Upstream caching</p>
        <p className="rulecard__body">
          Nansen may cache responses for 10–30 minutes. VEILWAKE records when its server fetched each response;
          that timestamp is not the time of the underlying transaction. A successful live API read is not a live tick.
          Our derived cache lasts at most ten minutes; its original fetch time remains visible.
        </p>
      </div>
      <div className="rulecard">
        <p className="rulecard__title">Missing means missing</p>
        <p className="rulecard__body">
          Where a cohort has no value in the window, the force is shown as <strong>?</strong>. It is never rendered as
          zero, and it is never estimated. Before a reach is scouted, only whale and exchange flow is legible; the other
          cohorts are withheld.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Legend */

export function CohortLegend() {
  return (
    <ul className="legend">
      {COHORTS.map((cohort) => (
        <li className="cohort" key={cohort.id}>
          <CohortGlyph id={cohort.id} large />
          <div className="cohort__names">
            <p className="cohort__real">{cohort.name}</p>
            <p className="cohort__fiction">fictional hazard: {cohort.fiction}</p>
            <p className="cohort__desc">{cohort.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StanceLegend() {
  const order: Stance[] = ['harvest', 'brace', 'divert'];
  return (
    <div className="stancelegend">
      {order.map((stance) => (
        <div className="stancelegend__row" key={stance}>
          <span className="stancelegend__name">
            {STANCES[stance].glyph} {STANCES[stance].name} · {STANCES[stance].cost} supply
          </span>
          <span className="stancelegend__desc">{STANCES[stance].description}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Toasts */

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

export function Toasts({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (messages.length === 0) return null;
  return (
    <div className="toasts">
      {messages.map((message) => (
        <div key={message.id} className={message.tone === 'warn' ? 'toast toast--warn' : 'toast'} role="status">
          <span>{message.text}</span>
          <Button
            variant="quiet"
            className="toast__close"
            onClick={() => onDismiss(message.id)}
            aria-label="Dismiss message"
            icon={<IconClose size={15} />}
          >
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Copy */

export function CopyButton({ text, label = 'Copy results', className }: { text: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(async () => {
    const ok = await copyText(text);
    setStatus(ok ? 'ok' : 'fail');
    if (ok) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus('idle'), 2600);
    }
  }, [text]);

  return (
    <div className={className}>
      <Button
        variant={status === 'ok' ? 'solid' : 'ghost'}
        onClick={() => void run()}
        icon={status === 'ok' ? <IconCheck size={16} /> : <IconCopy size={16} />}
      >
        {status === 'ok' ? 'Copied' : label}
      </Button>
      <p className="sr-only" aria-live="polite">
        {status === 'ok'
          ? 'Results copied to the clipboard.'
          : status === 'fail'
            ? 'The clipboard was blocked. A text field with the results is shown below; select it and copy manually.'
            : ''}
      </p>
      {status === 'fail' ? (
        <>
          <p className="copied" style={{ marginTop: 8 }}>
            Clipboard blocked by the browser. Select the text below and copy it manually.
          </p>
          <textarea
            className="copyfallback"
            readOnly
            value={text}
            aria-label="Results text to copy manually"
            onFocus={(event) => event.currentTarget.select()}
          />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Bits */

export function SectionHead({ title, note, id }: { title: string; note?: string; id?: string }) {
  return (
    <div className="section-head">
      <h3 id={id} style={{ fontSize: 'var(--step-2)' }}>
        {title}
      </h3>
      {note ? <span className="section-head__note">{note}</span> : null}
    </div>
  );
}

export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="nansenlink" href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <IconExternal size={14} />
    </a>
  );
}
