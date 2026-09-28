// THE CODE ARTIFACT, IN THE REAL APP —, round four.
//
// Round three drew a picture of an app. This one BUILDS THE RENDERER and shoots
// it, the way scripts/shot-doc-pane.mjs already shoots the pane. Every pixel
// outside the change — the list, the reading pane, the card, the crumb, the way
// out, the two marks, the divider — is the app's own and nobody drew it here.
//
// WHAT IS REAL AND WHAT IS STUBBED, in full, because a drawing that is unclear
// about this is the thing that cost the last round:
//   REAL  the renderer, built from this branch by vite
//   REAL  her cards, read out of her live ledger, unedited
//   REAL  the change: 50 edits over 12 files from the worker session that was
// spawned for, her artifact shelf task, pulled out of the
// conversation on this Mac (scripts/build-change-for-item.mjs)
//   REAL  the markdown and the html page, her own files, read off disk
//   REAL  the change file itself, at runs/<item>/the-change-it-made.change,
// written by main/code-change.mjs out of that run's own transcript,
// which is the same code the supervisor now runs on every exit
//   STUB  ONE trace line naming that file. The supervisor writes this line for
// real at exit; the shot writes it here because the shot does not run
// a supervisor, and without it the chip has nothing to hang on.
//
//   node scripts/shot-code-artifact.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldWorkItems } from '../shared/work-items.mjs';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { readDoc } from '../main/doc-file.mjs';
import { referencedFiles } from '../shared/referenced-files.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { ACCOUNT_ROOT } from './lib/machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'shots-code-artifact');
const ACCOUNT = `${ACCOUNT_ROOT}`;
const SLUG = 'agentbox';
const W = 1440, H = 900;

// THE CODE CARD: her own, finished, and the one the change really belongs to.
const CODE_ITEM = 'w-000e11c85b';
const CODE_ROW = /artifact shelf/i;
const CHANGE_SRC = `runs/${CODE_ITEM}/the-change-it-made.change`;
// THE TWO KINDS THE PANE ALREADY OPENS, ON THE SAME CARD. One card carrying a
// change, a markdown file and a page of ours is the only way the three frames
// can be compared without the card underneath them changing too.
const MD_ITEM = CODE_ITEM, MD_ROW = CODE_ROW, MD_DOC = 'STATE.md';
const HTML_ITEM = CODE_ITEM, HTML_ROW = CODE_ROW;
const HTML_DOC = 'designs/2026-08-12-artifact-shelf.html';

fs.mkdirSync(outDir, { recursive: true });

/* ------------------------- her store, read-only --------------------------- */
// THE LEDGER AND THE RUNS ARE NOT IN THE FOLDER SHE UPLOADS FILES TO ANY MORE.
// They moved to the app's own home in main/store/home.mjs, and this script was
// still reading `<account>/<slug>/work-items.jsonl` and throwing ENOENT before
// it drew a pixel. `machineryPath` is what the app itself calls, so it finds
// them wherever that file decides they live.
const dir = path.join(ACCOUNT, SLUG);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
const product = { slug: SLUG, name: meta.name ?? SLUG, dir, oneLiner: meta.oneLiner ?? '', repoPath: meta.repoPath ?? null };
const folded = foldWorkItems(fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const items = [...new Set([CODE_ITEM, MD_ITEM, HTML_ITEM])].map((id) => {
  const it = { ...folded.get(id), product: SLUG, productName: product.name };
  if (!it.id) throw new Error(`${id} is not in her ledger`);
  console.log(`card: ${String(it.title).slice(0, 68)}…`);
  return it;
});

// THE CHANGE, READ OFF DISK, AND IT IS A REAL FILE NOW. Round four had to
// build this in the shot script because nothing wrote one. The supervisor now
// writes it the moment a worker exits (main/supervisor.mjs), so this reads the
// artifact the app itself produced for CODE_ITEM rather than making one up.
const changeFile = machineryPath(dir, path.join('runs', CODE_ITEM, 'the-change-it-made.change'));
if (!fs.existsSync(changeFile)) throw new Error(`${changeFile} does not exist: no run has saved a change for ${CODE_ITEM} yet`);
const change = JSON.parse(fs.readFileSync(changeFile, 'utf8'));
console.log(`change: ${change.files.length} files, ${change.editCount} edits, +${change.plus} -${change.minus}`);

// Her real traces, one item at a time.
const traceFor = (id) => {
  const d = machineryPath(dir, path.join('sessions', id));
  try {
    return fs.readdirSync(d).filter((f) => f.endsWith('.log')).sort().slice(-6)
      .map((f) => ({ startedAt: Number(f.replace('.log', '')) || 0, text: fs.readFileSync(path.join(d, f), 'utf8').slice(-120_000) }));
  } catch { return []; }
};
const traces = Object.fromEntries([...new Set([CODE_ITEM, MD_ITEM, HTML_ITEM])].map((id) => [id, traceFor(id)]));

// THE ONE STUBBED LINE. The supervisor already logs every tool call in exactly
// this shape (run-files.ts), so this is the line the built version writes when
// a run that touched the repository saves what it changed.
const stub = { startedAt: Date.parse('2026-08-13T12:00:00Z'), text: `12:00:00  [Write] ${dir}/${CHANGE_SRC}\n` };
traces[CODE_ITEM] = [...traces[CODE_ITEM], stub];

// The app's own finder, run here so the bridge answers what main would answer.
const asked = [...new Set([
  MD_DOC, HTML_DOC,
  ...items.flatMap((it) => referencedFiles(it.body, it.result, it.note, it.answer)),
  ...Object.values(traces).flat().flatMap((s) => referencedFiles(s.text)),
])];
const resolved = {};
for (const src of asked) {
  const r = resolveArtifact({ src, product: SLUG, products: [product], accountRoot: ACCOUNT });
  if (r?.ok && r.path) resolved[src] = r.path;
}
// The change resolves like every other artifact now; this only guarantees it,
// since the finder is handed a list gathered from prose and traces.
resolved[CHANGE_SRC] = changeFile;
for (const need of [MD_DOC, HTML_DOC]) if (!resolved[need]) throw new Error(`${need} did not resolve`);
console.log(`${Object.keys(resolved).length} of ${asked.length + 1} named paths resolve`);

const docs = {};
{
  const r = readDoc({ file: resolved[MD_DOC] });
  if (!r.ok) throw new Error(`${MD_DOC}: ${r.error}`);
  docs[MD_DOC] = { text: r.text, mtime: r.mtime };
  console.log(`${MD_DOC}: ${r.text.length} characters read off disk`);
}

/* -------------------------------- building -------------------------------- */
const page = path.join(root, 'renderer', 'dist-code', 'index.html');
if (process.env.SKIP_BUILD === '1' && fs.existsSync(page)) {
  console.log('reusing renderer/dist-code');
} else {
  console.log('building the renderer (dist-code, never dist)');
  execFileSync('npx', ['vite', 'build', 'renderer', '--outDir', 'dist-code', '--emptyOutDir', '--base', './'], {
    cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: process.env,
  });
}

/* -------------------------------- headless -------------------------------- */
sweep();
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
  '--allow-file-access-from-files', `--window-size=${W},${H}`, 'about:blank',
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

const refuse = 'async () => { throw new Error("read-only shot bridge"); }';
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__RESOLVED__ = ${JSON.stringify(resolved)};
    window.__DOCS__ = ${JSON.stringify(docs)};
    window.__CHANGE__ = ${JSON.stringify(change)};
    window.__TRACES__ = ${JSON.stringify(traces)};
    window.__WROTE__ = [];
    window.zero = {
      snapshot: async () => ({
        products: ${JSON.stringify([product])},
        items: ${JSON.stringify(items)},
        agents: [], approvals: [],
        supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['${SLUG}'], hiddenProducts: [], personalProducts: [], capacity: 0 },
        restartNeeded: null,
        config: { browserHome: '', browserPins: [], outsideAgents: 'all' },
      }),
      openArtifact: async ({ src }) => {
        const opened = window.__RESOLVED__[src];
        return opened ? { ok: true, opened, url: 'file://' + opened } : { ok: false, error: src + ' could not be found in this product.' };
      },
      readDoc: async ({ src }) => {
        const d = window.__DOCS__[src];
        return d ? { ok: true, text: d.text, mtime: d.mtime } : { ok: false, error: src + ' could not be read.' };
      },
      codeChange: async ({ src }) => (String(src).endsWith('.change')
        ? { ok: true, change: window.__CHANGE__ }
        : { ok: false, error: src + ' is not a change.' }),
      writeDoc: async ({ src, text, mtime }) => { window.__WROTE__.push({ src, text, mtime }); return { ok: true, mtime: mtime + 1 }; },
      sessionTrace: async ({ id }) => ({ ok: true, sessions: window.__TRACES__[id] ?? [] }),
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
    window.addEventListener('error', (e) => { window.__ERR__ = String(e.message); });
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
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  ${name}.png`);
};

/**
 * Open one of her cards with one file already in the pane.
 *
 * ROUND FIVE HAS NOTHING TO SET. The frame was the question round four asked
 * and she answered it, so the frame now follows the KIND of file and there is
 * no switch left to flip. The only thing that varies here is the window she is
 * sitting in.
 */
async function openOn({ theme = 'dark', skin = 'none', row, src }) {
  await goto(`file://${page}`);
  await evaluate(`
    localStorage.setItem('zero.theme', ${JSON.stringify(theme)});
    localStorage.setItem('zero.skin', ${JSON.stringify(skin)});
    localStorage.removeItem('zero.docPane.frame.v1');
    localStorage.removeItem('zero.docPane.said.v1');
    localStorage.removeItem('zero.docPane.split.v1');
  `);
  await goto(`file://${page}`);
  await wait(1000);
  const found = await evaluate(`(async () => {
    const re = ${row};
    const find = () => [...document.querySelectorAll('.row')].find((x) => re.test(x.innerText));
    const tabs = [...document.querySelectorAll('.tab')];
    for (let i = -1; i < tabs.length; i++) {
      if (i >= 0) { tabs[i].click(); await new Promise((r) => setTimeout(r, 350)); }
      const r = find();
      if (r) { r.click(); return r.innerText.replace(/\\n+/g, ' | ').slice(0, 70); }
    }
    return null;
  })()`);
  if (!found) throw new Error(`no row matches ${row}`);
  await wait(900);
  const opened = await evaluate(`(() => {
    const want = ${JSON.stringify(src)};
    const tail = want.split('/').pop();
    const hit = [...document.querySelectorAll('.attached-file, .artifact-embed-path')]
      .find((b) => (b.title || '').includes(want) || (b.title || b.innerText || '').includes(tail));
    if (!hit) return null;
    hit.click(); return hit.title || hit.innerText;
  })()`);
  if (!opened) throw new Error(`no chip on the card opens ${src}`);
  await wait(1500);
  return opened;
}

/**
 * HOW LONG THE PANE TAKES, AND HOW HEAVY IT IS TO SCROLL.
 *
 * Added 2026-08-27 because that round took the fold out, so the pane draws
 * every row of a change instead of a head and a tail. The fold was a
 * performance guard and removing one without measuring it is how a card gets
 * slow quietly. Run this script on the commit before and after to compare.
 *
 * The open time is measured from the chip being pressed to the last code row
 * being in the document, which is what she waits through. The scroll cost is
 * twenty page-downs through the change, timed together, because a long
 * document that opens fast can still stutter under the wheel.
 */
async function timeTheOpen({ row, src }) {
  await goto(`file://${page}`);
  await goto(`file://${page}`);
  await wait(1000);
  // The card is finished, so it is not on the tab the app opens on. Same walk
  // openOn does, or the chip below is never on the screen to be pressed.
  const onCard = await evaluate(`(async () => {
    const re = ${row};
    const find = () => [...document.querySelectorAll('.row')].find((x) => re.test(x.innerText));
    const tabs = [...document.querySelectorAll('.tab')];
    for (let i = -1; i < tabs.length; i++) {
      if (i >= 0) { tabs[i].click(); await new Promise((r) => setTimeout(r, 350)); }
      const r = find();
      if (r) { r.click(); return true; }
    }
    return false;
  })()`);
  if (!onCard) throw new Error(`timing: no row matches ${row}`);
  await wait(900);
  const openMs = await evaluate(`(async () => {
    const want = ${JSON.stringify(src)};
    const tail = want.split('/').pop();
    const hit = [...document.querySelectorAll('.attached-file, .artifact-embed-path')]
      .find((b) => (b.title || '').includes(want) || (b.title || b.innerText || '').includes(tail));
    if (!hit) return null;
    const t0 = performance.now();
    hit.click();
    // Settled means the row count stopped moving across two animation frames
    // with nothing further queued, which is the last thing painted.
    let last = -1, still = 0;
    while (still < 3 && performance.now() - t0 < 30000) {
      await new Promise((r) => requestAnimationFrame(r));
      const n = document.querySelectorAll('.code-row').length;
      still = n === last && n > 0 ? still + 1 : 0;
      last = n;
    }
    return { ms: Math.round(performance.now() - t0), rows: last };
  })()`);
  const scrollMs = await evaluate(`(async () => {
    const body = document.querySelector('.code-body');
    if (!body) return null;
    body.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(r));
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      body.scrollTop += body.clientHeight;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { ms: Math.round(performance.now() - t0), height: Math.round(body.scrollHeight) };
  })()`);
  return { open: openMs, scroll: scrollMs };
}

const report = {};
const measure = async (name) => {
  report[name] = await evaluate(`(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      pane: box('.doc-pane'), card: box('.doc-pane .doc-card'), head: box('.doc-head'),
      tree: box('.code-tree'), body: box('.code-body'),
      nodes: document.querySelectorAll('.code-node').length,
      folders: document.querySelectorAll('.code-folder').length,
      rows: document.querySelectorAll('.code-row').length,
      // THE THREE THINGS SHE ASKED TO BE GONE, COUNTED RATHER THAN CLAIMED.
      // All three must read 0 in every shot: the sentence over a change, the
      // Escape control in the file's own corner, and the two word-buttons on a
      // file header. editorMark is what replaced the last of them.
      said: document.querySelectorAll('.code-said').length,
      backEsc: document.querySelectorAll('.doc-head .back-esc').length,
      wordButtons: document.querySelectorAll('.code-act').length,
      editorMark: (() => {
        const b = document.querySelector('.doc-marks .doc-mark');
        return b ? (b.getAttribute('title') ?? '') : null;
      })(),
      chip: [...document.querySelectorAll('.attached-file')].map((b) => b.innerText.replace(/\\n+/g, ' ')),
      theme: document.documentElement.getAttribute('data-theme'),
      // THE GROUNDS, SAMPLED RATHER THAN ASSUMED. A palette that only works in
      // one window is not a palette, and a light window is the one the five
      // code colours had never been seen in.
      ground: (() => {
        const get = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
        return {
          app: get('.app', 'backgroundColor'),
          left: get('.focus', 'backgroundColor'),
          leftWrap: get('.app > *', 'backgroundColor'),
          body: getComputedStyle(document.body).backgroundColor,
          skin: document.documentElement.getAttribute('data-skin'),
          card: get('.doc-pane .doc-card', 'backgroundColor'),
          plusRow: get('.cr-plus', 'backgroundColor'),
          comment: get('.t-com', 'color'),
          keyword: get('.t-kw', 'color'),
        };
      })(),
      err: window.__ERR__ ?? null,
    };
  })()`);
};

/*
 * 1. THE CHANGE, IN THE LAKE, which is the window she asked to see it in and
      the one the black ground was decided for. */
console.log('the change, in the Lake');
await openOn({ skin: 'lake', row: CODE_ROW, src: CHANGE_SRC });
await capture('1-code-lake');
await measure('codeLake');

/*
 * 2. THE SAME CHANGE IN PLAIN DARK, with no picture behind the window, so the
      ground can be told apart from the skin that happens to be on. */
console.log('the change, plain dark');
await openOn({ row: CODE_ROW, src: CHANGE_SRC });
await capture('2-code-dark');
await measure('codeDark');

/*
 * 3. AND IN A LIGHT WINDOW. Her rule for a light window is that it keeps its
      paper, so this one is NOT black and that is the point of shooting it. */
console.log('the change, light window');
await openOn({ theme: 'light', row: CODE_ROW, src: CHANGE_SRC });
await capture('3-code-light');
await measure('codeLight');

/*
 * 4. THE FILE SHE HAS WALKED TO, three files down, because the mark top right
      opens THAT file in her editor and not the change as a whole. */
console.log('walking to the third file');
await openOn({ skin: 'lake', row: CODE_ROW, src: CHANGE_SRC });
await evaluate(`(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); return true; })()`);
await wait(500);
await capture('4-code-walked');
await measure('codeWalked');

/* * 5. THE MARKDOWN FILE, IN THE LAKE, unchanged and still in its rounded card.
*/
console.log('the markdown file, still a card');
await openOn({ skin: 'lake', row: MD_ROW, src: MD_DOC });
await capture('5-md-lake-card');
await measure('mdLake');

/* 6. AND ONE OF HER PAGES, same window, same card. */
console.log('the html page, still a card');
await openOn({ skin: 'lake', row: HTML_ROW, src: HTML_DOC });
await capture('6-html-lake-card');
await measure('htmlLake');

/*
 * 7. WHAT IT COSTS, timed three times because one reading of a browser is
      noise. The median is what gets reported. */
console.log('timing the open and the scroll');
const runs = [];
for (let i = 0; i < 3; i++) runs.push(await timeTheOpen({ row: CODE_ROW, src: CHANGE_SRC }));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
report.cost = {
  runs,
  openMs: median(runs.map((r) => r.open?.ms ?? 0)),
  rows: runs[0]?.open?.rows ?? 0,
  scrollMs: median(runs.map((r) => r.scroll?.ms ?? 0)),
  scrollHeight: runs[0]?.scroll?.height ?? 0,
};
console.log(`  open ${report.cost.openMs}ms to ${report.cost.rows} rows; 20 page-downs ${report.cost.scrollMs}ms`);

fs.writeFileSync(path.join(outDir, 'measured.json'), JSON.stringify(report, null, 1));
console.log(`\nmeasured.json written to ${outDir}`);
for (const [k, v] of Object.entries(report)) {
  if (v?.err) console.log(`  ${k}: PAGE ERROR ${v.err}`);
}
ws.close();
chrome.kill();
process.exit(0);
