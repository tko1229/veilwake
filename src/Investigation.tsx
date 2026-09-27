import { useEffect, type ReactNode } from 'react';
import type { Clue, GameState, IntelToolId, Lane, MarketSnapshot, Provenance } from './types';
import { FLOW_TOOL, TOOLS, TOOL_ORDER } from './types';
import type { PracticeKey } from './manualData';
import { Badge, Button, Modal, ReadingPanel } from './components';
import { formatAge } from './format';
import { IconExternal, IconLens, IconLock } from './icons';

const BAND = ['very low', 'low', 'high', 'very high'];

export function bandLabel(band: number | null | undefined): string {
  return band === null || band === undefined ? '?' : `${band}/3 · ${BAND[band] ?? '?'}`;
}

export function formatPrice(value: number | null): string {
  if (value === null) return '?';
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

export function formatChange(value: number | null): string {
  if (value === null) return '?';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

const BIAS: Record<string, string> = { in: 'buyers lead', out: 'sellers lead', flat: 'even', unknown: '?' };

export function PressureChip({ value }: { value: number }) {
  const tone = value > 0 ? 'warn' : value < 0 ? 'accent' : 'muted';
  return (
    <Badge tone={tone} title="Game pressure added to this reach at resolution. Not a risk score.">
      {value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0'} pressure
    </Badge>
  );
}

export function ProvenanceLine({ provenance }: { provenance: Provenance }) {
  const fixture = provenance.endpoint === 'fictional-game-fixture';
  const age = formatAge(provenance.fetchedAt);
  return (
    <p className="tgm-prov">
      {fixture ? (
        <>fictional rehearsal fixture · {provenance.timeframe}</>
      ) : (
        <>
          {provenance.endpoint} · {provenance.timeframe}
          {age ? ` · ${age}` : ''} · request {provenance.requestId ?? '?'}
          {provenance.cached ? ' · served from cache' : ''}
        </>
      )}
    </p>
  );
}

export function MarketFacts({ market }: { market: MarketSnapshot }) {
  return (
    <dl className="tgm-facts">
      <div><dt>Price</dt><dd>{formatPrice(market.priceUsd)}</dd></div>
      <div><dt>24h move</dt><dd className={market.priceChangePct !== null && market.priceChangePct < 0 ? 'is-out' : ''}>{formatChange(market.priceChangePct)}</dd></div>
      <div><dt>Volume</dt><dd>{bandLabel(market.volumeBand)}</dd></div>
      <div><dt>Liquidity</dt><dd>{bandLabel(market.liquidityBand)}</dd></div>
      <div><dt>Market cap</dt><dd>{bandLabel(market.marketCapBand)}</dd></div>
      <div><dt>Buy vs sell volume</dt><dd>{BIAS[market.buySellBias] ?? '?'}</dd></div>
    </dl>
  );
}

function ClueBody({ clue }: { clue: Clue }) {
  return (
    <div className="tgm-clue">
      <div className="tgm-clue__verdict">
        <span>{clue.verdict}</span>
        <PressureChip value={clue.pressure} />
        {clue.status !== 'ok' ? <Badge tone="muted">{clue.status === 'empty' ? 'empty window' : 'unavailable'}</Badge> : null}
      </div>
      <p className="tgm-clue__detail">{clue.detail}</p>
      {clue.facts.length > 0 ? (
        <dl className="tgm-facts tgm-facts--tight">
          {clue.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <ProvenanceLine provenance={clue.provenance} />
    </div>
  );
}

function ToolPanel({
  tool,
  lane,
  planning,
  lenses,
  busy,
  onOpen,
}: {
  tool: IntelToolId;
  lane: Lane;
  planning: boolean;
  lenses: number;
  busy: boolean;
  onOpen: () => void;
}) {
  const info = TOOLS[tool];
  const clue = lane.intel?.[tool];
  const opened = (lane.opened ?? []).includes(tool);
  const needs = info.requires && !(lane.opened ?? []).includes(info.requires) ? info.requires : null;
  const visible = Boolean(clue) && (opened || !planning);
  return (
    <article className={visible ? 'tgm-panel tgm-panel--open' : 'tgm-panel'} aria-label={`${info.nansen} for ${lane.token.symbol}`}>
      <header className="tgm-panel__head">
        <div>
          <p className="tgm-panel__nansen">{info.nansen}</p>
          <p className="tgm-panel__game">{info.name} · {info.window}</p>
        </div>
        {visible ? (opened ? <Badge tone="accent">opened</Badge> : <Badge tone="muted">revealed after wave</Badge>) : <Badge tone="muted"><IconLock size={11} /> fog</Badge>}
      </header>
      <p className="tgm-panel__where">On Nansen: {info.where}</p>
      <p className="tgm-panel__q">{info.question}</p>
      {visible && clue ? (
        <>
          <ClueBody clue={clue} />
          <p className="tgm-panel__lesson"><strong>Analyst habit.</strong> {info.lesson}</p>
        </>
      ) : (
        <div className="tgm-panel__locked">
          <Button
            variant="primary"
            size="sm"
            icon={<IconLens size={14} />}
            disabled={!planning || busy || lenses < 1 || Boolean(needs)}
            data-coach={`tool-${tool}`}
            onClick={onOpen}
          >
            {needs ? `Needs ${TOOLS[needs].nansen} first` : lenses < 1 ? 'No lenses left' : busy ? 'Querying…' : 'Open · 1 lens'}
          </Button>
          {needs ? <p className="tgm-panel__hint">On Nansen you find the wallet in the ledger, then click through to its profile.</p> : null}
        </div>
      )}
    </article>
  );
}

export interface InvestigationProps {
  open: boolean;
  game: GameState;
  laneId: string | null;
  busy: boolean;
  onClose: () => void;
  onScout: (laneId: string) => void;
  onInvestigate: (laneId: string, tool: IntelToolId) => void;
  nansenHref: string | null;
  onPractice: (keys: PracticeKey[]) => void;
  /** Rehearsal coach card, rendered inside the dialog because the page behind it is inert. */
  coach?: ReactNode;
}

export function Investigation({ open, game, laneId, busy, onClose, onScout, onInvestigate, nansenHref, onPractice, coach }: InvestigationProps) {
  const lane = game.lanes.find((l) => l.id === laneId) ?? null;
  useEffect(() => {
    if (open && lane) onPractice(['screener']);
  }, [open, lane, onPractice]);
  if (!lane) return null;
  const planning = game.phase === 'planning';
  const openedCount = (lane.opened ?? []).length + (lane.revealed ? 1 : 0);
  const market = lane.market;
  const harbor = market.liquidityBand === 0 ? 2 : market.liquidityBand === 1 ? 1 : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Token God Mode · ${lane.token.symbol}`}
      wide
      autofocusSelector="[data-autofocus]"
      footer={
        <>
          <span className="modal__foot-note">
            {game.mode === 'demo' ? 'Rehearsal: every panel is an authored fixture.' : 'Live: each panel is a real Nansen response, reduced to derived facts.'} Powered by Nansen API.
          </span>
          <Button variant="primary" data-autofocus data-coach="tgm-close" onClick={onClose}>
            Back to the gates
          </Button>
        </>
      }
    >
      <div className="tgm">
        {coach}
        <header className="tgm__head">
          <div className="tgm__intro">
            <p className="tgm__kicker">
              {lane.name} · {lane.token.symbol} on {lane.token.chain} · {openedCount}/6 views open
            </p>
            <p className="tgm__lede">
              This panel is laid out the way Nansen lays out a token. The overview is free; each deeper view costs one lens —
              the same order an analyst works in: <em>market → cohorts → buyers → tape → transfers → trend → wallet</em>.
            </p>
          </div>
          <div className="tgm__side">
            <span className="tgm__lenses"><IconLens size={14} /> {game.intel} {game.intel === 1 ? 'lens' : 'lenses'} left</span>
            {nansenHref ? (
              <a className="btn btn--ghost btn--sm" href={nansenHref} target="_blank" rel="noopener noreferrer" onClick={() => onPractice(['logbook'])}>
                <IconExternal size={14} /> Open {lane.token.symbol} on Nansen
              </a>
            ) : null}
          </div>
        </header>

        <section className="tgm-panel tgm-panel--open tgm-overview" aria-label="Token overview">
          <header className="tgm-panel__head">
            <div>
              <p className="tgm-panel__nansen">Overview · Token Screener</p>
              <p className="tgm-panel__game">Harbor chart · 24h · free</p>
            </div>
            {harbor > 0 ? <PressureChip value={harbor} /> : <Badge tone="muted">deep harbor</Badge>}
          </header>
          <MarketFacts market={market} />
          <p className="tgm-panel__lesson">
            <strong>Analyst habit.</strong> Price and volume set the stage; they do not tell you who is acting. Thin liquidity
            makes every flow hit harder{harbor > 0 ? ` — this harbor adds +${harbor} pressure` : ''}.
          </p>
          <p className="tgm-panel__where">
            Perp shadow (Hyperliquid): {lane.perp.detail} {lane.perp.pressure !== 0 ? <PressureChip value={lane.perp.pressure} /> : null}
          </p>
          <ProvenanceLine provenance={market.provenance} />
        </section>

        <div className="tgm__grid">
          <article className={lane.revealed ? 'tgm-panel tgm-panel--open' : 'tgm-panel'} aria-label={`Flow Intelligence for ${lane.token.symbol}`}>
            <header className="tgm-panel__head">
              <div>
                <p className="tgm-panel__nansen">{FLOW_TOOL.nansen}</p>
                <p className="tgm-panel__game">{FLOW_TOOL.name} · {FLOW_TOOL.window}</p>
              </div>
              {lane.revealed ? <Badge tone="accent">scouted</Badge> : <Badge tone="muted"><IconLock size={11} /> fog</Badge>}
            </header>
            <p className="tgm-panel__where">On Nansen: {FLOW_TOOL.where}</p>
            <p className="tgm-panel__q">{FLOW_TOOL.question}</p>
            <ReadingPanel reading={lane.context} kind="context" revealed={lane.revealed} laneName={lane.name} />
            {lane.revealed ? (
              <>
                <ReadingPanel reading={lane.baseline} kind="baseline" revealed={lane.revealed} laneName={lane.name} />
                <p className="tgm-panel__lesson"><strong>Analyst habit.</strong> {FLOW_TOOL.lesson}</p>
              </>
            ) : (
              <div className="tgm-panel__locked">
                <Button variant="primary" size="sm" icon={<IconLens size={14} />} disabled={!planning || busy || game.intel < 1} data-coach={`scout-${lane.id}`} onClick={() => onScout(lane.id)}>
                  {game.intel < 1 ? 'No lenses left' : 'Scout flows · 1 lens'}
                </Button>
              </div>
            )}
          </article>

          {TOOL_ORDER.map((tool) => (
            <ToolPanel
              key={tool}
              tool={tool}
              lane={lane}
              planning={planning}
              lenses={game.intel}
              busy={busy}
              onOpen={() => onInvestigate(lane.id, tool)}
            />
          ))}
        </div>

        <p className="honestnote">
          Pressure values are VEILWAKE game rules, not risk scores. Wallet addresses, raw Nansen labels and USD amounts never
          reach this page — only derived ratios, counts and families. Missing views stay missing and add nothing.
        </p>
      </div>
    </Modal>
  );
}
