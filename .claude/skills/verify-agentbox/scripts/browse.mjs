#!/usr/bin/env node
// THE BREAKER'S HANDS: ONE SHORT COMMAND PER THING A PERSON DOES IN THE TAB.
//
//   node browse.mjs open                 a headless Chrome on the live copy (once)
//   node browse.mjs look                 what is on screen: text, and numbered things to press
//   node browse.mjs click <n>            press thing number n from the last look
//   node browse.mjs click "<words>"      press the first thing whose words start so
//   node browse.mjs type "<text>"        type into whatever has the cursor
//   node browse.mjs press <key> [meta] [shift] [ctrl] [alt]   one key: n, Enter, Escape, ArrowDown…
//   node browse.mjs shot <name>          a picture, saved beside the findings
//   node browse.mjs away <minutes>       step away (up to 9), then look at what changed
//   node browse.mjs reload | close
//
// Every command is logged to actions.jsonl beside the findings, with how long
// it took and any page errors, which is what a power test's report counts.
//
// A session of Claude Code is given this command and nothing else that can
// act, and told to break the app the way a person would. Every command
// connects to the same Chrome (its address is kept in the instance folder),
// does one thing, prints what changed, and lets go. The Chrome is a throwaway
// with its profile inside the instance folder: it is never the browser anybody
// is signed into, and `live.mjs down` stops it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, connect, freeProfile } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { readState, INSTANCE } = await import(path.join(here, 'live.mjs'));
const FILE = path.join(INSTANCE, 'browser.json');
const out = process.env.BREAKER_OUT || path.join(INSTANCE, 'breaker');
fs.mkdirSync(out, { recursive: true });

const [verb, ...args] = process.argv.slice(2);
const state = readState();
if (!state) { console.log('No live copy is running. (The run that started you should have started one.)'); process.exit(1); }
const saved = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };

const began = Date.now();
const pageErrors = [];
// The settle after an action and the time spent away are ours, not the app's slowness.
let waited = 0;
const logAction = (extra = {}) => {
  try {
    fs.appendFileSync(path.join(out, 'actions.jsonl'), `${JSON.stringify({ at: began, verb, args, ms: Date.now() - began - waited, errors: pageErrors, ...extra })}\n`);
  } catch { /* the log is never worth the action */ }
};
const AWAY_MAX = 9;
const awayMs = verb === 'away' ? Math.min(Math.max(Number(args[0]) || 1, 0.25), AWAY_MAX) * 60_000 : 0;
// A screen that stops answering is a finding, not a tester stuck for good.
setTimeout(() => {
  console.log('The app did not respond within 90 seconds. Note it, then try reload.');
  logAction({ timedOut: true });
  process.exit(1);
}, awayMs + 90_000).unref();

/** Number every thing a person could press or type into, and describe the screen. */
const LOOK = `(() => {
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
  document.querySelectorAll('[data-breaker-ref]').forEach((e) => e.removeAttribute('data-breaker-ref'));
  const things = [...document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [data-item], [data-item-id], [tabindex]:not([tabindex="-1"])')]
    .filter(seen).slice(0, 120);
  const list = things.map((el, i) => {
    el.setAttribute('data-breaker-ref', String(i + 1));
    const words = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
    const kind = el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '');
    return (i + 1) + '. ' + kind + ' "' + words + '"' + (document.activeElement === el ? '  <- cursor here' : '');
  });
  // A thread's newest messages are at its foot, so a long screen keeps its end as well as its start.
  const all = document.body.innerText.replace(/\\n{3,}/g, '\\n\\n');
  const max = 6000;
  const text = all.length <= max ? all
    : all.slice(0, 2000) + '\\n[' + (all.length - max) + ' characters in the middle left out]\\n' + all.slice(-(max - 2000));
  return 'SCREEN TEXT:\\n' + text + '\\n\\nTHINGS TO PRESS (' + list.length + '):\\n' + list.join('\\n');
})()`;

const running = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** The page loads before the app draws; a look straight after shows an empty screen. */
const drawn = (t) => t.until('document.querySelectorAll("button").length > 0', { ms: 15_000 }).catch(() => {});

/** A fresh headless Chrome on the copy, its address kept for the next command. */
async function launch() {
  fs.rmSync(FILE, { force: true });
  const profile = path.join(INSTANCE, 'chrome-profile');
  fs.mkdirSync(profile, { recursive: true });
  if (freeProfile(profile)) await new Promise((r) => setTimeout(r, 500));
  const { chrome, wsUrl } = await launchChrome({ profile, detached: true });
  const t = await connect(wsUrl);
  fs.writeFileSync(FILE, JSON.stringify({ wsUrl, targetId: t.targetId, pid: chrome.pid, url: state.url }));
  await t.goto(state.url);
  await t.evaluate(catchErrors);
  await drawn(t);
  return t;
}

async function tab() {
  const b = saved();
  if (!b) { console.log('No browser yet. Run: browse.mjs open'); process.exit(1); }
  // The browser is the tester's, not the app's: if it went, open it again rather than fail every command after.
  // A pid that answers can still be a dead Chrome nobody reaped, so the connection decides.
  const t = running(b.pid) ? await connect(b.wsUrl, { targetId: b.targetId }).catch(() => null) : null;
  if (!t) {
    console.log('(The browser had closed, so it was opened on the app again.)');
    return launch();
  }
  // A restart (a power test's, or live.mjs restart) gives the copy a new address.
  if (b.url && b.url !== state.url) {
    await t.goto(state.url);
    await drawn(t);
    fs.writeFileSync(FILE, JSON.stringify({ ...b, url: state.url }));
    console.log('(The app restarted since you last looked, and you opened it again.)');
  }
  return t;
}
const errorsSince = async (t) => {
  const errs = await t.evaluate('(window.__breakerErrors || []).splice(0)').catch(() => []);
  pageErrors.push(...errs);
  return errs;
};
const catchErrors = `window.__breakerErrors = window.__breakerErrors || [];
  if (!window.__breakerHooked) { window.__breakerHooked = true;
    addEventListener('error', (e) => __breakerErrors.push('error: ' + e.message));
    addEventListener('unhandledrejection', (e) => __breakerErrors.push('rejection: ' + (e.reason && e.reason.message || e.reason))); }`;

async function report(t, what) {
  await t.wait(600);
  waited += 600;
  await t.evaluate(catchErrors).catch(() => {});
  const errs = await errorsSince(t);
  console.log(`${what}${errs.length ? `\nPAGE ERRORS: ${errs.join(' | ')}` : ''}`);
}

if (verb === 'open') {
  const was = saved();
  if (was && running(was.pid)) { console.log('Already open. Use: look'); process.exit(0); }
  const t = await launch();
  console.log(await t.evaluate(LOOK));
  t.detach();
} else if (verb === 'look') {
  const t = await tab();
  await t.evaluate(catchErrors).catch(() => {});
  console.log(await t.evaluate(LOOK));
  const errs = await errorsSince(t);
  if (errs.length) console.log(`\nPAGE ERRORS: ${errs.join(' | ')}`);
  t.detach();
} else if (verb === 'click') {
  const t = await tab();
  const which = args.join(' ');
  const hit = await t.evaluate(`(() => {
    const w = ${JSON.stringify(which)};
    const el = /^\\d+$/.test(w) ? document.querySelector('[data-breaker-ref="' + w + '"]')
      : [...document.querySelectorAll('[data-breaker-ref]')].find((e) => (e.getAttribute('aria-label') || e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(w.toLowerCase()));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    el.click();
    if (el.matches('input, textarea, select, [contenteditable]')) el.focus();
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  })()`);
  await report(t, hit === null ? `Nothing numbered or named "${which}" on screen. Run look again.` : `Pressed "${hit}".`);
  t.detach();
} else if (verb === 'type') {
  const t = await tab();
  await t.type(args.join(' '));
  await report(t, `Typed ${args.join(' ').length} characters into ${await t.evaluate('document.activeElement ? document.activeElement.tagName.toLowerCase() : "nothing"')}.`);
  t.detach();
} else if (verb === 'press') {
  const t = await tab();
  const [key, ...mods] = args;
  await t.press(key, mods.filter((m) => ['meta', 'shift', 'ctrl', 'alt'].includes(m)));
  await report(t, `Pressed ${[...mods, key].join('+')}.`);
  t.detach();
} else if (verb === 'shot') {
  const t = await tab();
  const name = String(args[0] ?? `shot-${Date.now()}`).replace(/[^\w.-]+/g, '-');
  const file = path.join(out, name.endsWith('.png') ? name : `${name}.png`);
  await t.capture(file);
  console.log(`Saved ${file}`);
  t.detach();
} else if (verb === 'reload') {
  const t = await tab();
  await t.goto(state.url);
  await drawn(t);
  await report(t, 'Reloaded.');
  t.detach();
} else if (verb === 'away') {
  await new Promise((r) => setTimeout(r, awayMs));
  waited += awayMs;
  const t = await tab();
  await t.evaluate(catchErrors).catch(() => {});
  console.log(`You were away ${Math.round(awayMs / 6000) / 10} minutes. Now on screen:\n${await t.evaluate(LOOK)}`);
  const errs = await errorsSince(t);
  if (errs.length) console.log(`\nPAGE ERRORS: ${errs.join(' | ')}`);
  t.detach();
} else if (verb === 'close') {
  const b = saved();
  if (b?.pid) { try { process.kill(b.pid, 'SIGTERM'); } catch { /* gone */ } }
  try { fs.rmSync(FILE); } catch { /* none */ }
  console.log('Closed.');
} else {
  console.log('usage: browse.mjs open | look | click <n|words> | type "<text>" | press <key> [meta shift ctrl alt] | shot <name> | away <minutes> | reload | close');
  process.exit(2);
}
logAction();
process.exit(0);
