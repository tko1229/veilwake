import { ALERTS, COHORTS, DOCTRINES, FLOW_TOOL, TOOLS, TOOL_ORDER, WAVE_REFILL } from './types';
import { Button, CohortLegend, Modal, StanceLegend } from './components';
import { IconAlert, IconArrowRight, IconBeacon, IconBolt, IconGate, IconLens, IconShift, IconWave } from './icons';

export interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  firstTime: boolean;
  onOpenManual?: () => void;
}

/**
 * Rules, cohort legend and the honesty notes. Native <dialog> handles Escape,
 * focus trapping and focus restore; the primary button is focused on open.
 */
export function OnboardingModal({ open, onClose, firstTime, onOpenManual }: OnboardingModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How VEILWAKE works"
      wide
      autofocusSelector="[data-autofocus]"
      footer={
        <>
          <span className="modal__foot-note">
            {firstTime ? 'Shown once. You can reopen this from the header at any time.' : 'Reopenable from the header at any time.'}
          </span>
          <Button variant="primary" data-autofocus onClick={onClose} icon={<IconArrowRight size={16} />}>
            {firstTime ? 'Got it — start playing' : 'Close'}
          </Button>
        </>
      }
    >
      <div className="rules">
        <section aria-labelledby="onb-objective">
          <h3 id="onb-objective" style={{ fontSize: 'var(--step-2)' }}>
            The objective
          </h3>
          <p style={{ marginTop: 8, color: 'var(--forest-2)' }}>
            Three reaches sit between the open current and the settlement. You get three waves. Reach{' '}
            <strong>18 charge</strong> before the last wave closes while keeping <strong>hull above 0</strong>, and the
            lights stay on. Hull at zero ends the run immediately.
          </p>
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-stances">
          <h3 id="onb-stances" style={{ fontSize: 'var(--step-2)', marginBottom: 10 }}>
            The three stances
          </h3>
          <StanceLegend />
          <div className="rules__two" style={{ marginTop: 12 }}>
            <div className="rulecard">
              <p className="rulecard__title">
                <IconBolt size={13} /> Harvest · 0 supply
              </p>
              <p className="rulecard__body">
                Gates open. You take the most charge a reach can give, and you take the full force of whatever is moving
                in it.
              </p>
            </div>
            <div className="rulecard">
              <p className="rulecard__title">
                <IconGate size={13} /> Brace · 1 supply
              </p>
              <p className="rulecard__body">
                Gates half-closed. Damage is reduced and you still catch a little charge, but you spend a supply to do
                it.
              </p>
            </div>
            <div className="rulecard">
              <p className="rulecard__title">
                <IconShift size={13} /> Divert · 2 supply
              </p>
              <p className="rulecard__body">
                Gates sealed, and the pressure is pushed onto the next reach along. It protects this one and loads its
                neighbour — the neighbour you may have to live in next wave.
              </p>
            </div>
            <div className="rulecard">
              <p className="rulecard__title">
                <IconLens size={13} /> Nansen views · 1 lens each
              </p>
              <p className="rulecard__body">
                Lenses are the scarce resource. Before you look, a reach shows only its Token Screener snapshot and whale
                and exchange flow. Each lens opens one Nansen view on one reach for that wave. You regain {WAVE_REFILL.intel}{' '}
                lenses after every surviving wave.
              </p>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-toolkit">
          <h3 id="onb-toolkit" style={{ fontSize: 'var(--step-2)' }}>
            The Nansen toolkit — the same views, in the same order, as the real platform
          </h3>
          <p style={{ marginTop: 8, color: 'var(--forest-2)', marginBottom: 12 }}>
            Open <strong>Token God Mode</strong> on any reach. Each panel is a real Nansen view reduced to a verdict and a
            pressure modifier (+ adds hazard, − eases it). Anything you do not open still acts on the wave — the report
            will show you what you missed.
          </p>
          <div className="rules__two">
            <div className="rulecard">
              <p className="rulecard__title">{FLOW_TOOL.nansen} · {FLOW_TOOL.name}</p>
              <p className="rulecard__body">{FLOW_TOOL.question} Opening it is the classic scout.</p>
            </div>
            {TOOL_ORDER.map((tool) => (
              <div className="rulecard" key={tool}>
                <p className="rulecard__title">{TOOLS[tool].nansen} · {TOOLS[tool].name}</p>
                <p className="rulecard__body">
                  {TOOLS[tool].question}
                  {TOOLS[tool].requires ? ` Requires ${TOOLS[TOOLS[tool].requires!].nansen} first.` : ''}
                </p>
              </div>
            ))}
            <div className="rulecard">
              <p className="rulecard__title">Token Screener · Harbor chart</p>
              <p className="rulecard__body">Free on every reach. Liquidity band 0 adds +2 pressure, band 1 adds +1: thin harbors amplify every flow.</p>
            </div>
            <div className="rulecard">
              <p className="rulecard__title">Perp Screener · Storm glass</p>
              <p className="rulecard__body">Free. Smart Money perp positioning on Hyperliquid sets the wave’s weather (−1 to +2 on every reach), plus a perp shadow on tokens that have a perp.</p>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-alerts">
          <h3 id="onb-alerts" style={{ fontSize: 'var(--step-2)', marginBottom: 10 }}>
            Smart Alerts and timeframe calls
          </h3>
          <div className="rules__two">
            <div className="rulecard">
              <p className="rulecard__title">
                <IconAlert size={13} /> One Smart Alert per wave · free
              </p>
              <p className="rulecard__body">
                Put a tripwire on one reach: {Object.values(ALERTS).map((a) => a.name.toLowerCase()).join(', ')}. If it fires in
                the 5m read while that reach harvests, the gates brace in time at no supply cost — exactly why Nansen users
                alert where they are exposed.
              </p>
            </div>
            <div className="rulecard">
              <p className="rulecard__title">Call · after scouting flows</p>
              <p className="rulecard__body">
                Will Smart Traders keep their 1h direction in the next 5m read? Right: +12 points. Wrong: −4. Pass is always
                allowed — weak evidence deserves no claim. Scored against the real response, never a price.
              </p>
            </div>
          </div>
          {onOpenManual ? (
            <div style={{ marginTop: 12 }}>
              <Button variant="ghost" onClick={onOpenManual} icon={<IconBeacon size={15} />}>
                Open the field manual — every Nansen feature, in and out of the game
              </Button>
            </div>
          ) : null}
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-cohorts">
          <h3 id="onb-cohorts" style={{ fontSize: 'var(--step-2)' }}>
            The six cohorts — real readings, fictional hazards
          </h3>
          <p style={{ marginTop: 8, color: 'var(--forest-2)', marginBottom: 12 }}>
            Each cohort below is a real Nansen classification. Each has a fictional name used by the game layer. The
            reading is real; the hazard it creates in VEILWAKE is invented, and no cohort is a recommendation.
          </p>
          <CohortLegend />
          <p className="honestnote" style={{ marginTop: 12 }}>
            <IconWave size={14} /> A cohort reading is a windowed observation of flow that already happened. It is not a
            prediction of price, and a large flow is not a claim about anyone's intent.
          </p>
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-doctrine">
          <h3 id="onb-doctrine" style={{ fontSize: 'var(--step-2)', marginBottom: 10 }}>
            Doctrines
          </h3>
          <div className="rules__two">
            {(['keeper', 'cartographer', 'engineer'] as const).map((id) => (
              <div className="rulecard" key={id}>
                <p className="rulecard__title">{DOCTRINES[id].name}</p>
                <p className="rulecard__body">{DOCTRINES[id].description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        <section aria-labelledby="onb-honesty">
          <h3 id="onb-honesty" style={{ fontSize: 'var(--step-2)', marginBottom: 10 }}>
            What VEILWAKE will not do
          </h3>
          <ul className="rules">
            <li className="rulecard">
              <p className="rulecard__body">
                It will not claim a specific transaction just happened. Every figure is a windowed cohort reading with
                a timestamp you can inspect.
              </p>
            </li>
            <li className="rulecard">
              <p className="rulecard__body">
                It will not fill a gap with a zero. Where a value is missing it is shown as <strong>?</strong>.
              </p>
            </li>
            <li className="rulecard">
              <p className="rulecard__body">
                It will not switch a live run into a demo on its own. If live fails you get the failure, a retry, and a
                deliberate choice to rehearse instead.
              </p>
            </li>
            <li className="rulecard">
              <p className="rulecard__body">
                It will not store your readings, lanes, or any amounts in the browser. Only the session id, the mode,
                whether you have seen this dialog, whether you finished the tutorial, three counters about you and which
                Nansen skills you have practiced.
                Wallet addresses and raw Nansen labels never reach the browser at all.
              </p>
            </li>
          </ul>
        </section>

        <p className="mono" style={{ color: 'var(--muted)', fontSize: 'var(--step--2)' }}>
          {COHORTS.length} cohorts · 3 reaches · 3 waves · one settlement to keep lit.
        </p>
      </div>
    </Modal>
  );
}
