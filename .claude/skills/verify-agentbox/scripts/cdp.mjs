// A HEADLESS CHROME, DRIVEN THE WAY A PERSON DRIVES THE TAB.
//
// The screenshot scripts in scripts/ open the built screen with a fake
// `window.zero` that refuses every write (scripts/lib/inbox-harness.mjs). That
// is right for pictures and useless for verification: a press of ⌘↵ there
// reaches nothing. This one opens the real browser copy's url, so every key
// goes through the same bridge, the same IPC handlers and the same store the
// desktop uses.
//
// Keys, not coordinates. The app's own shortcuts (N for a new thread, ⌘↵ to
// send, esc to go back) are the most stable handles it has: they are in the
// help, people learn them, and they survive a redesign that moves every button.
//
// The Chrome and its profile go through scripts/lib/chrome-guard.mjs, so a
// drive that throws or is killed leaves no orphan behind.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { guard, sweep, processes } from '../../../../scripts/lib/chrome-guard.mjs';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Google Chrome on a Mac; elsewhere `VERIFY_CHROME`, or the Chromium Playwright installed (the Linux cloud has it). */
export function findChrome(platform = process.platform, env = process.env, playwright = () => createRequire(import.meta.url)('playwright')) {
  if (platform === 'darwin') return MAC_CHROME;
  if (env.VERIFY_CHROME) return env.VERIFY_CHROME;
  try { return playwright().chromium.executablePath(); } catch { return MAC_CHROME; }
}
export const CHROME = findChrome();

const KEYS = {
  Enter: { code: 'Enter', keyCode: 13 },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ' ': { code: 'Space', keyCode: 32 },
};
const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** The editing command a Mac keyboard sends with a shortcut: a key event alone selects or undoes nothing. */
export function editingCommands(key, mods = []) {
  const held = [...mods].sort().join('+');
  const k = key.toLowerCase();
  if (held === 'meta' && k === 'a') return ['selectAll'];
  if (held === 'meta' && k === 'z') return ['undo'];
  if (held === 'meta+shift' && k === 'z') return ['redo'];
  return [];
}

/** The Chrome processes, helpers too, started on exactly this profile. */
export function holdersOf(profile, list = processes, chrome = CHROME) {
  const bundle = chrome.includes('.app/') ? `${chrome.split('.app/')[0]}.app/` : chrome;
  const flag = new RegExp(`--user-data-dir=${profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`);
  return list().filter((p) => p.command.startsWith(bundle) && flag.test(p.command)).map((p) => p.pid);
}

/** Stop any Chrome still on this profile: one that will not answer keeps its lock, and every Chrome after it exits. */
export function freeProfile(profile) {
  const pids = holdersOf(profile);
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  return pids.length;
}

/**
 * Start a headless Chrome on a throwaway profile and wait for its devtools
 * address. `detached` leaves it running after this process ends (the breaker's
 * browser, which lives across many short commands); then its profile should sit
 * inside the instance folder, so `live.mjs down` finds and stops it.
 */
export async function launchChrome({ width = 1440, height = 900, profile, detached = false, bin = CHROME, waitMs = 20_000 } = {}) {
  if (!fs.existsSync(bin)) throw new Error(`No Google Chrome at ${bin}. The live drive needs it.`);
  const chrome = spawn(bin, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    // A Chrome given up on still holds the profile's lock, and every later
    // Chrome on that profile hands off to it and exits: it goes too.
    const timer = setTimeout(() => {
      chrome.kill('SIGKILL');
      reject(new Error(`chrome never printed a devtools url in ${Math.round(waitMs / 1000)} s, so it was stopped`));
    }, waitMs);
    chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    chrome.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`chrome exited before printing a devtools url (code ${code}); another Chrome may hold ${profile}`));
    });
  });
  if (detached) { chrome.stderr.destroy(); chrome.unref(); }
  return { chrome, wsUrl };
}

/** Open `url` in a fresh headless Chrome. Returns the handful of verbs a drive needs. */
export async function openTab(url, { width = 1440, height = 900 } = {}) {
  sweep();
  const profile = fs.mkdtempSync('/tmp/shot-profile-');
  const { chrome, wsUrl } = await launchChrome({ width, height, profile });
  const cleanup = guard(chrome, profile);
  const tab = await connect(wsUrl, { width, height });
  return { ...tab, close: () => { tab.detach(); cleanup(); } };
}

/**
 * Drive a page of a Chrome that is already running. With `targetId` it takes
 * over that page (the breaker's next command); without, it opens a new one.
 */
export async function connect(wsUrl, { width = 1440, height = 900, targetId: existing = null } = {}) {
  const ws = new WebSocket(wsUrl);
  // A Chrome that has gone never opens the socket; without a deadline Node
  // exits with "unsettled top-level await" and nothing says why.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome did not answer at ${wsUrl}`)), 10_000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error(`Chrome is not there any more (${wsUrl})`)); };
  });
  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') events.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  };
  // A Chrome that goes away answers nothing; every call waiting on it fails
  // with that fact instead of hanging the drive forever.
  let gone = null;
  ws.onclose = () => {
    gone = new Error('headless Chrome closed the connection');
    for (const settle of pending.values()) settle({ error: { message: gone.message } });
    pending.clear();
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (gone) return reject(gone);
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const targetId = existing ?? (await send('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  // Dark, because that is how the people who use this read it.
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const goto = async (to) => {
    await call('Page.navigate', { url: to });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try { if (await evaluate('document.readyState') === 'complete') break; } catch { /* navigating */ }
      await wait(100);
    }
    await evaluate('document.fonts.ready.then(() => true)');
  };
  /** One key, as a person presses it: `press('n')`, `press('Enter', ['meta'])`. */
  const press = async (key, mods = []) => {
    const modifiers = mods.reduce((n, m) => n | MODIFIERS[m], 0);
    const named = KEYS[key];
    const base = named
      ? { key, code: named.code, windowsVirtualKeyCode: named.keyCode }
      : { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    const text = !named && !mods.length ? key : key === 'Enter' && !mods.length ? '\r' : undefined;
    const commands = editingCommands(key, mods);
    await call('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', modifiers, ...base, ...(text ? { text } : {}), ...(commands.length ? { commands } : {}) });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...base });
  };
  /** Text into whatever has focus, the way a paste or an IME lands it. */
  const type = (text) => call('Input.insertText', { text });
  const capture = async (file) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };
  /** Wait for an expression in the page to be truthy, and say which one when it never is. */
  const until = async (expression, { ms = 30_000, why = expression } = {}) => {
    const deadline = Date.now() + ms;
    for (;;) {
      const got = await evaluate(expression).catch(() => null);
      if (got) return got;
      if (Date.now() > deadline) throw new Error(`waited ${Math.round(ms / 1000)}s for ${why} and it never happened`);
      await wait(200);
    }
  };
  const text = () => evaluate('document.body.innerText');

  return {
    call, evaluate, goto, press, type, capture, until, wait, text, errors: events, targetId,
    // Lets go of the page and leaves Chrome running.
    detach: () => { try { ws.close(); } catch { /* gone */ } },
  };
}
