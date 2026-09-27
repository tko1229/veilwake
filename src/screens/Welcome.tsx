import type { Doctrine, Mode, HealthReport } from '../types';
import { DOCTRINES, FLOW_TOOL, TOOLS, TOOL_ORDER } from '../types';
import type { PlayerStats } from '../storage';
import { PRACTICE_KEYS } from '../manualData';
import { Badge, Button, SectionHead } from '../components';
import { IconAlert, IconBeacon, IconCheck, IconHelp } from '../icons';
export interface WelcomeProps {
  mode:Mode;onModeChange:(mode:Mode)=>void;doctrine:Doctrine;onDoctrineChange:(doctrine:Doctrine)=>void;onStart:(mode:Mode)=>void;
  health:HealthReport|null;healthFailed:boolean;stats:PlayerStats;notice:string|null;onDismissNotice:()=>void;onOpenRules:()=>void;
  onOpenManual:()=>void;practicedCount:number;tutorialCompleted?:boolean;
}
const TOOLKIT = [
  { nansen: 'Token Screener', game: 'Harbor chart', note: 'which tokens, how deep the harbor' },
  { nansen: FLOW_TOOL.nansen, game: FLOW_TOOL.name, note: 'who is buying vs selling, by cohort' },
  ...TOOL_ORDER.map((tool) => ({ nansen: TOOLS[tool].nansen, game: TOOLS[tool].name, note: TOOLS[tool].question })),
  { nansen: 'Perp Screener', game: 'Storm glass', note: 'Smart Money leverage on Hyperliquid' },
  { nansen: 'Smart Alerts', game: 'Tripwire', note: 'a condition that braces the gates for you' },
];
export function Welcome({doctrine,onDoctrineChange,onStart,health,healthFailed,stats,notice,onDismissNotice,onOpenRules,onOpenManual,practicedCount,tutorialCompleted=false}:WelcomeProps){
  return <div className="welcome">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <div className="welcome-hero__copy">
        <p className="stagecard__kicker">An on-chain strategy game / Nansen Meridian 2026</p>
        <h1 id="welcome-title">Read the current.<br/><em>Keep the lights on.</em></h1>
        <p className="welcome__lede">Whales, traders and exchanges move the water. You hold the gates. Every instrument in your hands is a real Nansen view — play three waves and you will have run the workflow a Nansen analyst runs on a token.</p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" onClick={()=>onStart('live')}>Enter the live current <span aria-hidden="true">→</span></Button>
          <Button variant="ghost" size="lg" onClick={()=>onStart('demo')} icon={tutorialCompleted?<IconCheck size={16}/>:undefined}>{tutorialCompleted?'Replay the tutorial':'Start the tutorial'}</Button>
        </div>
        <p className="hero-tutorial">{tutorialCompleted
          ? <><strong>Tutorial complete.</strong> You have met all three currents. The live current is ready when you are.</>
          : <><strong>New here? Start with the tutorial.</strong> A guided, three-chapter rehearsal on fictional data: about five minutes, no API key needed.</>}</p>
        <p className="hero-fine">No wallet. No wagers. Real Nansen data, fictional consequences.</p>
        <div className="hero-facts"><Badge>3 reaches</Badge><Badge>3 waves</Badge><Badge>8 Nansen endpoints</Badge><Badge tone="accent">One light to protect</Badge></div>
        <a href="https://nansen.ai" target="_blank" rel="noreferrer" className="hero-attribution">Powered by Nansen API</a>
      </div>
      <div className="hero-machine" aria-label="Illustration of game rules, not live data">
        <div className="hero-machine__top"><span>VEILWAKE / LOCKWORK 01</span><span>RULES PREVIEW</span></div>
        <div className="machine-current">
          <div><b>W</b><span>Whales</span><strong>IN ↓</strong></div>
          <div><b>T</b><span>Traders</span><strong className="hazard-text">OUT ↑</strong></div>
          <div><b>E</b><span>Exchanges</span><strong>IN ↓</strong></div>
        </div>
        <div className="machine-pipes" aria-hidden="true"><i/><i/><i/></div>
        <div className="machine-crosscurrent"><span>Opposing actors.</span><strong>A hidden crosscurrent.</strong></div>
        <div className="machine-gate" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>
        <div className="machine-beacon"><div className="beacon-ring"><span>18<small>CHARGE TO LIGHT</small></span></div><div><p>YOU HOLD<br/>THE GATES.</p><small>Investigate. Harvest. Brace. Divert.</small></div></div>
        <p className="machine-disclaimer">Illustrative scenario, not current market activity. In live play, Nansen determines which actors move.</p>
      </div>
    </section>
    {notice&&<div className="honestnote notice"><p>{notice}</p><Button variant="quiet" onClick={onDismissNotice}>Dismiss</Button></div>}
    {(health?.keyConfigured===false||healthFailed)&&<p className="honestnote honestnote--warn"><IconAlert size={14}/> {healthFailed?'The game server is not responding. Retry when it is available.':'No server API key configured. Rehearsal works; live mode needs NANSEN_API_KEY.'}</p>}
    <div className="playbook-strip" aria-label="How to play"><div><b>01</b><h2>Investigate like an analyst.</h2><p>Open Token God Mode on each reach. Every view costs a lens — choose the ones that answer your question.</p></div><div><b>02</b><h2>Make the hard call.</h2><p>Harvest for charge. Brace for safety. Divert at a neighbour’s expense. Set one Smart Alert.</p></div><div><b>03</b><h2>Learn what you missed.</h2><p>The wave report shows every Nansen view’s verdict — seen or not. Then check the token on Nansen yourself.</p></div></div>
    <section className="toolkit" aria-labelledby="toolkit-title">
      <div className="toolkit__head">
        <h2 id="toolkit-title">Your Nansen toolkit</h2>
        <p>Nine instruments, each a real Nansen feature. The field manual covers the rest of the platform, too.</p>
        <Button variant="ghost" onClick={onOpenManual} icon={<IconBeacon size={15}/>}>Field manual · {practicedCount}/{PRACTICE_KEYS.length} practiced</Button>
      </div>
      <ol className="toolkit__list">
        {TOOLKIT.map((item,index)=><li key={item.nansen} className="toolkit__item"><span className="toolkit__n">{String(index+1).padStart(2,'0')}</span><strong>{item.nansen}</strong><em>{item.game}</em><span>{item.note}</span></li>)}
      </ol>
    </section>
    <div className="welcome__grid">
      <section className="surface startblock" aria-labelledby="doctrine-title">
        <SectionHead title="Choose your temperament" id="doctrine-title" note="For live runs · the tutorial always sails as Keeper"/>
        <div className="doctrines" role="group" aria-label="Doctrine">{(['keeper','cartographer','engineer'] as Doctrine[]).map(id=><button key={id} type="button" className="doctrine" aria-pressed={doctrine===id} onClick={()=>onDoctrineChange(id)}><span className="doctrine__check"><IconCheck size={16}/></span><span className="doctrine__name">{DOCTRINES[id].name}</span><span className="doctrine__desc">{DOCTRINES[id].description}</span></button>)}</div>
      </section>
      <section className="surface startblock" aria-labelledby="record-title"><SectionHead title="Your keeper’s record" id="record-title" note="Only on this device"/><div className="statgrid">{[['Runs',stats.runs],['Wins',stats.wins],['Best score',stats.bestScore]].map(([label,value])=><div className="statgrid__cell" key={label}><p className="statgrid__label">{label}</p><p className="statgrid__value">{value}</p></div>)}</div><Button variant="quiet" onClick={onOpenRules} icon={<IconHelp size={15}/>}>Rules, attribution & cohort legend</Button></section>
    </div>
    <p className="honestnote" style={{marginTop:22}}>Real observations. Fictional consequences. Live play uses eight Nansen API views; the rehearsal uses explicitly invented scenarios. No market predictions, raw wallet lists, addresses or real-money trading.</p>
  </div>;
}
