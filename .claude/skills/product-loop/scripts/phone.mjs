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
    .filter(seen).filter((el, i, all) => !all.some((o) => o !== el && o.contains(el) && o.matches('[role="button"], button, a'))).slice(0, 80);
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

// A wrapped link's box spans two lines, and its middle can be the next link: aim at its first line, where a person taps.
export function targetScript(arg) {
  const n = Number(arg);
  const pick = Number.isInteger(n) && n > 0
    ? `document.querySelector('[data-phone-ref="${n}"]')`
    : `[...document.querySelectorAll('[data-phone-ref]')].find((el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase().startsWith(${JSON.stringify(String(arg).toLowerCase())}))`;
  return `(() => { const el = ${pick}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getClientRects()[0] || el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
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
      const at = await t.evaluate(targetScript(args.join(' ')));
      if (!at) { console.log(`Nothing to tap called ${args.join(' ')}. Look again.`); t.detach(); process.exit(1); }
      await touch(t, 'touchStart', at.x, at.y); await touch(t, 'touchEnd', at.x, at.y);
      await look(t); t.detach();
    } else if (verb === 'type') { const t = await tab(); await t.type(args.join(' ')); await look(t); t.detach(); }
    else if (verb === 'press') { const t = await tab(); await t.press(args[0]); await look(t); t.detach(); }
    else if (verb === 'swipe') {
      const t = await tab();
      const cx = IPHONE.width / 2; const cy = IPHONE.height / 2;
      const d = { up: [0, -300], down: [0, 300], left: [-250, 0], right: [250, 0] }[args[0]];
      if (!d) { console.log('swipe up, down, left or right.'); t.detach(); process.exit(2); }
      const from = [cx - d[0] / 2, cy - d[1] / 2];
      await touch(t, 'touchStart', ...from);
      for (let i = 1; i <= 8; i++) await touch(t, 'touchMove', from[0] + (d[0] * i) / 8, from[1] + (d[1] * i) / 8);
      await touch(t, 'touchEnd', from[0] + d[0], from[1] + d[1]);
      await look(t); t.detach();
    } else if (verb === 'shot') {
      const t = await tab();
      const name = `${String(args[0] || `phone-${Date.now()}`).replace(/[^\w.-]+/g, '-').replace(/\.png$/, '')}.png`;
      const { data } = await t.call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
      console.log(`Saved ${name}. Read it with the Read tool at ${path.join(out, name)}.`); t.detach();
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
