// DO ⌘F'S BUTTONS TAKE A REAL CLICK? (w-cc5bc203d0)
//
// A fix that was only checked in a headless browser still did not work in the
// real app, so this checks it for certain before a push.
//
// A headless browser has no window, so it has no title bar, no drag strip and
// no window server between the pointer and the page. This runs the real app
// from this checkout in a THROWAWAY HOME (its own single-instance lock, see
// scripts/fresh-user.mjs, so the user's own app is untouched), presses ⌘F and clicks each
// button with real OS events (/tmp/osclick, CGEvent through the window
// server), and records two things per press: whether a mousedown reached the
// page at all, and whether the box's count moved.
//
// IT TAKES OVER THE SCREEN: it pins a window above everything and moves the
// pointer. Run it ONCE, only when the user is away or has said yes. Repeated
// runs while someone is working make the computer unusable for them, and a run
// here is not free just because it was announced.
//
// Build the pointer tool first: swiftc -O scripts/osclick.swift -o /tmp/osclick
//   node scripts/probe-find-buttons-really-click.mjs [osclick path]
//   PROBE_CHAT=1 ...   the same presses inside a chat
//   PROBE_SWEEP=1 ...  presses straight down the window, to find the dead band
//
// WHAT IT MEASURED (2026-09-27). Box at 10 points: 0 of 8 presses on its
// buttons reached the page, with the window verified in front. Sweep: presses
// at 4 to 36 points from the top never arrive, 44 and below do. Box at 98:
// Next 1→2, Previous 2→1, Next 1→2, Close shut it, 4 of 4. Every press that
// reached the page in any run landed on the button it was aimed at.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const osclick = process.argv[2] ?? '/tmp/osclick';
const home = fs.mkdtempSync('/tmp/find-probe-home-');
fs.mkdirSync(path.join(home, 'Library'), { recursive: true });
const PORT = 9300 + Math.floor(Math.random() * 500);

// A CHAT TO SEARCH (PROBE_CHAT=1), because a chat is where she hit it. The
// store sits inside the throwaway home; zero.config.json in this checkout
// points the app at it, and is put back as it was when the run ends.
const CHAT = !!process.env.PROBE_CHAT;
const configFile = path.join(root, 'zero.config.json');
const configBefore = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null;
const CHAT_ID = 'w-f1d0c0ffee';
if (CHAT) {
  const { ensureMachineryDir } = await import('../main/store/home.mjs');
  const store = path.join(home, 'store');
  const accountId = '00000000-0000-4000-8000-00000000f1d0';
  const productDir = path.join(store, 'accounts', accountId, 'north');
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({ name: 'North Sound' }));
  const t0 = Date.now() - 3600e3;
  const said = [
    ['founder', { title: 'Tighten the landing page copy', body: 'The landing page headline is too long. Cut it to one line.', status: 'open', kind: 'directive' }],
    ['agent', { result: 'I cut the headline to one line. The subheader still runs to three lines on a phone.' }],
    // No founder replies: a row whose last word is the founder's answer files itself
    // out of the inbox, and the inbox is where this opens the chat from.
    ['agent', { note: 'Moving the FAQ above the footer on the landing page.' }],
    ['agent', { result: 'The landing page is merged. The sidebar spacing is next.' }],
  ];
  const ledger = path.join(ensureMachineryDir(productDir, store), 'work-items.jsonl');
  fs.writeFileSync(ledger, said.map(([source, patch], i) => JSON.stringify({ id: CHAT_ID, ts: t0 + i * 60e3, source, patch })).join('\n') + '\n');
  fs.writeFileSync(configFile, JSON.stringify({ storeRoot: store, accountId }, null, 2));
}
const putConfigBack = () => {
  if (!CHAT) return;
  if (configBefore === null) fs.rmSync(configFile, { force: true });
  else fs.writeFileSync(configFile, configBefore);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The tool refuses (exit 3) any press that would land outside the test window,
// because her own app is full-screen on this Mac and an unguarded press hits
// it. A refusal stops the whole run.
const os = (...a) => {
  try { return execFileSync(osclick, a.map(String), { encoding: 'utf8' }); } catch (err) {
    out.error = `osclick ${a.join(' ')}: ${String(err.stdout || err.message).trim()}`;
    finish(1);
  }
};

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
// --inspect opens the MAIN process too, because only the app itself may bring
// its window in front of the user's: macOS refuses that from any other process.
const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--inspect=${PORT + 1}`], {
  cwd: root,
  env: { ...process.env, HOME: home, CFFIXED_USER_HOME: home, ZERO_NO_SUPERVISOR: '1' },
  stdio: ['ignore', 'ignore', 'ignore'],
});
const out = { home, steps: [] };
const finish = (code) => { try { child.kill(); } catch {} putConfigBack(); console.log(JSON.stringify(out, null, 1)); process.exit(code); };
setTimeout(() => { out.error = 'timed out'; finish(1); }, 120_000);

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await wait(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = list.find((t) => t.type === 'page' && /index\.html|localhost|file:/.test(t.url));
  } catch { /* not up yet */ }
}
if (!target) { out.error = 'the app never offered a page'; finish(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
};

await wait(2500);
await evaluate(`localStorage.setItem('zero.firstRun.done', '1'); location.reload(); 1`);
await wait(3500);

// Every press that reaches the page leaves a mark here, before any handler.
const arm = `(() => { window.__downs = []; if (window.__armed) return 1; window.__armed = true; window.addEventListener('mousedown', (e) => {
  const t = e.target;
  const name = (el) => (el && el.getAttribute && (el.getAttribute('aria-label') || el.className)) || (el && el.nodeName);
  window.__downs.push({ target: name(t), clientX: e.clientX, clientY: e.clientY,
    under: document.elementsFromPoint(e.clientX, e.clientY).slice(0, 4).map(name) });
}, true); return 1; })()`;
await evaluate(arm);

// window.screenX read 0 on a window the window server put at 240,26, so the
// origin comes from the window server itself. The title bar is hidden and
// inset, so the page starts at the window's own top-left corner; checked below
// by the heights agreeing.
async function inFront() {
  const list = await (await fetch(`http://127.0.0.1:${PORT + 1}/json/list`)).json();
  const mainWs = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r) => { mainWs.onopen = r; });
  const said = new Promise((r) => { mainWs.onmessage = (e) => r(JSON.parse(e.data)); });
  mainWs.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(() => {
    const { app } = process._linkedBinding('electron_browser_app');
    const { BaseWindow } = process._linkedBinding('electron_browser_base_window');
    app.focus({ steal: true });
    const w = BaseWindow.getAllWindows()[0];
    // Pinned above every other window for the run, so a click she makes in
    // another app cannot put that app over the test between two presses.
    w.setAlwaysOnTop(true, 'floating');
    w.moveTop(); w.focus();
    return 'ok';
  })()`, returnByValue: true } }));
  const m = await said;
  mainWs.close();
  return m.result?.result?.value ?? JSON.stringify(m.result?.exceptionDetails?.exception?.description ?? m);
}
out.broughtToFront = await inFront();
await wait(700);
const [wx, wy, ww, wh] = os('bounds', child.pid).trim().split(/\s+/).map(Number);
const inner = await evaluate('({ w: innerWidth, h: innerHeight, zoom: devicePixelRatio })');
out.windowServer = { x: wx, y: wy, w: ww, h: wh, page: inner };
if (Math.abs(inner.h - wh) > 1 || Math.abs(inner.w - ww) > 1) { out.error = 'the page is not the whole window; origin unknown'; finish(1); }
// READ FRESH BEFORE EVERY PRESS. Bringing the window forward can move and
// resize it (a tiling app on this Mac answers focus), and a position read
// before that sends the press to the wrong place: measured, a press meant for
// Close landed nowhere and Previous counted twice.
const where = async (sel) => {
  const [x, y, w, h] = os('bounds', child.pid).trim().split(/\s+/).map(Number);
  const r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, iw: innerWidth, ih: innerHeight }; })()`);
  if (!r) return null;
  if (Math.abs(r.iw - w) > 1 || Math.abs(r.ih - h) > 1) return { mismatch: { window: [x, y, w, h], page: [r.iw, r.ih] } };
  return { x: x + r.x, y: y + r.y, page: { x: r.x, y: r.y }, window: [x, y, w, h] };
};
const box = () => evaluate(`(() => { const b = document.querySelector('.find-bar'); return b ? (b.querySelector('.find-count')?.textContent ?? '') : null; })()`);

// Into the chat first. This press is the page's own (it is navigation, not
// the thing under test).
if (CHAT) {
  const row = await evaluate(`(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Tighten the landing page copy'); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!row) {
    out.error = 'the chat is not in the inbox';
    out.snapshot = await evaluate(`window.zero.snapshot().then((s) => ({ products: (s.products || []).map((p) => p.slug + ':' + p.name), items: (s.items || []).map((i) => i.id + ':' + i.status + ':' + i.title), root: s.config && s.config.storeRoot }))`);
    finish(1);
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: row.x, y: row.y, button: 'left', clickCount: 1 });
  await wait(1500);
  out.inTheChat = await evaluate(`document.body.innerText.includes('The subheader still runs to three lines')`);
  await evaluate(arm);
}

// Focus the window with a real click somewhere harmless, then a real ⌘F.
// The middle of the window, where the empty inbox has nothing to press. Never
// the bottom edge: the Dock sits there and takes the click.
const body = { x: wx + ww / 2 + 120, y: wy + wh / 2 + 60 };
os('click', child.pid, Math.round(body.x), Math.round(body.y));
await wait(400);
out.focusClick = { at: body, reachedThePage: (await evaluate('window.__downs')).length > 0, focused: await evaluate('document.hasFocus()') };
// ⌘F goes to whichever app is in front. If the click did not land in this
// window, that app is the user's, so stop rather than open their find box.
if (!out.focusClick.reachedThePage) { out.error = 'the focusing click never reached the test window'; finish(1); }
os('cmdkey', child.pid, 3);
await wait(600);
out.boxOpenedByCmdF = (await box()) !== null;
out.screen = await evaluate(`({ text: document.body.innerText.slice(0, 160) })`);
if (!out.boxOpenedByCmdF) { out.error = '⌘F did not open the box'; finish(1); }

// Something to find: the empty inbox and the sidebar always say "Inbox".
await call('Input.insertText', { text: CHAT ? 'landing page' : 'in' });
await wait(500);
out.afterTyping = await box();

// SWEEP (PROBE_SWEEP=1): real presses straight down the window, well left of
// the box, to find where presses start reaching the page. Nothing there acts
// on a press except what is recorded.
if (process.env.PROBE_SWEEP) {
  out.sweep = [];
  const x = wx + 700;
  for (const py of [4, 12, 20, 28, 36, 44, 52, 60, 80]) {
    await evaluate('window.__downs = []; 1');
    await inFront();
    await wait(200);
    os('click', child.pid, x, wy + py);
    await wait(350);
    const downs = await evaluate('window.__downs');
    out.sweep.push({ pageY: py, reached: downs.length > 0, target: downs[0]?.target ?? null });
  }
  finish(0);
}

for (const label of ['Next match', 'Previous match', 'Next match', 'Close']) {
  // NOT brought forward again here. Measured: asking before every press made
  // presses vanish and then land twice, because a click on a window that is
  // still becoming active only activates it (Electron does not accept first
  // mouse), and macOS finishes activating on its own clock. It was brought
  // forward once, above; the tool refuses any press if it has lost the front.
  const at = await where(`.find-bar [aria-label="${label}"]`);
  if (!at) { out.steps.push({ label, missing: true }); continue; }
  if (at.mismatch) { out.steps.push({ label, ...at }); continue; }
  await evaluate('window.__downs = []; 1');
  const before = await box();
  os('click', child.pid, at.x.toFixed(1), at.y.toFixed(1));
  await wait(500);
  const after = await box();
  const downs = await evaluate('window.__downs');
  out.steps.push({ label, at: { x: +at.x.toFixed(1), y: +at.y.toFixed(1), page: at.page, window: at.window }, before, after, reachedThePage: downs.length > 0, downs });
}
out.window = await evaluate(`({ screenX, screenY, innerWidth, innerHeight, finding: document.documentElement.hasAttribute('data-finding') })`);
finish(0);
