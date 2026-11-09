#!/usr/bin/env node
// A TESTER'S HANDS ON THE PHONE APP: ONE SHORT COMMAND PER THING A THUMB DOES.
//
//   phone open                     the app on an iPhone-sized screen (once)
//   phone look                     the screen's words, and numbered things to tap
//   phone tap <n> | tap "<words>"  tap thing n from the last look, or the first whose words start so
//   phone type "<text>"            type into whatever has the cursor
//   phone press <key>              Enter, Backspace, Escape…
//   phone swipe up|down|left|right one swipe across the middle of the screen
//   phone shot <name>              a picture, saved beside the diary
//   phone away <minutes>           put the phone down (up to 9), then look again
//   phone reload | close
//
// The page is the app's browser preview ($PHONE_URL), drawn at an iPhone's
// size with touch on, so a mouse press arrives as a finger. Each command
// connects to the same headless Chrome, does one thing and lets go; its
// address is kept in $PHONE_OUT/phone.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rerunWithStripTypes } from '../../../../scripts/lib/rerun-with-strip-types.mjs';

rerunWithStripTypes(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const { launchChrome, connect, freeProfile } = await import(path.resolve(here, '../../verify-agentbox/scripts/cdp.mjs'));

export const IPHONE = {
  width: 393, height: 852, scale: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const LOOK = `(() => {
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
  document.querySelectorAll('[data-phone-ref]').forEach((e) => e.removeAttribute('data-phone-ref'));
  const things = [...document.querySelectorAll('button, a[href], input, textarea, [role="button"], [role="tab"], [role="link"], [role="switch"], [role="checkbox"], [tabindex]:not([tabindex="-1"])')]
    .filter(seen).filter((el, i, all) => el.matches('[role="button"], button, a[href]') || !all.some((o) => o !== el && o.contains(el) && o.matches('[role="button"], button, a'))).slice(0, 80);
  const list = things.map((el, i) => {
    el.setAttribute('data-phone-ref', String(i + 1));
    const words = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    return (i + 1) + '. "' + words + '"' + (document.activeElement === el ? '  <- cursor here' : '');
  });
  const text = document.body.innerText.replace(/\\n{3,}/g, '\\n\\n').slice(0, 4000);
  return 'SCREEN:\\n' + text + '\\n\\nTHINGS TO TAP (' + list.length + '):\\n' + list.join('\\n');
})()`;

/** Where to press for thing `n`, or the first thing whose words start with `words`. */
/** EPERM is a live process this one may not signal, which is every process outside Codex's sandbox. */
export function isRunning(pid, kill = process.kill.bind(process)) {
  if (!pid) return false;
  try { kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}

/** Where a swipe starts and ends: up and down in the middle of the page's scrolling area, sized to it. */
export function swipeFrom(scroller, dir) {
  const cx = IPHONE.width / 2; const cy = IPHONE.height / 2;
  if ((dir === 'up' || dir === 'down') && scroller) {
    const x = scroller.left + scroller.width / 2; const mid = scroller.top + scroller.height / 2;
    const dist = Math.min(300, scroller.height * 0.6); const sign = dir === 'up' ? 1 : -1;
    return { from: [x, mid + (sign * dist) / 2], to: [x, mid - (sign * dist) / 2] };
  }
  const d = { up: [0, -300], down: [0, 300], left: [-250, 0], right: [250, 0] }[dir];
  return { from: [cx - d[0] / 2, cy - d[1] / 2], to: [cx + d[0] / 2, cy + d[1] / 2] };
}

// The biggest area on screen that scrolls up and down, or null.
const SCROLLER = `(() => { let best = null; for (const el of document.querySelectorAll('*')) {
  if (el.scrollHeight <= el.clientHeight + 4) continue; const s = getComputedStyle(el); if (!/(auto|scroll)/.test(s.overflowY)) continue;
  const r = el.getBoundingClientRect(); const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom); if (bottom - top < 60) continue;
  const area = (bottom - top) * r.width; if (!best || area > best.area) best = { area, left: r.left, top, width: r.width, height: bottom - top }; }
  return best; })()`;

// A wrapped link's box spans two lines, and its middle can be the next link: aim at its first line, where a person taps.
export function targetScript(arg) {
  const n = Number(arg);
  const pick = Number.isInteger(n) && n > 0
    ? `document.querySelector('[data-phone-ref="${n}"]')`
    : `[...document.querySelectorAll('[data-phone-ref]')].find((el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(${JSON.stringify(String(arg).toLowerCase())}))`;
  // A point of it something else covers is a tap on that something: try a few, and say so when all are covered.
  return `(() => { const el = ${pick}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getClientRects()[0] || el.getBoundingClientRect();
    const at = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]].map(([fx, fy]) => ({ x: r.left + r.width * fx, y: r.top + r.height * fy }));
    if (typeof document.elementFromPoint !== 'function') return at[0];
    return at.find((p) => { const hit = document.elementFromPoint(p.x, p.y); return hit && (hit === el || el.contains(hit)); }) || { covered: true }; })()`;
}

async function asPhone(t) {
  await t.call('Emulation.setDeviceMetricsOverride', { width: IPHONE.width, height: IPHONE.height, deviceScaleFactor: IPHONE.scale, mobile: true });
  await t.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await t.call('Emulation.setUserAgentOverride', { userAgent: IPHONE.userAgent, platform: 'iPhone' });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.env.PHONE_OUT;
  const url = process.env.PHONE_URL;
  if (!out || !url) { console.log('No phone test is running (PHONE_OUT and PHONE_URL are not set).'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  const FILE = path.join(out, 'phone.json');
  const [verb, ...args] = process.argv.slice(2);
  const awayMs = verb === 'away' ? Math.min(Math.max(Number(args[0]) || 1, 0.25), 9) * 60_000 : 0;
  setTimeout(() => { console.log('The phone did not respond within 90 seconds. Note it, then try reload.'); process.exit(1); }, awayMs + 90_000).unref();
  const saved = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };
  const log = (extra = {}) => fs.appendFileSync(path.join(out, 'actions.jsonl'), `${JSON.stringify({ at: Date.now(), verb, args, ...extra })}\n`);

  async function launch() {
    // Out of $PHONE_OUT, which may be a synced folder: a browser profile is tens of megabytes of nothing.
    const profile = path.join(os.tmpdir(), 'agentbox-phone-profiles', crypto.createHash('sha1').update(out).digest('hex').slice(0, 12));
    fs.mkdirSync(profile, { recursive: true });
    if (freeProfile(profile)) await new Promise((r) => setTimeout(r, 500));
    const { chrome, wsUrl } = await launchChrome({ profile, detached: true, width: IPHONE.width, height: IPHONE.height });
    const t = await connect(wsUrl, { width: IPHONE.width, height: IPHONE.height });
    await asPhone(t);
    fs.writeFileSync(FILE, JSON.stringify({ wsUrl, targetId: t.targetId, pid: chrome.pid }));
    await t.goto(url);
    await t.until('document.querySelectorAll("[role=button], button").length > 0', { ms: 15_000 }).catch(() => {});
    return t;
  }
  async function tab() {
    const b = saved();
    const t = b && isRunning(b.pid) ? await connect(b.wsUrl, { targetId: b.targetId, width: IPHONE.width, height: IPHONE.height }).catch(() => null) : null;
    if (!t) { if (b) console.log('(The phone had closed, so the app was opened again.)'); return launch(); }
    await asPhone(t);
    return t;
  }
  const look = async (t) => { await t.wait(700); console.log(await t.evaluate(LOOK)); };
  const touch = (t, type, x, y) => t.call('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  try {
    if (verb === 'open') { const t = await launch(); await look(t); t.detach(); }
    else if (verb === 'look') { const t = await tab(); await look(t); t.detach(); }
    else if (verb === 'tap') {
      const t = await tab();
      let at = await t.evaluate(targetScript(args.join(' ')));
      // Re-applying the phone's screen on connect can redraw the page and drop the last look's numbers.
      if (!at) { await t.evaluate(LOOK); at = await t.evaluate(targetScript(args.join(' '))); }
      if (!at) { console.log(`Nothing to tap called ${args.join(' ')}. Look again.`); t.detach(); process.exit(1); }
      if (at.covered) { console.log(`${args.join(' ')} is under something else on the screen. Close what covers it, then tap again.`); t.detach(); process.exit(1); }
      await touch(t, 'touchStart', at.x, at.y); await touch(t, 'touchEnd', at.x, at.y);
      await look(t); t.detach();
    } else if (verb === 'type') { const t = await tab(); await t.type(args.join(' ')); await look(t); t.detach(); }
    else if (verb === 'press') { const t = await tab(); await t.press(args[0]); await look(t); t.detach(); }
    else if (verb === 'swipe') {
      const t = await tab();
      if (!['up', 'down', 'left', 'right'].includes(args[0])) { console.log('swipe up, down, left or right.'); t.detach(); process.exit(2); }
      const { from, to } = swipeFrom(await t.evaluate(SCROLLER), args[0]);
      await touch(t, 'touchStart', ...from);
      for (let i = 1; i <= 8; i++) await touch(t, 'touchMove', from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
      await touch(t, 'touchEnd', ...to);
      await look(t); t.detach();
    } else if (verb === 'shot') {
      const t = await tab();
      const name = `${String(args[0] || `phone-${Date.now()}`).replace(/[^\w.-]+/g, '-').replace(/\.png$/, '')}.png`;
      const { data } = await t.call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
      console.log(`Saved ${name}. Open it at ${path.join(out, name)} to see the screen.`); t.detach();
    } else if (verb === 'away') {
      await new Promise((r) => setTimeout(r, awayMs));
      const t = await tab(); console.log(`You put the phone down for ${Math.round(awayMs / 60_000)} minutes.`); await look(t); t.detach();
    } else if (verb === 'reload') { const t = await tab(); await t.goto(url); await look(t); t.detach(); }
    else if (verb === 'close') { const b = saved(); if (b && isRunning(b.pid)) process.kill(b.pid); fs.rmSync(FILE, { force: true }); console.log('Closed.'); }
    else { console.log('usage: phone open | look | tap <n|"words"> | type "<text>" | press <key> | swipe up|down|left|right | shot <name> | away <minutes> | reload | close'); process.exit(2); }
    log();
    process.exit(0);
  } catch (err) {
    log({ error: err.message });
    console.log(`That did not work: ${err.message}`);
    process.exit(1);
  }
}
