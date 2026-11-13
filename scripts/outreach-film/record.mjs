// Films the app for one company, keyed to the words of her voice. Every move is
// the real app answering a real click or key. The pointer is drawn (a headless
// browser has none) and moves the way a hand does.
//
// The page runs SLOW times slower than life so a busy machine still draws every
// moment, and each captured frame is kept with the moment it shows. Slowing the
// page also stretches a redraw that lasts a few milliseconds in life (the inbox
// list drawn once between two threads) onto whole frames. So every jump from
// one screen to another goes through `cut()`: the camera holds the last frame
// until the app has stopped redrawing, then a fresh frame is forced and checked.
//
// usage: node record.mjs <film.json> <cues.json> <out.mp4> <end s> --dist <app build> --kit <kit dir>
// writes <out.mp4> (2880x1620) and <out.mp4>.json: each frame's moment, every
// beat, click and key (for the sounds), the camera's targets, and every cut.
// Exits 1 when anything it meant to do did not happen.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { buildWorld } from './lib/world.mjs';
import { openStage } from './lib/stage.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const [filmPath, cuesPath, out, END] = args;
const DIST = flag('--dist'), KIT = flag('--kit');
if (!DIST || !KIT) throw new Error('usage: record.mjs <film.json> <cues.json> <out.mp4> <end> --dist <app build> --kit <kit dir>');
const film = JSON.parse(fs.readFileSync(filmPath, 'utf8'));
const A = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
const T0 = 0, T1 = Number(END ?? A.end);
const SLOW = Number(process.env.SLOW ?? 5);
const W = 1440, H = 810;
const failures = [];
const fail = (what) => { failures.push(what); log('FAIL', what); };
let wall0 = Date.now();
const now = () => T0 + (Date.now() - wall0) / 1000 / SLOW;
const st = await openStage({
  dist: DIST, seed: buildWorld(film), slow: SLOW, dsf: 2,
  extra: {
    '/pics/headlines.png': film.headlinesFile, '/pics/logo.svg': film.company.logoFile, '/pics/site.png': film.company.siteFile,
    '/pics/chrome.png': `${KIT}/icons/chrome.png`, '/pics/agentbox.png': `${KIT}/icons/agentbox.png`, '/pics/terminal.png': `${KIT}/icons/terminal.png`, '/pics/finder.png': `${KIT}/icons/finder.png`,
  },
});
const { page, cdp } = st;
// The threads the film acts on, by the role each plays in her words.
const role = (k) => { const t = [...film.needsYou, ...film.running].find((x) => x.key === k); if (!t) throw new Error(`film has no ${k} thread`); return t; };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const head = (x, n = 5) => '^' + esc(x.split(' ').slice(0, n).join(' '));
const BUG = role('bug'), MIG = role('migration'), MAYA = role('maya'), JORDAN = role('jordan'), CLOUD = role('cloud');
const reply = MAYA.reply, slip = Math.max(3, Math.round(reply.length * 0.7));
const R = { bug: head(BUG.title), bugSummary: head(BUG.summary, 4), maya: head(MAYA.title), jordan: head(JORDAN.title, 4), cloud: head(CLOUD.title) };
if (SLOW !== 1) await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW)); // ms of film time
function log(...a) { console.log(`[${now().toFixed(2)}]`, ...a); }

// Maya's thread, as her app shares it, and the migration's change.
const change = film.change ?? JSON.parse(fs.readFileSync(film.changeFile, 'utf8'));
await page.evaluate((c) => {
  const t = Date.now();
  window.__DEMO__.work = { 'w-maya-0': [
    { id: 'w-maya-0', ts: t - 40 * 60_000, source: 'founder', by: 'maya', patch: { title: c.maya.title, body: c.maya.body } },
    { id: 'w-maya-0', ts: t - 4 * 60_000, source: 'agent', patch: { result: `**${c.maya.ask}**\n\n${c.maya.context.join('\n\n')}` } },
  ] };
  const it = window.__DEMO__.state.items.find((i) => i.title === c.mig);
  window.__DEMO__.changes[`runs/${it.id}/the-change-it-made.change`] = c.change;
  // Their logo where the workspace mark goes.
  const css = document.createElement('style');
  css.textContent = `.th-mark{font-size:0 !important;color:transparent !important;background:url(/pics/logo.svg) center/contain no-repeat !important;}
  .th-me{display:none !important}
  .th-new,.th-disp{background:color-mix(in srgb, var(--surface) 70%, transparent) !important;backdrop-filter:blur(10px) saturate(1.2)}
  .film-nocaret{caret-color:transparent !important}
  #film-caret{position:fixed;width:2px;z-index:2147483645;pointer-events:none;display:none;border-radius:1px;animation:film-blink 1.06s steps(1,end) infinite}
  #film-caret.solid{animation:none}
  @keyframes film-blink{0%{opacity:1}50%{opacity:0}}
  #film-poke{position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483646;pointer-events:none;opacity:.02}
  .th-disp.faces .th-faces{display:none !important}
  .th-disp.faces{width:32px !important;padding:0 !important;justify-content:center !important;gap:0 !important}
  #film-site{position:fixed;inset:0;z-index:2147483600;background:#fff;overflow:hidden}
  #film-site img{width:100%;display:block}
  #film-switcher{position:fixed;left:50%;top:50%;z-index:2147483640;transform:translate(-50%,-50%);display:none;pointer-events:none;padding:14px 12px 36px;box-sizing:border-box;border-radius:32px;
    background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.06)) ,rgba(48,48,52,.34);backdrop-filter:blur(26px) saturate(1.8) brightness(.95);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 0 0 1px rgba(255,255,255,.22),inset 0 -1px 0 rgba(255,255,255,.08),0 0 0 .5px rgba(0,0,0,.35),0 24px 60px rgba(0,0,0,.32)}
  #film-switcher.on{display:block}
  #film-switcher .row{display:flex;gap:4px}
  #film-switcher .app{width:112px;height:112px;position:relative;display:grid;place-items:center}
  #film-switcher .app.on::before{content:'';position:absolute;inset:4px;border-radius:24px;background:rgba(255,255,255,.2);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3)}
  #film-switcher .app img{position:relative;width:100px;height:100px}
  #film-switcher .name{position:absolute;bottom:12px;transform:translateX(-50%);font:500 13px/1 'SF Pro Text';color:rgba(255,255,255,.9);white-space:nowrap}`;
  document.head.appendChild(css);
  const site = document.createElement('div');
  site.id = 'film-site';
  site.innerHTML = '<img src="/pics/site.png" alt="">';
  document.documentElement.appendChild(site);
  const hud = document.createElement('div');
  hud.id = 'film-switcher';
  hud.innerHTML = '<div class="row">' + ['chrome', 'terminal', 'agentbox', 'finder'].map((a) => `<div class="app"><img src="/pics/${a}.png" alt=""></div>`).join('') + '</div><div class="name"></div>';
  document.documentElement.appendChild(hud);
  // When the app last redrew, not counting the film's own pointer, caret and switcher.
  window.__lastRedraw = performance.now();
  new MutationObserver((ms) => {
    if (ms.some((m) => { const n = m.target.nodeType === 1 ? m.target : m.target.parentElement; return n && !n.closest('[id^="film-"]'); })) window.__lastRedraw = performance.now();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  // A screen that has stopped changing sends no frames, so after a cut a
  // 1px mark flickers for a moment and the camera sees the new screen at once.
  const poke = document.createElement('div');
  poke.id = 'film-poke';
  document.documentElement.appendChild(poke);
  window.__poke = (ms) => { const until = performance.now() + ms; let k = 0; const step = () => { poke.style.background = k++ % 2 ? '#000' : '#010101'; if (performance.now() < until) requestAnimationFrame(step); }; requestAnimationFrame(step); };
}, { change, maya: MAYA, mig: MIG.title });

// The pointer, and how a hand moves it.
const POINTER = fs.readFileSync(`${KIT}/pointer.svg`, 'utf8');
await page.evaluate(([svg, seed]) => {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const U = (lo, hi) => lo + (hi - lo) * rnd();
  const el = document.createElement('div');
  el.id = 'film-pointer';
  el.innerHTML = svg;
  Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '29px', height: '29px', zIndex: '2147483647', pointerEvents: 'none', transformOrigin: '9px 4px', transition: 'scale 70ms ease-out' });
  el.querySelector('svg').setAttribute('width', '29'); el.querySelector('svg').setAttribute('height', '29');
  document.documentElement.appendChild(el);
  const place = (x, y) => { el.style.translate = `${x - 8.9}px ${y - 4.0}px`; };
  window.__ptr = { x: 980, y: 520 };
  place(980, 520);
  window.__rnd = rnd;
  let busy = 0, lastMove = performance.now(), nextIdle = U(2000, 4000);
  // One stroke along a slightly bent path that wobbles a little, quick to
  // start and slow to land, its speed never quite even.
  const stroke = (x, y, dur) => new Promise((res) => {
    const fx = window.__ptr.x, fy = window.__ptr.y;
    const dx = x - fx, dy = y - fy, d = Math.hypot(dx, dy) || 1;
    const bend = d * U(0.03, 0.08) * (rnd() < 0.5 ? -1 : 1);
    const nx = -dy / d, ny = dx / d;
    const c1 = { x: fx + dx * 0.3 + nx * bend, y: fy + dy * 0.3 + ny * bend };
    const c2 = { x: fx + dx * 0.72 + nx * bend * 0.45, y: fy + dy * 0.72 + ny * bend * 0.45 };
    const wob = Math.min(6, d * U(0.006, 0.014)), wf = U(1.2, 2.4), wp = U(0, 6.28);
    const jf = U(5, 9), jp = U(0, 6.28), ja = U(0.015, 0.03);
    const t0 = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / (dur * 1000));
      let v = Math.pow(u, 0.78);
      v = Math.min(1, Math.max(0, v + ja * Math.sin(jf * u * 6.28 + jp) * Math.sin(Math.PI * u)));
      const k = v * v * v * (10 - 15 * v + 6 * v * v);
      const m = 1 - k;
      const w = wob * Math.sin(wf * 6.28 * k + wp) * Math.sin(Math.PI * k);
      const px = m * m * m * fx + 3 * m * m * k * c1.x + 3 * m * k * k * c2.x + k * k * k * x + nx * w;
      const py = m * m * m * fy + 3 * m * m * k * c1.y + 3 * m * k * k * c2.y + k * k * k * y + ny * w;
      window.__ptr = { x: px, y: py };
      place(px, py);
      if (u < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__human = async (x, y, opt = {}) => {
    busy += 1;
    const fx = window.__ptr.x, fy = window.__ptr.y, d = Math.hypot(x - fx, y - fy);
    const dur = (opt.dur ?? (0.24 + 0.13 * Math.log2(1 + d / 30))) * U(0.9, 1.15);
    const ex = U(-1.5, 1.5), ey = U(-1.2, 1.2);
    if (d > 90 && !opt.dur) {
      // The main movement stops a little short or long and off to one side,
      // then a small correction after a moment, as a hand does.
      const ux = (x - fx) / d, uy = (y - fy) / d, f = rnd() < 0.7 ? U(0.9, 0.97) : U(1.02, 1.05);
      const side = d * U(-0.025, 0.025);
      await stroke(fx + (x - fx) * f - uy * side, fy + (y - fy) * f + ux * side, dur * 0.88);
      await pause(U(50, 140));
      await stroke(x + ex, y + ey, U(0.17, 0.27));
    } else {
      await stroke(x + ex, y + ey, dur);
    }
    lastMove = performance.now(); nextIdle = U(2200, 5200);
    busy -= 1;
  };
  // A resting hand still drifts a little.
  const idle = () => {
    if (!busy && window.__idleOn !== false && performance.now() - lastMove > nextIdle) {
      busy += 1;
      const r = U(2, 7), a = U(0, Math.PI * 2);
      stroke(window.__ptr.x + Math.cos(a) * r, window.__ptr.y + Math.sin(a) * r * 0.7, U(0.3, 0.55)).then(() => { busy -= 1; lastMove = performance.now(); nextIdle = U(2600, 5600); });
    }
    requestAnimationFrame(idle);
  };
  requestAnimationFrame(idle);
  const scrollerAt = (x, y) => {
    let n = document.elementFromPoint(x, y);
    while (n && !(n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
    return n;
  };
  // A trackpad flick: fast at first, then coasting to a stop.
  const flickOn = (n, dy, dur) => new Promise((res) => {
    const from = n.scrollTop, t0 = performance.now(), tau = 0.2, T = dur;
    const total = 1 - Math.exp(-T / tau);
    const step = () => {
      const t = Math.min(T, (performance.now() - t0) / 1000);
      n.scrollTop = from + dy * (1 - Math.exp(-t / tau)) / total;
      if (t < T) requestAnimationFrame(step); else res(true);
    };
    requestAnimationFrame(step);
  });
  window.__flick = (dy, dur = 0.9) => { const n = scrollerAt(window.__ptr.x, window.__ptr.y); return n ? flickOn(n, dy, dur) : Promise.resolve(false); };
  // The smallest visible element whose own text matches.
  window.__find = (src, flags, minX = 0, maxX = 1e9) => {
    const re = new RegExp(src, flags);
    let best = null;
    const seen = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const n = t.parentElement;
      if (!n || seen.has(n)) continue;
      seen.add(n);
      for (const el of [n, n.parentElement]) {
        if (!el) continue;
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 400 || !re.test(text)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < minX || r.left > maxX) continue;
        const area = r.width * r.height;
        if (!best || area < best.area) best = { area, l: r.left, t: r.top, w: r.width, h: r.height };
        break;
      }
    }
    return best;
  };
  window.__rect = (css) => { const n = document.querySelector(css); if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
  window.__union = (rs) => { const ok = rs.filter(Boolean); if (!ok.length) return null; const l = Math.min(...ok.map((r) => r.l)), t = Math.min(...ok.map((r) => r.t)); return { l, t, w: Math.max(...ok.map((r) => r.l + r.w)) - l, h: Math.max(...ok.map((r) => r.t + r.h)) - t }; };
}, [POINTER, 20261109]);

// The text cursor. The browser's own blinks on the real clock, which the
// slowed film plays five times too fast; this one blinks on the film's clock
// (a CSS animation the playback rate slows) and stays solid while typing.
await page.evaluate(() => {
  const c = document.createElement('div');
  c.id = 'film-caret';
  document.documentElement.appendChild(c);
  const typed = () => { c.classList.add('solid'); clearTimeout(c._t); c._t = setTimeout(() => { c.classList.remove('solid'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }, 500); };
  addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return;
    if (!el.dataset.filmCaret) { const cc = getComputedStyle(el).caretColor; el.dataset.filmCaret = cc && cc !== 'auto' && cc !== 'rgba(0, 0, 0, 0)' ? cc : getComputedStyle(el).color; }
    el.classList.add('film-nocaret');
  }, true);
  addEventListener('input', typed, true);
  addEventListener('keydown', typed, true);
  const props = ['boxSizing', 'width', 'height', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'];
  const mirror = document.createElement('div');
  mirror.id = 'film-mirror';
  Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', overflow: 'hidden', top: '0', left: '0', pointerEvents: 'none' });
  document.documentElement.appendChild(mirror);
  const place = () => {
    const el = document.activeElement;
    const ok = (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && el.offsetParent && el.selectionEnd != null;
    if (!ok) { c.style.display = 'none'; requestAnimationFrame(place); return; }
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    for (const k of props) mirror.style[k] = cs[k];
    mirror.style.whiteSpace = el instanceof HTMLInputElement ? 'pre' : 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.left = `${r.left}px`; mirror.style.top = `${r.top}px`;
    mirror.textContent = el.value.slice(0, el.selectionEnd);
    const mark = document.createElement('span'); mark.textContent = '​'; mirror.appendChild(mark);
    const m = mark.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize) || 14;
    const h = Math.round(fs * 1.25);
    c.style.height = `${h}px`;
    c.style.left = `${m.left - el.scrollLeft}px`;
    c.style.top = `${m.top - el.scrollTop + (m.height - h) / 2}px`;
    c.style.background = el.dataset.filmCaret || cs.color;
    c.style.display = 'block';
    requestAnimationFrame(place);
  };
  requestAnimationFrame(place);
});

// ---- what the film logs, besides frames ----
const events = []; // { t, kind: 'click'|'key', soft? }
const camera = []; // { t, rect: [l,t,w,h] css px | null, scale?, dur }
const cuts = [];   // { t, what, held }: moments the screen must change
let cur = { x: 980, y: 520 };
await page.mouse.move(cur.x, cur.y);

let following = true, held = false, lastReal = { ...cur };
async function follow() {
  while (following) {
    if (!held) {
      const q = await page.evaluate(() => window.__ptr).catch(() => null);
      if (q && Math.hypot(q.x - lastReal.x, q.y - lastReal.y) > 0.4) { lastReal = q; await page.mouse.move(q.x, q.y).catch(() => {}); }
    }
    await new Promise((r) => setTimeout(r, 35));
  }
}
async function move(x, y, { dur, real = true } = {}) {
  await page.evaluate(([a, b, d]) => window.__human(a, b, d == null ? {} : { dur: d }), [x, y, dur ?? null]);
  cur = { x, y };
  if (!real) return;
  const q = await page.evaluate(() => window.__ptr);
  lastReal = q; await page.mouse.move(q.x, q.y);
}
async function rectOf(target, opts = {}) {
  if (!target) return null;
  if (typeof target === 'object') return target;
  if (target.startsWith('css:')) return page.evaluate((c) => window.__rect(c), target.slice(4));
  return page.evaluate(([s, f, a, z]) => window.__find(s, f, a, z), [target, opts.flags ?? 'i', opts.minX ?? 0, opts.maxX ?? 1e9]);
}
const centerOf = (r, dx = 0.5, dy = 0.5) => ({ x: r.l + r.w * dx, y: r.t + r.h * dy });
async function to(target, opts = {}) {
  const r = await rectOf(target, opts);
  if (!r) { fail(`not found: ${target}`); return null; }
  // A hand lands somewhere on a target, not dead centre.
  const c = centerOf(r, opts.dx ?? (0.3 + 0.35 * Math.random()), opts.dy ?? 0.5);
  await move(c.x, c.y, opts);
  return r;
}
async function click() {
  held = true;
  events.push({ t: +now().toFixed(3), kind: 'click' });
  await page.mouse.down(); await sleep(75 + Math.random() * 30); await page.mouse.up();
  held = false;
}
async function key(k) {
  events.push({ t: +now().toFixed(3), kind: 'key' });
  await page.keyboard.press(k);
}

// ---- the camera ----
const times = [];
const beats = [];
const enc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=2880:1620:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-r', '30', out], { stdio: ['pipe', 'inherit', 'inherit'] });
let rolling = false, holding = false;
const ACK_MS = Number(process.env.ACK_MS ?? 60);
cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
  const ack = () => setTimeout(() => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}), ACK_MS);
  if (!rolling || holding) { ack(); return; }
  const at = metadata?.timestamp ? metadata.timestamp * 1000 : Date.now();
  times.push(+(T0 + (at - wall0) / 1000 / SLOW).toFixed(4));
  if (enc.stdin.write(Buffer.from(data, 'base64'))) ack(); else enc.stdin.once('drain', ack);
});

// A cut: hold the camera on the last frame, do the thing, wait until the app
// has not redrawn for `quiet` ms (and, if given, `ready` holds), then let the
// camera see again and make sure it does.
async function cut(what, act, { quiet = 140, most = 1200, ready = null } = {}) {
  holding = true;
  const t0 = now();
  let ok = true;
  try { ok = (await act()) !== false; } catch (e) { fail(`${what}: ${e.message}`); ok = false; }
  for (;;) {
    const s = await page.evaluate(([r]) => ({ q: performance.now() - window.__lastRedraw, r: r ? !!window.__find(r, 'i') : true }), [ready]).catch(() => ({ q: 0, r: false }));
    if (s.q >= quiet && s.r) break;
    if ((now() - t0) * 1000 > most) { if (ready && !s.r) fail(`${what}: never showed ${ready}`); else log('still redrawing after', what); break; }
    await new Promise((r) => setTimeout(r, 15));
  }
  const n = times.length;
  holding = false;
  await page.evaluate(() => window.__poke(160)).catch(() => {});
  const released = now();
  await sleep(90);
  if (times.length === n) fail(`no frame after ${what}`);
  cuts.push({ t: +released.toFixed(3), what, held: +(released - t0).toFixed(3) });
  return ok;
}
// Move to it, wait for the moment, look again (things slide in), and press,
// with the press as a cut.
async function go(what, target, opts = {}, cutOpts = {}) {
  const r0 = await to(target, opts);
  if (!r0) return false;
  await sleep(90 + Math.random() * 120);
  const r = await rectOf(target, opts);
  if (r) { const c = centerOf(r, 0.5, 0.5); if (Math.abs(c.x - cur.x) > r.w / 2 - 2 || Math.abs(c.y - cur.y) > r.h / 2 - 2) await move(c.x, c.y, { dur: 0.16 }); }
  return cut(what, click, cutOpts);
}
// Home sits on the side rail, which opens when the mouse rests on it for
// 140 ms; the slowed film always rests that long, a hand on a Mac does not.
// So only the drawn pointer goes there, and the press is the button's own click.
async function goHome(what, then) {
  held = true;
  const ok = await to('css:button[aria-label="Home"]', { real: false });
  await sleep(90 + Math.random() * 80);
  await cut(what, async () => {
    if (!ok) return false;
    events.push({ t: +now().toFixed(3), kind: 'click' });
    return page.evaluate(() => { const b = document.querySelector('button[aria-label="Home"]'); b?.click(); return !!b; });
  });
  await move(then.x, then.y, { real: false });
  lastReal = { x: -1, y: -1 };
  held = false;
}
async function press(target, opts = {}) {
  const r0 = await to(target, opts);
  if (!r0) return false;
  await sleep(90 + Math.random() * 120);
  const r = await rectOf(target, opts);
  if (r) { const c = centerOf(r, 0.5, 0.5); if (Math.abs(c.x - cur.x) > r.w / 2 - 2 || Math.abs(c.y - cur.y) > r.h / 2 - 2) await move(c.x, c.y, { dur: 0.16 }); }
  await click();
  return true;
}
async function typeText(text, by = null) {
  const gaps = [...text].map((ch) => {
    let d = 70 + Math.random() * 110;
    if (ch === ' ') d += 80 + Math.random() * 150;
    if (Math.random() < 0.07) d += 160 + Math.random() * 220;
    return d;
  });
  let k = 1;
  if (by != null) { const room = (by - now()) * 1000, need = gaps.reduce((a, b) => a + b, 0); if (need > room) k = Math.max(0.6, room / need); }
  for (const [i, ch] of [...text].entries()) {
    events.push({ t: +now().toFixed(3), kind: 'key', soft: true });
    await page.keyboard.type(ch);
    await sleep(gaps[i] * k);
  }
}
async function backspace(n = 1) {
  for (let k = 0; k < n; k += 1) { events.push({ t: +now().toFixed(3), kind: 'key', soft: true }); await page.keyboard.press('Backspace'); await sleep(90 + Math.random() * 60); }
}
async function zoom(targets, { scale = null, dur = 0.75, pad = 18, opts = {} } = {}) {
  const list = Array.isArray(targets) ? targets : [targets];
  const rs = []; for (const t of list) rs.push(await rectOf(t, opts));
  const r = await page.evaluate((x) => window.__union(x), rs);
  if (!r) { fail(`zoom target not found: ${JSON.stringify(list)}`); return; }
  camera.push({ t: +now().toFixed(3), rect: [r.l - pad, r.t - pad, r.w + 2 * pad, r.h + 2 * pad], scale, dur });
}
function unzoom(dur = 0.7) { camera.push({ t: +now().toFixed(3), rect: null, dur }); }
const state = (fn) => page.evaluate((f) => { const s = window.__DEMO__.state; new Function('s', f)(s); window.__demoNotify(); }, fn);

// Before the camera rolls: Agentbox on Home behind their site, the pointer
// resting, and Maya's thread held back until she gets stuck.
await page.getByRole('button', { name: 'Home', exact: true }).first().click().catch(() => {});
await sleep(800);
await page.evaluate((title) => { const s = window.__DEMO__.state; const i = s.items.findIndex((x) => x.title === title); if (i >= 0) window.__mayaHeld = s.items.splice(i, 1)[0]; window.__demoNotify(); window.__idleOn = true; }, MAYA.title);

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 2880, maxHeight: 1620, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, 500));
wall0 = Date.now();
rolling = true;
await page.evaluate(() => window.__human(window.__ptr.x + 2, window.__ptr.y + 1, { dur: 0.1 }));
const follower = follow();
async function at(t) {
  if (t > T1 + 0.001) throw new Error(`stopped at ${T1}`);
  const wait = (t - now()) * 1000 * SLOW;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  else if (wait < -250 * SLOW) log('late by', (-wait / 1000 / SLOW).toFixed(2));
  beats.push([+t.toFixed(3), +now().toFixed(4)]);
}

// ---- the film, keyed to her words ----
const main = { minX: 120 };
const inboxTab = { minX: 120, maxX: 500 };
// A thread's breadcrumb back to the list: "Needs you" or "In progress" until
// November 2026, "Inbox" since.
const BACK = '^(Needs you|In progress|Inbox)$';
try {
  // Their site in Chrome while she says hello. The hand rests.
  // ⌘-Tab: hold ⌘, Tab past Terminal to Agentbox, let go. Agentbox is on Home.
  await at(A.agentbox_is - 1.35);
  events.push({ t: +now().toFixed(3), kind: 'key' });
  await sleep(110);
  events.push({ t: +now().toFixed(3), kind: 'key' });
  const pick = (k) => page.evaluate((i) => { const h = document.getElementById('film-switcher'); h.classList.add('on'); const cells = [...h.querySelectorAll('.app')]; cells.forEach((c, j) => c.classList.toggle('on', j === i)); const n = h.querySelector('.name'); n.textContent = ['Google Chrome', 'Terminal', 'Agentbox', 'Finder'][i]; const ir = cells[i].querySelector('img').getBoundingClientRect(), hr = h.getBoundingClientRect(); n.style.transform = 'none'; const nr = n.getBoundingClientRect(); n.style.left = `${ir.left + ir.width / 2 - hr.left - h.clientLeft - nr.width / 2}px`; }, k);
  await sleep(90); await pick(1);
  await sleep(330); events.push({ t: +now().toFixed(3), kind: 'key' }); await pick(2);
  await sleep(480);
  await cut('switch to Agentbox', () => page.evaluate(() => { document.getElementById('film-switcher').classList.remove('on'); document.getElementById('film-site').remove(); }), { quiet: 0 });
  // "this is your homepage, and you can see what everyone on your team is working on"
  await at(A.homepage + 0.2); await to('^Open Team', main);
  await at(A.everyone - 0.05); await go('open Team', '^Open Team', main);
  await at(A.everyone + 1.3); page.evaluate(() => window.__flick(320, 1.0)).catch(() => {});
  // "And this is your inbox": back to Home, then into the inbox
  await at(A.inbox - 3.6); await goHome('back to Home', { x: 760, y: 330 });
  await at(A.inbox - 1.0); await go('open the inbox', '^Inbox\\s*\\d+$', { minX: 400 });
  await at(A.most_important - 0.7); await to('^Urgent$', main);
  // "every agent runs on the Claude Code and Codex plan you already have"
  await at(A.importantly); await press('^New thread$', main);
  await at((A.claude_code ?? A.codex - 0.75) - 0.3); await press('^Claude Code$', main);
  await sleep(250); await zoom(['^Codex$', '^Claude Code$', '^People$'], { opts: main, scale: 1.4, pad: 50 });
  await at(A.codex + 0.5); await to('^Codex$', main);
  await at(A.inference); unzoom(0.6); await key('Escape'); await sleep(280); await key('Escape');
  // "let me walk you through a few threads here"
  await at(A.walk - 0.1); await to(R.bug, main);
  await at(A.bug - 0.8); await go('open the bug fix', R.bug, main);
  // "the summary tells me exactly what changed, so I just hit one"
  await at(A.summary - 0.4); await to(R.bugSummary, main);
  await at(A.hit_one + 0.2); await cut('answer the bug fix with 1', () => key('1'));
  // "this one wants to run a migration, and I see what it's about": its code, beside the chat
  await at(A.migration - 0.3); await go('show the migration code', 'css:button[aria-label="View code changes"]');
  await at(A.say_yes + 0.15); await cut('answer the migration with 1', () => key('1'));
  // "three new headlines for your homepage"
  await at(A.headlines - 0.6);
  { const r = await rectOf('css:img[alt^="Three headlines"]'); if (r) { await move(r.l + r.w * 0.2, r.t + r.h * 0.45); await sleep(150); await move(r.l + r.w * 0.8, r.t + r.h * 0.48); await at(A.pick - 1.2); await move(r.l + r.w * 0.5, r.t + r.h * 0.42); } else fail('not found: the headlines picture'); }
  await at(A.pick + 0.35); await cut('pick headline 2', () => key('2'));
  // "Each of those took me only a few seconds"
  await at(A.adds_up - 0.4); await go('back to Needs you', BACK, inboxTab);
  // "each thread gets access to its very own cloud computer"
  await at(A.cloud - 2.1); await go('open In progress', '^In progress\\s*\\d+$', main);
  await at(A.cloud - 0.7); await go('open the cloud thread', R.cloud, main);
  await sleep(400); await zoom([R.cloud, 'in the cloud$'], { opts: main, scale: 1.45, pad: 50 }); await to('in the cloud$', main);
  await at(A.as_many - 0.7); unzoom(0.6); await go('back to In progress', BACK, inboxTab);
  // "when someone on your team gets stuck": her thread lands in your inbox, with her note
  await at(A.stuck - 1.9); await page.evaluate((note) => { const s = window.__DEMO__.state; const m = window.__mayaHeld; if (m) { const t = Date.now(); m.createdAt = t - 3 * 60_000; m.updatedAt = t; m.waitingComments = [{ by: 'maya', ts: t, text: note }]; for (const k of Object.keys(m.wrote)) m.wrote[k].ts = k === 'title' || k === 'body' ? t - 3 * 60_000 : t; s.items.push(m); window.__demoNotify(); } }, MAYA.comment);
  await at(A.stuck - 1.2); await go('open Needs you', '^Needs you\\s*\\d+$', main);
  // The row shows her comment after her title ("Maya commented: ..." before November 2026).
  await sleep(300); if (!(await rectOf(`^(Maya commented: )?${esc(MAYA.comment)}$`, main))) fail("Maya's comment is not on her row");
  await at(A.open_their - 1.1); await go("open Maya's thread", R.maya, main);
  await sleep(260); await key('r'); await sleep(120);
  const typing = await page.evaluate(() => document.activeElement instanceof HTMLTextAreaElement) || await press('^Reply', main);
  if (typing) {
    await sleep(150); await typeText(reply.slice(0, slip) + (reply[slip] === 'o' ? 'i' : 'o'), A.messages - 1.6); await sleep(220); await backspace(1); await typeText(reply.slice(slip), A.messages - 0.85);
    const box = await page.evaluate(() => document.activeElement?.value ?? null);
    if (box !== reply) fail(`the reply box holds ${JSON.stringify(box)}, not ${JSON.stringify(reply)}`);
  } else fail('no reply box');
  // "their messages actually land in the same inbox as your agents": the hand
  // goes to Needs you while the reply waits, then ⌘↵ and the click are one
  // cut, so the app's stops between them (the inbox, the next thread) never show.
  await to(BACK, inboxTab);
  await at(A.messages - 0.45);
  await cut('send the reply and go to Needs you', async () => {
    await key('Meta+Enter'); await sleep(120);
    const r = await rectOf(BACK, inboxTab);
    if (!r) { fail('not found: Needs you, after sending the reply'); return false; }
    await move(r.l + r.w / 2, r.t + r.h / 2, { dur: 0.05 }); await click();
    return true;
  });
  await state(`const it = s.items.find((i) => i.title === ${JSON.stringify(JORDAN.title)}); it.waitingComments = [{ by: 'jordan', ts: Date.now(), text: ${JSON.stringify(JORDAN.comment)} }]; it.updatedAt = Date.now();`);
  await sleep(450); await zoom(['Jordan commented', R.jordan], { opts: main, scale: 1.35, pad: 50 }); await to('Jordan commented', main);
  // "So that's every agent you have from one inbox, ... dozens of threads": the board
  await at(A.thats_every - 0.3); unzoom(0.8);
  await at(A.dozens - 0.6); await cut('show the board', () => key('b')); await sleep(500); await move(980, 560);
  await at(A.free - 0.8); await goHome('back to Home at the end', { x: 1050, y: 600 });
  await at(T1);
} catch (e) { fail(`stopped: ${e.message}`); }

rolling = false; following = false; await follower;
await cdp.send('Page.stopScreencast').catch(() => {});
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
const errors = await page.evaluate(() => window.__ERR__ ?? null).catch(() => null);
if (errors) fail(`the app threw: ${errors}`);
fs.writeFileSync(`${out}.json`, JSON.stringify({ T0, T1, slow: SLOW, W, H, times, beats, events, camera, pills: [], cuts, failures }));
log('frames', times.length, 'cuts', cuts.length, 'clicks', events.filter((e) => e.kind === 'click').length, 'failures', failures.length);
await st.close();
process.exit(failures.length ? 1 : 0);
