// Verify the served app using a fictional inbox and a fresh browser profile.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { guard, sweep, startableChrome } from './lib/chrome-guard.mjs';
const origin = process.argv[2];
const outDir = path.resolve(process.argv[3] || 'phone-verification');
const url = new URL(origin);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Expected an https site or a local test server');
const snapshot = {products:[],items:[],approvals:[],phoneStatus:'Your computer is off. Replies carry on in Agentbox Cloud.',supervisor:{paused:false,running:[],stalled:[],queued:[],scheduled:[],productOrder:[],hiddenProducts:[],personalProducts:[],capacity:0},restartNeeded:null,config:{browserHome:'',browserPins:[]}};
sweep();
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const W = 1440, H = 1000;
const chrome = spawn(startableChrome(), [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run', `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
guard(chrome, profile);
const deadline = setTimeout(() => { chrome.kill(); throw new Error('Phone dismissal verification exceeded 60 seconds'); }, 60000);
chrome.on('error', err => { throw err; });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const timer = setTimeout(() => reject(new Error('chrome never printed a devtools url')), 20_000);
  chrome.stderr.on('data', (d) => { buf += d.toString(); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);
await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });


await call('Page.addScriptToEvaluateOnNewDocument', { source: `
window.__SNAP__ = ${JSON.stringify(snapshot)};
window.zero = new Proxy({
 snapshot: async () => window.__SNAP__,
 dashboard: async () => ({ok:false}), repeats: async () => [],
 sessionTrace: async () => ({sessions:[]}), onChanged: () => () => {},
}, {get:(t,k)=> k in t ? t[k] : k === 'then' ? undefined : /^on[A-Z]/.test(String(k)) ? () => () => {} : async () => null});
localStorage.setItem('zero.firstRun.done','1');
localStorage.setItem('zero.theme','dark');
`});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const key = (k) => evaluate(`document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
const shoot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64'));
};
fs.mkdirSync(outDir, { recursive: true });
await call('Page.navigate', { url: origin });
for (let attempt = 0; attempt < 80; attempt += 1) {
  if (await evaluate("document.querySelector('[aria-label=\"Dismiss notice\"]') !== null")) break;
  await wait(250);
}


await evaluate("document.documentElement.dataset.door='phone'");
await wait(500);
await shoot('before-dismiss-dark.png');
if (await evaluate("document.querySelectorAll('[aria-label=\"Dismiss notice\"]').length") < 1) { ws.close(); chrome.kill();  throw new Error('Expected the dismiss button'); }
console.log('button dimensions', await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Dismiss notice\"]').getBoundingClientRect();return [r.width,r.height]})()"));
await shoot('before-dismiss-dark.png');
await evaluate("[...document.querySelectorAll('[aria-label=\"Dismiss notice\"]')].at(-1).click()");
await wait(200);
if (await evaluate("document.querySelectorAll('[aria-label=\"Dismiss notice\"]').length") !== 0) throw new Error('Notice did not disappear');
await shoot('after-dismiss-dark.png');
await call('Page.reload');
await wait(1500);
if (await evaluate("document.querySelectorAll('[aria-label=\"Dismiss notice\"]').length") !== 0) throw new Error('Notice returned after reload');
console.log('Dismissal and reload persistence passed.');
clearTimeout(deadline); ws.close(); chrome.kill(); process.exit(0);


