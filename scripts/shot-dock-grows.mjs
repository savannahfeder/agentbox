// THE REPLY BOX AS BUILT: it grows as she writes and stops at 40% of the pane.
//
// THIS HARNESS INJECTS NOTHING. Its predecessor (shot-dock-stop.mjs) had to set
// `style.maxHeight` by hand, because nothing in the app grew the box and the
// six ceilings existed only to be looked at. That is the whole difference here:
// it types into the real build and reads back what the real code did, so a
// green run is evidence about the product and not about the harness.
//
//   node scripts/shot-dock-grows.mjs <outDir> [tag]
//
// It serves renderer/dist over a loopback port and drives headless Chrome, so
// it never touches her running app and never starts a second Electron.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guard, sweep } from './lib/chrome-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const outDir = process.argv[2] ?? path.join(root, 'shots');
const tag = process.argv[3] ?? 'grows';
fs.mkdirSync(outDir, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// The same three screens the ceilings were chosen on, in CSS pixels, which is
// the only unit the layout sees. A window at 120% zoom hands the page
// window/1.2, so her own window is SMALLER to the layout than a 13 inch at 100%.
const VIEWPORTS = [
  { key: '13in', label: '13 inch, at her 120% zoom', w: 1067, h: 667 },
  { key: 'hers', label: 'Her window, at 120% zoom', w: 1200, h: 817 },
  { key: '16in', label: '16 inch, at 100%', w: 1728, h: 1030 },
];

sweep(); // reap anything an earlier run left behind
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
  '--window-size=1728,1030', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
guard(chrome, profile);

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const timer = setTimeout(() => reject(new Error('chrome never printed a devtools url')), 20_000);
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
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

const setViewport = (v) => call('Emulation.setDeviceMetricsOverride', {
  width: v.w, height: v.h, deviceScaleFactor: 2, mobile: false,
});

const goto = (url) => new Promise(async (resolve) => {
  const done = () => { ws.removeEventListener('message', onMsg); resolve(); };
  const onMsg = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) done();
  };
  ws.addEventListener('message', onMsg);
  await call('Page.navigate', { url });
  setTimeout(done, 8000);
});

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Typed the way React hears it, so the app's own effects run exactly as they do
// under her hands. Nothing here sets a height.
const setValue = (selector, proto, s) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'NO ELEMENT';
  const setter = Object.getOwnPropertyDescriptor(window.${proto}.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(s)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`;

const openByTitle = (needle) => `(() => {
  const rows = [...document.querySelectorAll('.row, .item, li, [class*="row"]')];
  const hit = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(needle)}));
  if (!hit) return 'NOT FOUND';
  hit.click();
  return hit.className;
})()`;

async function clip(name, sel, pad = 0) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  })()`);
  if (!box) { console.log(`${name}: MISSING ${sel}`); return null; }
  const { data } = await call('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: box.w + pad * 2, height: box.h + pad * 2, scale: 2,
    },
  });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  return box;
}

// What the box costs, in the two units she actually feels: lines of HER reply
// she can see, and lines of the AGENT'S message left on screen above it. Plus
// the numbers the rule is made of, so a wrong ceiling can be told apart from a
// wrong measurement.
const boxReport = `(() => {
  const ta = document.querySelector('.dock-input');
  if (!ta) return null;
  const cs = getComputedStyle(ta);
  const lh = parseFloat(cs.lineHeight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const card = document.querySelector('.dock-card').getBoundingClientRect();
  const pane = document.querySelector('.focus-pane').getBoundingClientRect();
  const box = ta.getBoundingClientRect();
  const scroll = document.querySelector('.focus-scroll');
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    boxPx: Math.round(box.height),
    cappedAtPx: Math.round(parseFloat(ta.style.maxHeight || '0')),
    linesShown: r2((box.height - padY) / lh),
    linesWritten: r2((ta.scrollHeight - padY) / lh),
    linesHidden: r2(Math.max(0, (ta.scrollHeight - ta.clientHeight) / lh)),
    scrolls: ta.scrollHeight > ta.clientHeight + 1,
    chromePx: Math.round(card.height - box.height),
    cardPx: Math.round(card.height),
    panePx: Math.round(pane.height),
    cardShareOfPane: r2((card.height / pane.height) * 100),
    // The agent's message: what is left of the thing she is answering.
    agentLinesLeft: r2(Math.max(0, scroll.getBoundingClientRect().height) / lh),
  };
})()`;

// The same long reply the ceilings were measured against, so these numbers
// compare with `designs/reply-stop/measured-0817-stop.json`.
const LONG = [
  'Take the second one, but not the way it is drawn. The box should grow as I write instead of sitting at three lines forever, and it should stop before it eats the task I am replying to.',
  '',
  'Keep the horizontal spacing exactly as it is. That part is right and I do not want it touched.',
  '',
  'Two things I want to be careful about. The message above must not jump while I am typing, because I am usually reading it and writing at the same time, and if it moves under me I lose my place. And the footer stays where it is, at the bottom of the card, not floating.',
  '',
  'Ship it behind the same flag as the rest and tell me what changed.',
].join('\n');

const VLONG = [
  LONG,
  '',
  'One more thing, and this is the part I keep having to scroll back up for. When I am answering an agent I am usually quoting it back at itself, so the reply is long by nature and it is never one thought. It is a list of corrections against a list of claims, and I lose which correction I am on.',
  '',
  'So whatever we pick, the test is not whether the box is bigger. The test is whether I can see the whole correction I am writing without moving anything.',
].join('\n');

// The growth itself, one step at a time: this is the behaviour she asked for,
// and a table of these rows is the proof it is gradual rather than two states.
const STEPS = [
  { key: 'rest', name: 'At rest, before she types', text: '' },
  { key: 'one', name: 'One line', text: 'Yes to the second one. Ship it and tell me what changed.' },
  // Deliberately between the floor and the ceiling on every screen: this is the
  // step that shows the growth is gradual rather than two states. A shorter
  // sample sat under the 92px floor and drew the same picture as one line.
  { key: 'part', name: 'Part of a reply', text: 'Yes to the second one, but keep the horizontal spacing exactly as it is today, because that part is already right and I do not want it touched at all. The thing I keep hitting is that a correction is never one sentence, so by the time I have written the second half of it I cannot see the first half any more.' },
  { key: 'long', name: 'A real reply', text: LONG },
  { key: 'vlong', name: 'A very long reply, past the ceiling', text: VLONG },
];

// The same fixture row the ceilings were drawn on: a long agent message with a
// reply box, so the numbers here compare with the ones she picked from.
const NEEDLE = process.env.NEEDLE ?? 'build menu has never started';

async function openReply(theme) {
  await goto(`${origin}/?fixtures=1`);
  await evaluate(`localStorage.setItem('zero.theme', ${JSON.stringify(theme)});
    Object.keys(localStorage).filter((k) => k.startsWith('zero.draft.')).forEach((k) => localStorage.removeItem(k))`);
  await goto(`${origin}/?fixtures=1`);
  await wait(700);
  const opened = await evaluate(openByTitle(NEEDLE));
  await wait(700);
  await evaluate(`(document.querySelector('.dock-pill') || {click(){}}).click()`);
  await wait(400);
  return opened;
}

const readings = [];
for (const v of VIEWPORTS) {
  await setViewport(v);
  for (const theme of ['light', 'dark']) {
    await openReply(theme);
    for (const step of STEPS) {
      if (step.text) await evaluate(setValue('.dock-input', 'HTMLTextAreaElement', step.text));
      await wait(350);
      await evaluate('document.activeElement && document.activeElement.blur()');
      await wait(150);
      const r = await evaluate(boxReport);
      if (!r) { console.log(`${v.key}/${theme}/${step.key}: NO BOX`); continue; }
      readings.push({ viewport: v.key, viewportLabel: v.label, theme, step: step.key, stepName: step.name, ...r });
      await clip(`${tag}-${v.key}-${step.key}-${theme}`, '.focus-pane');
      await clip(`${tag}-card-${v.key}-${step.key}-${theme}`, '.dock-card', 8);
      console.log(`${v.key}/${theme}/${step.key}: box ${r.boxPx}px, ${r.linesShown} of ${r.linesWritten} lines, card ${r.cardShareOfPane}% of pane, scrolls=${r.scrolls}`);
    }
  }
}

fs.writeFileSync(
  path.join(outDir, `measured-${tag}.json`),
  `${JSON.stringify({ measuredAt: new Date().toISOString(), note: 'The built behaviour, nothing injected. w-becc5c66a6.', readings }, null, 2)}\n`,
);

ws.close();
chrome.kill();
server.close();
console.log(`\n${readings.length} readings -> ${path.join(outDir, `measured-${tag}.json`)}`);
