// THE EXAMPLE TASK HALF OF THE WALK, DRIVEN AND TIMED.
//
// So this presses the keys rather than describing them. It opens the walk at
// the command bar step with an empty store, presses C, presses ⌘↵ on the
// compose card, and then watches the row until the answer lands, stamping every
// change. It shoots each step at full size in the real app.
//
// The bridge is the app's own shape and answers only what the walk asks of it.
// The one thing it cannot do is read a disk, so the LINE the answer carries is
// computed here in node, out of a real folder, by the same shared module the
// main process uses. What is under test is the renderer half: the label on the
// compose, the row reading as working, the wait, and the sentence beside it.
//
//   node scripts/walk-the-first-task.mjs <outDir> [folder]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { answerFor } from '../main/first-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist-fr');
const outDir = process.argv[2] ?? path.join(root, 'shots', 'first-task');
const folder = process.argv[3] ?? root;
const W = 1440, H = 900;
// found (a normal machine) | missing (really has none) | unknown (the settings
// read never reached the main process, which is the state every shot of this
// screen was accidentally taken in).
const CLAUDE = process.env.CLAUDE ?? 'found';
console.log('claude code       :', CLAUDE);
fs.mkdirSync(outDir, { recursive: true });

// THE LINE THE FOLDER REALLY HAS IN IT, read by the same code the app runs.
const answer = answerFor({ folder, name: 'Zero' });
console.log('folder            :', folder);
console.log('the answer        :', JSON.stringify(answer));


// AN EMPTY STORE, which is the only honest first run and the only state the
// walk starts itself in. The project and the directive that making it composes
// both arrive through createProduct below, exactly as they do on her Mac; the
// directive is the row the walk must NOT show her.
const snapshot = {
  products: [],
  items: [],
  approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [],
    scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 4,
  },
  restartNeeded: null,
  config: { browserHome: '', browserPins: [] },
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

sweep();
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
guard(chrome, profile);
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

// THE BRIDGE. compose writes into the snapshot the way the store does, with the
// labels it was handed, and records what it was called with. firstRunAnswer
// writes the result the way main does. firstRunWalking records the hold. Every
// call is stamped, which is where the timings below come from.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__SNAP__ = ${JSON.stringify(snapshot)};
    window.__LOG__ = [];
    window.__T0__ = 0;
    const stamp = (what, extra) => window.__LOG__.push({ what, at: Date.now(), ...extra });
    window.zero = {
      snapshot: async () => window.__SNAP__,
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      sessionTrace: async () => ({ sessions: [] }),
      itemHistory: async () => ({ ok: true, lines: [] }),
      // THE SETTINGS CHANNEL IS settingsRead, AND THIS HARNESS USED TO ANSWER
      // ON settings. api.ts asks for settingsRead, finds nothing, and hands
      // back its own empty object, which said claudeFound: false. That is why
      // every welcome screen ever shot here carried "Agentbox could not find
      // Claude Code on this Mac". CLAUDE=missing shoots the machine that
      // really has none, CLAUDE=unknown shoots the answer that never arrived.
      settingsRead: async () => ({ ok: true, workspace: {
        claudeFound: ${JSON.stringify(CLAUDE === 'found')},
        claudeCertain: ${JSON.stringify(CLAUDE !== 'unknown')},
        claudeBin: '/Users/x/.local/bin/claude',
        claudeInstallUrl: 'https://code.claude.com/docs/en/setup',
        storePath: '/Users/x/store',
      }, projects: [] }),
      agentFiles: async () => ({ ok: true, files: [] }),
      projectSetting: async () => ({ ok: true }),
      setProjectSetting: async () => ({ ok: true }),
      onChanged: () => () => {},
      badge: async () => {},
      notify: async () => ({ ok: true }),
      bootInfo: async () => ({ reloaded: false }),
      compose: async (p) => {
        stamp('compose', { labels: p.labels ?? null, title: p.title });
        window.__T0__ = Date.now();
        const made = {
          id: 'w-first', product: p.product, productName: 'Agentbox v2', status: 'open',
          title: p.title, body: p.body, kind: p.kind ?? 'directive',
          labels: [...new Set(['founder', ...(p.labels ?? [])])],
          priority: p.priority ?? 5, epoch: 1, claim: null,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        window.__SNAP__ = { ...window.__SNAP__, items: [...window.__SNAP__.items, made] };
        return made;
      },
      firstRunAnswer: async (p) => {
        stamp('firstRunAnswer', { id: p.id, waited: Date.now() - window.__T0__ });
        const line = ${JSON.stringify(answer)};
        window.__SNAP__ = {
          ...window.__SNAP__,
          items: window.__SNAP__.items.map((i) => (i.id === p.id ? { ...i, result: line, updatedAt: Date.now() } : i)),
        };
        return { line, oneLiner: null };
      },
      firstRunWalking: async (p) => { stamp('firstRunWalking', { walking: p.walking }); return window.__SNAP__.supervisor; },
      chooseFolder: async () => ({ path: ${JSON.stringify(folder)} }),
      folderExists: async () => ({ exists: true }),
      // MAKING THE PROJECT COMPOSES A DIRECTIVE, the way the real store does
      // (main/store.mjs createProduct). That row is the one that started eight
      // seconds ahead of her example task, and it is the row the list must not
      // show her while the walk is up.
      createProduct: async (p) => {
        stamp('createProduct', { name: p.name, repoPath: p.repoPath });
        const now = Date.now();
        window.__SNAP__ = {
          ...window.__SNAP__,
          products: [{ slug: 'agentbox-v2', name: p.name, oneLiner: '', repoPath: p.repoPath }],
          items: [...window.__SNAP__.items, {
            id: 'w-directive', status: 'open', title: 'Take ' + p.name + ' from idea toward launch',
            kind: 'directive', product: 'agentbox-v2', productName: p.name, priority: 1,
            labels: ['founder'], epoch: 1, createdAt: now, updatedAt: now,
          }],
          supervisor: { ...window.__SNAP__.supervisor, queued: ['w-directive'] },
        };
        return { slug: 'agentbox-v2' };
      },
      answer: async () => null,
    };
    window.addEventListener('error', (e) => { window.__ERR__ = String(e.message) + ' @ ' + (e.filename||''); });
  `,
});

const goto = (url) => new Promise(async (resolve) => {
  const done = () => { ws.removeEventListener('message', onMsg); resolve(); };
  const onMsg = (e) => { const m = JSON.parse(e.data); if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) done(); };
  ws.addEventListener('message', onMsg);
  await call('Page.navigate', { url });
  setTimeout(done, 8000);
});
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// `e.key` is what every listener in the app reads, so it has to be the DOM's
// own name for the key and not the glyph the button prints. Enter dispatched as
// '↵' matches nothing and the walk simply stands still, which is what the first
// run of this script did.
const key = async (k, mods = 0) => {
  const enter = k === 'Enter';
  const common = {
    modifiers: mods,
    key: enter ? 'Enter' : k,
    code: enter ? 'Enter' : `Key${k.toUpperCase()}`,
    windowsVirtualKeyCode: enter ? 13 : k.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: enter ? 13 : k.toUpperCase().charCodeAt(0),
  };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...common, text: enter ? '\r' : k });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
};
// THE BOTTOM BAND, at real pixels. The dots are 5px tall and the thing they
// were printed on is 44px tall, so a full screen at 1440x900 shows the defect
// she named at about the size of a full stop. This is the same shot clipped to
// the last 130 points of the window, which on a 2x page is 260 real pixels of
// the reply box and whatever is sitting on it.
const band = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: H - 130, width: W, height: 130, scale: 1 } });
  fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(data, 'base64'));
  console.log('  band ' + name + '.png');
};

const shot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  shot ${name}.png  ${kb} KB`);
  return kb;
};

// WHAT IS ON THE SCREEN, every time it is asked.
const READ = `(() => {
  const t = document.querySelector('.fr-tether');
  const rows = [...document.querySelectorAll('.list-pane .row')];
  // THE FIRST CHARACTER OF THE SENTENCE, not the paragraph box: a fixed <p> can
  // be as wide as it likes and still start where the letters do. Her report of
  // 10:14 on 08-21 was that this number did not match the row's title.
  let ink = null;
  if (t && t.firstChild) {
    const rg = document.createRange();
    rg.setStart(t.firstChild, 0);
    rg.setEnd(t.firstChild, Math.min(1, t.firstChild.length));
    const r = rg.getBoundingClientRect();
    ink = Math.round(r.left * 10) / 10;
  }
  const title = rows[0]?.querySelector('.subject')?.getBoundingClientRect();
  // WHERE THE COUNTING DOTS SIT, AND WHAT IS UNDER THEM.The dots are fixed to
  // the window and the reply box is fixed to the bottom of the reading pane,
  // so nothing in either one knew about the other. This is the overlap, in
  // pixels, so it is a number rather than an impression.
  const box = (el) => (el ? (({ top, right, bottom, left }) => ({
    top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(left),
  }))(el.getBoundingClientRect()) : null);
  const dotsEl = document.querySelector('.fr-dots');
  const dockEl = document.querySelector('.dock-card');
  const dots = box(dotsEl);
  const dock = box(dockEl);
  const overlap = (dots && dock)
    ? Math.max(0, Math.min(dots.bottom, dock.bottom) - Math.max(dots.top, dock.top))
    : null;
  return {
    err: window.__ERR__ ?? null,
    sentence: t ? t.textContent : null,
    sentenceX: ink,
    titleX: title ? Math.round(title.left * 10) / 10 : null,
    misalignment: (ink != null && title) ? Math.round((ink - title.left) * 10) / 10 : null,
    dots, dock, dotsOverDock: overlap,
    tabCounts: [...document.querySelectorAll('.tab')].map((b) => b.textContent),
    railLines: [...document.querySelectorAll('.rail-row, .rail-line, .rail li')].map((e) => e.textContent),
    rows: rows.map((r) => ({
      title: r.querySelector('.subject')?.textContent ?? null,
      chip: r.querySelector('.time')?.textContent ?? null,
    })),
    focusTitle: document.querySelector('.focus-head .subject, .focus-head h1, .focus-title')?.textContent ?? null,
    focusText: (document.querySelector('.focus-body')?.textContent ?? '').slice(0, 200),
    log: window.__LOG__,
  };
})()`;

// NOTHING IS INJECTED INTO THE WALK. It starts itself, because the store is
// empty, and every step after that is a key.
await goto(origin);
await evaluate(`(() => { localStorage.clear(); localStorage.setItem('zero.theme','dark'); return true; })()`);
await goto(origin);
await evaluate(`(async () => { await document.fonts.ready; })()`);
await wait(1800);

const out = { folder, answer, steps: [] };
const step = async (name, note) => {
  const probe = await evaluate(READ);
  const kb = await shot(name);
  out.steps.push({ name, note, kb, ...probe });
  console.log(`  ${name}: ${JSON.stringify(probe.sentence)}`);
  console.log(`    rows: ${JSON.stringify(probe.rows)}`);
  if (probe.misalignment != null) console.log(`    sentence x=${probe.sentenceX}, row title x=${probe.titleX}, MISALIGNMENT ${probe.misalignment}px`);
  if (probe.dots && probe.dock) console.log(`    dots ${probe.dots.top}..${probe.dots.bottom}, reply box ${probe.dock.top}..${probe.dock.bottom}, OVERLAP ${probe.dotsOverDock}px`);
  console.log(`    tabs: ${JSON.stringify(probe.tabCounts)}`);
  return probe;
};

console.log('\n1. the welcome');
await step('01-welcome', 'where every first run starts');

console.log('\n2. Enter, then the folder');
await key('Enter');
await wait(700);
await evaluate(`(() => { const b = document.querySelector('.fr-pick'); if (b) b.click(); return !!b; })()`);
await wait(700);
await step('02-folder', 'the folder she chose');

console.log('\n3. ⌘↵ to the name, then Enter to make it');
await key('Enter', 4);
await wait(700);
await step('03-name', 'the name, taken from the folder');
await key('Enter');
await wait(1500);

console.log('\n4. the command bar');
await step('04-command', 'the walk points at ⌘K');

console.log('\n5. press C');
await key('c');
await wait(1200);
await step('05-compose', 'the first task, already written, and Start ringed');

console.log('\n6. press ⌘↵');
const sentAt = Date.now();
await key('Enter', 4); // 4 = Meta
await wait(400);
const working = await step('06-working', 'the row, working, with one row in the list');

console.log('\n4. wait for the answer');
let landedAt = null;
for (let i = 0; i < 60; i += 1) {
  await wait(200);
  const p = await evaluate(`(() => (document.querySelector('.focus-pane') ? 'focus' : 'list'))()`);
  if (p === 'focus') { landedAt = Date.now(); break; }
}
await wait(600);
const answered = await step('07-answer', 'the answer, in the real reading pane');
await band('07-answer-band');

out.timing = {
  sentAt,
  landedAt,
  msFromSendToAnswerOnScreen: landedAt ? landedAt - sentAt : null,
};
console.log('\nTIMING');
console.log('  send to answer on screen :', out.timing.msFromSendToAnswerOnScreen, 'ms');
console.log('  bridge log               :', JSON.stringify(answered.log, null, 2));
console.log('  working step sentence    :', JSON.stringify(working.sentence));
console.log('  rows during the walk     :', JSON.stringify(working.rows));
console.log('  page errors              :', answered.err);

fs.writeFileSync(path.join(outDir, 'probe.json'), JSON.stringify(out, null, 2));
ws.close(); chrome.kill(); server.close(); process.exit(0);
