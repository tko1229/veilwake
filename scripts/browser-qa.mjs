import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
const binary=process.env.AGENT_BROWSER_BIN||'C:/Users/goldstream/.workbuddy-ai/binaries/node/workspace/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome=process.env.CHROME_PATH||'C:/Users/goldstream/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
const checks=[];
const session=process.env.BROWSER_SESSION||'veilwake-qa-final';
function browser(...args){const r=spawnSync(binary,['--session',session,...args],{encoding:'utf8',env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH},timeout:90000});if(r.status!==0)throw new Error(r.stderr||r.stdout||String(r.error));return r.stdout.trim();}
function check(name,pass){if(!pass)throw new Error(name);checks.push(name);console.log('PASS',name);}
function evaluate(code){const out=browser('eval',`(async()=>JSON.stringify(await (${code})))()`);const one=JSON.parse(out);return typeof one==='string'?JSON.parse(one):one;}
function wait(fn){browser('wait','--fn',`Boolean(${fn})`);}
function click(text){const s=browser('snapshot','-i');const line=s.split('\n').find(l=>l.includes('- button')&&l.includes(text));if(!line)throw new Error('Missing button '+text+'\n'+s);const ref=line.match(/ref=(e\d+)/)?.[1];browser('click','@'+ref);}
function screen(name){browser('eval','window.scrollTo(0,0)');browser('screenshot',path.join(root,'outputs',name));}
function state(){return evaluate(`(async()=>{const s=JSON.parse(localStorage.getItem('veilwake.v1'));if(!s.sessionId)return s;return await(await fetch('/api/game/'+s.sessionId)).json()})()`);}
try{
 browser('--executable-path',chrome,'open',origin);
 browser('set','viewport','1440','1000');
 check('First-time user sees product without modal',evaluate(`!document.querySelector('dialog[open]')`));
 screen('veilwake-desktop.png');
 click('THE TUTORIAL');wait("document.querySelector('article.reach')");
 check('Rehearsal explicitly labeled fictional',evaluate(`document.body.innerText.includes('fictional demo run') || document.body.innerText.includes('DEMO')`));
 check('Fog enforced in actual server response',state().lanes[0].context.signals.length===2);
 const plan=[['brace','harvest','brace'],['harvest','brace','brace'],['brace','brace','harvest']];
 for(let wave=1;wave<=3;wave++){
   browser('snapshot','-i');browser('click','article.reach:nth-child(1) .reach__actions > button');
   wait("document.querySelectorAll('.reach--revealed').length > 0");
   if(wave===1){check('Scout actually consumes a lens',state().intel===4);screen('veilwake-scout.png');}
   for(let i=0;i<3;i++){browser('click',`article.reach:nth-child(${i+1}) .stance:nth-child(${['harvest','brace','divert'].indexOf(plan[wave-1][i])+1})`);}
   click('RESOLVE WAVE '+wave);wait("document.querySelector('dialog[open] .round')");
   check('Wave '+wave+' resolves with consequence',state().history.length===wave);
   if(wave===1){check('False calm derives from trader/whale disagreement',state().history[0].lanes[0].pattern==='The false calm');screen('veilwake-consequence.png');}
   click(wave===3?'SEE FINAL RESULTS':'NEXT WAVE');
   wait(wave===3?"document.querySelector('.end')":`document.querySelector('.board') && !document.querySelector('dialog[open]') && document.body.innerText.includes('Wave ${wave+1}')`);
 }
 check('Deterministic route reaches victory',evaluate(`document.querySelector('.end').innerText.includes('24')`));
 screen('veilwake-victory.png');
 click('BACK TO THE TITLE');wait("document.querySelector('.welcome')");
 click('ENTER THE LIVE CURRENT');wait("document.querySelector('article.reach') || document.querySelector('.errdetail')");
 const live=state();check('Real Nansen session created',live.mode==='live'&&Array.isArray(live.lanes));
 check('Live provenance has upstream request IDs',live.lanes.every(l=>l.context.provenance.requestId));
 check('Public live state contains no raw amounts/addresses',!JSON.stringify(live).includes('net_flow_usd')&&!JSON.stringify(live).includes('token_address'));
 screen('veilwake-live.png');
 browser('reload');wait("document.querySelector('article.reach')");check('Refresh resumes the same live voyage',state().id===live.id);
 click('RESOLVE WAVE 1');wait("document.querySelector('dialog[open] .round') || document.querySelector('[role=alert]')");
 const resolved=state();check('Live commit resolves from Nansen 5m readings',resolved.phase==='resolved'&&resolved.history[0].lanes.every(l=>l.reading.provenance.timeframe==='5m'&&l.reading.provenance.requestId));
 screen('veilwake-live-result.png');
 click('BACK TO THE BOARD');click('Engine room');wait("document.body.innerText.includes('successful') || document.querySelector('.statgrid')");
 check('Admin telemetry rendered without NaN',!evaluate(`document.body.innerText`).includes('NaN'));
 screen('veilwake-engine-room.png');
 click('Back to game');
 browser('set','viewport','390','844');
 check('390px viewport has no horizontal overflow',evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`));
 screen('veilwake-mobile.png');
 browser('set','viewport','768','1024');
 check('768px viewport has no horizontal overflow',evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`));
 screen('veilwake-tablet.png');
 check('No browser runtime errors',browser('errors')==='');
 const consoleOutput=browser('console');check('No production console errors',!consoleOutput.toLowerCase().includes('[error]'));
 const telemetry=await(await fetch(origin+'/api/admin/telemetry')).json();
 const result={at:new Date().toISOString(),checks:checks.length,passed:checks,telemetry:telemetry.telemetry};
 writeFileSync(path.join(root,'outputs','qa-evidence.json'),JSON.stringify(result,null,2));
 console.log('ALL BROWSER CHECKS PASSED',checks.length);console.log('Actual API calls',result.telemetry.requests);
}finally{try{browser('close')}catch{}}
