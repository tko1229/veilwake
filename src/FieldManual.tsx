import { useState } from 'react';
import { FIELD_MANUAL, PRACTICE_KEYS, type ManualStatus, type PracticeKey } from './manualData';
import { Badge, Button, Modal } from './components';
import { IconCheck, IconExternal } from './icons';

const STATUS_LABEL: Record<ManualStatus, string> = {
  live: 'Live API mechanic',
  mechanic: 'Modelled in play',
  lesson: 'Lesson only',
};

const FILTERS: { id: 'all' | ManualStatus; label: string }[] = [
  { id: 'all', label: 'All features' },
  { id: 'live', label: 'Live in game' },
  { id: 'mechanic', label: 'Modelled' },
  { id: 'lesson', label: 'Lessons' },
];

export interface FieldManualProps {
  open: boolean;
  onClose: () => void;
  practiced: PracticeKey[];
}

export function FieldManual({ open, onClose, practiced }: FieldManualProps) {
  const [filter, setFilter] = useState<'all' | ManualStatus>('all');
  const entries = FIELD_MANUAL.filter((entry) => filter === 'all' || entry.status === filter);
  const done = PRACTICE_KEYS.filter((key) => practiced.includes(key)).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Field manual — every Nansen feature, in and out of the game"
      wide
      autofocusSelector="[data-autofocus]"
      footer={
        <>
          <span className="modal__foot-note">
            {done} of {PRACTICE_KEYS.length} Nansen skills practiced on this device. Links open nansen.ai in a new tab.
          </span>
          <Button variant="primary" data-autofocus onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="manual">
        <p className="manual__lede">
          VEILWAKE is a training ground for the way Nansen users actually work. Every instrument in the game maps to a real
          Nansen view, and every feature we do not use is here too — with the reason. Play a run, then repeat the same
          steps on the real platform.
        </p>
        <div className="manual__progress" aria-label="Skills practiced">
          <div className="manual__bar"><div style={{ width: `${Math.round((done / PRACTICE_KEYS.length) * 100)}%` }} /></div>
          <span className="mono">{done}/{PRACTICE_KEYS.length} skills</span>
        </div>
        <div className="manual__filters" role="group" aria-label="Filter features">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="manual__list">
          {entries.map((entry) => {
            const learned = entry.practice ? practiced.includes(entry.practice) : false;
            return (
              <article key={entry.id} className={`manual-entry manual-entry--${entry.status}`}>
                <header className="manual-entry__head">
                  <h3>{entry.feature}</h3>
                  <Badge tone={entry.status === 'live' ? 'accent' : entry.status === 'mechanic' ? undefined : 'muted'}>{STATUS_LABEL[entry.status]}</Badge>
                  {learned ? (
                    <span className="manual-entry__learned"><IconCheck size={13} /> practiced</span>
                  ) : null}
                </header>
                <p className="manual-entry__game"><strong>In VEILWAKE.</strong> {entry.inGame}</p>
                <p className="manual-entry__what"><strong>On Nansen.</strong> {entry.what}</p>
                {entry.why ? <p className="manual-entry__why"><strong>Why not in the loop.</strong> {entry.why}</p> : null}
                <ol className="manual-entry__steps">
                  {entry.howTo.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <a className="manual-entry__link" href={entry.link} target="_blank" rel="noopener noreferrer">
                  <IconExternal size={13} /> {entry.linkLabel}
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
