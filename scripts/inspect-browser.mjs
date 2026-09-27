import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const binary=process.env.AGENT_BROWSER_BIN || 'C:/Users/goldstream/.workbuddy-ai/binaries/node/workspace/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome=process.env.CHROME_PATH || 'C:/Users/goldstream/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
function browser(...args){const r=spawnSync(binary,['--session','veilwake-inspect',...args],{encoding:'utf8',env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH},timeout:60000});if(r.status!==0)throw new Error(r.stderr||r.stdout||String(r.error));return r.stdout;}
try{
 console.log(browser('--executable-path',chrome,'open','http://127.0.0.1:4173'));
 console.log(browser('snapshot','-i'));
 browser('eval',"localStorage.clear();localStorage.setItem('veilwake.v1',JSON.stringify({sessionId:null,mode:null,tutorialDismissed:true,stats:{wins:0,bestScore:0,runs:0}}));location.reload()");
 browser('set','viewport','1440','1000');
 console.log(browser('snapshot','-i'));
 console.log(browser('screenshot',path.join(root,'outputs','desktop-title.png')));
 const snapshot=browser('snapshot','-i');
 const demo=snapshot.split('\n').find(l=>/button/i.test(l)&&/rehearsal/i.test(l));
 if(!demo)throw new Error('No rehearsal button found');
 const ref=demo.match(/ref=(e\d+)/)?.[1]||demo.match(/\[ref=(e\d+)\]/)?.[1];
 if(!ref)throw new Error(demo);
 console.log(browser('click','@'+ref));
 console.log(browser('snapshot','-i'));
 console.log(browser('screenshot',path.join(root,'outputs','desktop-board.png')));
 console.log(browser('errors'));
 console.log(browser('console'));
}finally{try{browser('close')}catch{}}
