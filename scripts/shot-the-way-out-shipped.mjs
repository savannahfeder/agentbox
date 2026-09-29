// THE WAY OUT AS IT SHIPS —.
//
// Nothing here is switchable any more: the app boots with no attribute set and
// this measures the plain rule.
//
// WHAT IT PROVES, and each of these was wrong at some point in this thread:
// the icon clear the header keeps the message's own left edge (`textOutOfLine`
// is 0) the icon is on the title's FIRST line, not above it (`onTitleLine`)
// nothing else the app draws is under it (`collides`, box against box, not
// text against text: an <svg> has no textContent and that is how the tab row
// first measured clean)
//
//   node scripts/shot-the-way-out-shipped.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldWorkItems } from '../shared/work-items.mjs';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { ACCOUNT_ROOT } from './lib/machine-paths.mjs';

const EXT = 'png|jpe?g|gif|webp|svg|html?|pdf|md|markdown|csv|txt|json|ya?ml|sql|sh|css|jsx?|tsx?|mjs|cjs|py|rb|go|rs|toml';
const PATH = new RegExp(String.raw`(?<![\w./:@-])(?:\./)?[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');
const LINK = new RegExp(String.raw`!?\[[^\]\n]*\]\(\s*([^)\s]+?)\s*(?:\s+"[^"]*")?\)`, 'g');
function referencedFiles(...texts) {
  const found = []; const seen = new Set();
  for (const text of texts) {
    if (!text) continue;
    const hits = [];
    for (const m of String(text).matchAll(LINK)) hits.push({ at: m.index ?? 0, path: m[1] });
    for (const m of String(text).matchAll(PATH)) hits.push({ at: m.index ?? 0, path: m[0] });
    hits.sort((a, b) => a.at - b.at);
    for (const hit of hits) {
      const p = hit.path.replace(/^\.\//, '').trim();
      if (!p || /^([a-z]+:|\/|#)/i.test(p)) continue;
      if (!new RegExp(String.raw`\.(?:${EXT})$`, 'i').test(p)) continue;
      if (seen.has(p.toLowerCase())) continue;
      seen.add(p.toLowerCase()); found.push(p);
    }
  }
  return found;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'shots-way-out');
const ACCOUNT = `${ACCOUNT_ROOT}`;
const SLUG = 'agentbox';
const ITEM = 'w-26b5bf5262';                                   // the card she was on
const DOC = 'designs/w-26b5bf5262/the-one-step-left.html';      // the file she clicked
// HER CARD AS IT STOOD WHEN SHE CLICKED, not as it stands now. Her message
// naming this file is stamped 1787363646468 in her own ledger, and the card has
// been written on twice since, so folding the whole file would open a card that
// names different files from the one she was looking at. Every word is still
// hers and still off her disk; this only stops the clock where she was.
const AT = 1787363646468;
fs.mkdirSync(outDir, { recursive: true });

/* ------------------------- her store, read-only --------------------------- */
const dir = path.join(ACCOUNT, SLUG);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
const product = { slug: SLUG, name: meta.name ?? SLUG, dir, oneLiner: meta.oneLiner ?? '', repoPath: meta.repoPath ?? null };
const lines = fs.readFileSync(path.join(dir, 'work-items.jsonl'), 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const folded = foldWorkItems(lines.filter((l) => Number(l.ts ?? 0) <= AT));
const item = { ...folded.get(ITEM), product: SLUG, productName: product.name };
if (!item.id) throw new Error(`${ITEM} is not in her ledger`);
console.log(`card: ${String(item.title).slice(0, 70)}`);

const asked = [...new Set([DOC, ...referencedFiles(item.body, item.result, item.note, item.answer)])];
const resolved = {};
for (const src of asked) {
  const r = resolveArtifact({ src, product: SLUG, products: [product], accountRoot: ACCOUNT });
  if (r?.ok && r.path) resolved[src] = r.path;
}
if (!resolved[DOC]) throw new Error(`${DOC} did not resolve`);
console.log(`${Object.keys(resolved).length} of ${asked.length} named paths are really on disk`);

/* -------------------------------- building -------------------------------- */
const page = path.join(root, 'renderer', 'dist-wayout', 'index.html');
if (process.env.SKIP_BUILD === '1' && fs.existsSync(page)) {
  console.log('reusing renderer/dist-wayout');
} else {
  console.log('building the renderer (dist-wayout, never dist)');
  execFileSync('npx', ['vite', 'build', 'renderer', '--outDir', 'dist-wayout', '--emptyOutDir', '--base', './'], {
    cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: process.env,
  });
}

/* -------------------------------- headless -------------------------------- */
sweep();
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
  '--allow-file-access-from-files', '--window-size=1440,900', 'about:blank',
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

const refuse = 'async () => { throw new Error("read-only shot bridge"); }';
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__RESOLVED__ = ${JSON.stringify(resolved)};
    window.zero = {
      snapshot: async () => ({
        products: ${JSON.stringify([product])},
        items: ${JSON.stringify([item])},
        agents: [], approvals: [],
        supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['${SLUG}'], hiddenProducts: [], personalProducts: [], capacity: 0 },
        restartNeeded: null,
        config: { browserHome: '', browserPins: [], outsideAgents: 'all' },
      }),
      // The finder's real answer, plus the address the frame points at. In the
      // app that address is astral-doc://; here it is the same file over
      // file://, which is the only scheme this browser has.
      openArtifact: async ({ src }) => {
        const opened = window.__RESOLVED__[src];
        if (!opened) return { ok: false, error: src + ' could not be found in this product.' };
        return { ok: true, opened, url: 'file://' + opened };
      },
      readDoc: async () => ({ ok: false, error: 'not in this shot' }),
      // THE FORWARDED ESCAPE. In the app this arrives from the main process,
      // which hears the key below the page; here the shot fires it by hand so
      // the renderer's own half can be watched.
      onEscapeDoc: (fn) => { window.__fireEscapeDoc = fn; return () => { window.__fireEscapeDoc = null; }; },
      sessionTrace: async () => ({ ok: true, sessions: [] }),
      dashboard: async () => ({ ok: false }),
      artifacts: async () => ({ artifacts: [], memories: [] }),
      repeats: async () => [],
      settings: async () => ({ ok: false, workspace: null, projects: [] }),
      itemHistory: async () => ({ ok: true, lines: [] }),
      onChanged: () => () => {},
      badge: () => {}, notify: () => {},
      answer: ${refuse}, compose: ${refuse}, schedule: ${refuse},
      agentReply: ${refuse}, closeAgent: ${refuse}, scheduleAgent: ${refuse},
      createProduct: ${refuse}, pauseSupervisor: ${refuse},
    };
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
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${r.exceptionDetails.exception?.description ?? ''}`);
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const capture = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  ${name}.png`);
};

// Her card, with the file open beside it, exactly the way she got there: open
// the row, then click the chip that names the file.
async function openTheFile(theme) {
  await goto(`file://${page}`);
  await evaluate(`localStorage.setItem('zero.theme', ${JSON.stringify(theme)}); localStorage.removeItem('zero.docSplit')`);
  await goto(`file://${page}`);
  await wait(1000);
  // The row is on whichever tab it is on; walk them until it shows. Each click
  // is its own call rather than one async block, because an evaluate whose
  // promise outlives a re-render comes back "Promise was collected".
  let row = null;
  const tabCount = await evaluate(`document.querySelectorAll('.tab').length`);
  for (let i = -1; i < tabCount && !row; i++) {
    if (i >= 0) { await evaluate(`(document.querySelectorAll('.tab')[${i}].click(), 1)`); await wait(400); }
    row = await evaluate(`(() => {
      const r = [...document.querySelectorAll('.row')][0];
      if (!r) return null;
      r.click(); return r.innerText.replace(/\\n+/g, ' | ').slice(0, 70);
    })()`);
  }
  if (!row) throw new Error('her card is not on any list');
  await wait(900);
  const clicked = await evaluate(`(() => {
    const want = ${JSON.stringify(DOC.split('/').pop())};
    const hit = [...document.querySelectorAll('.attached-file, .artifact-embed-path')].find((b) => (b.title || b.innerText || '').includes(want));
    if (!hit) return null;
    hit.click(); return (hit.title || hit.innerText).trim().slice(0, 60);
  })()`);
  if (!clicked) {
    const seen = await evaluate(`JSON.stringify([...document.querySelectorAll('[class*=file], [class*=artifact], a, button')].slice(0, 60).map((n) => n.className + ' :: ' + (n.title || '') + ' :: ' + (n.innerText || '').slice(0, 40)))`);
    console.log(seen);
    throw new Error(`no chip on her card opens ${DOC}`);
  }
  await wait(1600);
  return { row, clicked };
}

const report = { file: DOC, item: ITEM };


/* ================= THE SHIPPED RULE, AT EVERY WIDTH ======================= */
const measure = () => evaluate(`(() => {
  const el = [...document.querySelectorAll('.back-esc')].filter((b) => !b.closest('.doc-head'))[0];
  const t = document.querySelector('.focus-title');
  const range = document.createRange(); range.selectNodeContents(t);
  const line = [...range.getClientRects()][0];
  const bodyLeft = (() => {
    for (const p of document.querySelectorAll('.focus p, .focus-scroll p')) {
      const r = p.getBoundingClientRect();
      if (r.width > 100 && r.top > line.bottom) return Math.round(r.left);
    }
    return null;
  })();
  const out = {
    panelUp: !!document.querySelector('.app.panel-up'),
    fileOpen: !!document.querySelector('.doc-pane'),
    titleLine: { x: Math.round(line.left), y: Math.round(line.top) },
    bodyLeft,
    textOutOfLine: bodyLeft === null ? null : Math.round(line.left - bodyLeft),
  };
  if (!el || getComputedStyle(el).display === 'none') return { ...out, icon: null, gap: null, hits: null };
  const b = el.getBoundingClientRect();
  return {
    ...out,
    icon: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
    says: el.innerText.trim(),
    wordShowing: [...el.querySelectorAll('span')].some((s) => getComputedStyle(s).display !== 'none'),
    onTitleLine: !(b.bottom <= line.top || b.top >= line.bottom),
    // The middle of the control minus the middle of the title's first line.
    offLine: Math.round((b.top + b.bottom) / 2 - (line.top + line.bottom) / 2),
    gap: Math.round(line.left - b.right),
    hits: line.left < b.right && !(b.bottom <= line.top || b.top >= line.bottom),
    collides: (() => {
      const near = [];
      const SEL = '.tab, .topbar button, .topbar svg, .topbar a, .focus-title, .focus-meta, .doc-head';
      for (const e of document.querySelectorAll(SEL)) {
        if (e === el || el.contains(e) || e.contains(el)) continue;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) {
          const over = Math.round(Math.min(r.right, b.right) - Math.max(r.left, b.left));
          const name = (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '') || e.tagName;
          near.push(name + ' by ' + over + 'px');
        }
      }
      return [...new Set(near)];
    })(),
  };
})()`);

const LIGHTS = `(() => {
  if (document.getElementById("win-buttons")) return;
  const d = document.createElement("div");
  d.id = "win-buttons";
  d.style.cssText = "position:fixed;left:0;top:0;z-index:9999;pointer-events:none";
  d.innerHTML = [["#ff5c60", 12], ["#fac800", 35], ["#35c759", 58]].map(([c, x]) =>
    \`<span style="position:absolute;left:\${x}px;top:11px;width:13.75px;height:13.75px;border-radius:50%;background:\${c}"></span>\`).join("");
  document.body.appendChild(d);
})()`;

const shot = async (name, w, h, clip) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: clip ?? { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  return `${name}.png`;
};
const unhover = async (w, h) => {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: w - 6, y: h - 6, button: 'none', buttons: 0 });
  await wait(220);
};
const shutTheFile = () => evaluate(`(() => { const b = document.querySelector('.doc-head .back-esc') || document.querySelector('.doc-head button');
  if (b) { b.click(); return true; } return false; })()`);

// 1710 is her own window, 1440 is the size the app opens at, and 1000 is
// narrower than she can drag it in practice: it is here because that is where
// the old rule ran out of gutter and bought itself an exception.
const WIDTHS = [1710, 1440, 1280, 1000];
const H = 900;
const out = { item: ITEM, file: DOC, theme: 'dark', widths: {} };

for (const W of WIDTHS) {
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await openTheFile('dark');
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await wait(900);
  await evaluate(LIGHTS);
  await unhover(W, H);
  const open = await measure();
  const shots = { open: await shot(`shipped-${W}-open`, W, H), corner: await shot(`shipped-${W}-corner`, W, H, { x: 0, y: 0, width: 560, height: 230, scale: 1 }) };
  // Hovered, because the pill filling with `--bg-hover` over the first word is
  // her own second crop and is the state that has to be clear too.
  if (open.icon) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: open.icon.x + open.icon.w / 2, y: open.icon.y + open.icon.h / 2, button: 'none', buttons: 0 });
    await wait(320);
    shots.hover = await shot(`shipped-${W}-hover`, W, H, { x: 0, y: 0, width: 560, height: 230, scale: 1 });
    await unhover(W, H);
  }
  await shutTheFile();
  await wait(650);
  await evaluate(LIGHTS);
  const shut = await measure();
  shots.shut = await shot(`shipped-${W}-shut`, W, H);
  out.widths[W] = { open, shut, shots };
  console.log(`${String(W).padEnd(5)} file open: icon ${open.icon ? `${open.icon.x}..${open.icon.x + open.icon.w}` : 'none'} title at ${open.titleLine.x} -> ${open.hits ? `HITS by ${-open.gap}` : `${open.gap}px of air`}  onTitleLine:${open.onTitleLine} offLine:${open.offLine}  text out of line ${open.textOutOfLine}px  word:${open.wordShowing}  collides ${JSON.stringify(open.collides)}`);
  console.log(`${String(W).padEnd(5)} file shut: icon ${shut.icon.x}..${shut.icon.x + shut.icon.w} title at ${shut.titleLine.x} -> ${shut.gap}px of air  text out of line ${shut.textOutOfLine}px`);
}

fs.writeFileSync(path.join(outDir, 'shipped.json'), JSON.stringify(out, null, 2));
console.log('\nwrote ' + path.join(outDir, 'shipped.json'));
process.exit(0);
