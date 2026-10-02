// THE BUILT WALK, DRIVEN END TO END, WITH NOTHING PAINTED ON IT.
//
// The round four page was the real app with the card and the ring restyled from
// the OUTSIDE, because none of it was code yet.
//
// So this script injects NOTHING. It opens the built renderer, presses the keys
// a person would press, and photographs whatever the app draws. Every number it
// prints is read off the app's own rectangles. If a beat here looks different
// from the beat on the round four page, the app is what changed and this is the
// truth about it.
//
// TEN BEATS, in her order:
//   1 welcome   2 where is your code   3 what is it called
//   4 make a task (the plus)   5 start it   6 it runs, and it comes back
//   7 end it   8 clear the inbox   9 ⌘K
//   10 the finish card, with her agents on it
//
// THE ENDING CHANGED ON 2026-08-23.The import was the eighth beat for a day, a
// full screen form dropped into the middle of a walk that is otherwise the real
// app with a card beside it, and a screen of its own at the end for a few hours
// after that. It is on the finish card now, and on a Mac with no agent files
// there is no offer at all. node scripts/shot-the-built-walk.mjs <outDir>
// [folder]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { answerFor } from '../main/first-run.mjs';
import { EXAMPLES } from '../shared/first-run-examples.mjs';
import {
  PRACTICE_ANSWER, PRACTICE_NAME, PRACTICE_NOTE, PRACTICE_ROWS, PRACTICE_SLUG, PRACTICE_TASK_TRACE,
} from '../shared/first-run-practice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist-fr');
const outDir = process.argv[2] ?? path.join(root, 'shots', 'lake-walk');
const folder = process.argv[3] ?? root;
// HER OWN WINDOW, not a convenient one. Read out of her running Agentbox on
// 2026-08-23 at 14:56 with the inspector: innerWidth 1752, innerHeight 986. W
// and H can still be overridden for a shot of some other machine.
const W = Number(process.env.W ?? 1752), H = Number(process.env.H ?? 986);
// found (a normal machine) | missing (really has none) | unknown (the settings
// read never reached the main process, which is the state every shot of this
// screen was accidentally taken in).
const CLAUDE = process.env.CLAUDE ?? 'found';
// WHETHER CLAUDE CODE IS ALREADY RUNNING ON THIS MAC WHILE THE WALK IS ON.
// LIVE=1 puts two sessions in the snapshot: two rows, each "has been quiet for
// 1 minute", sitting in the inbox behind a finish card that had just said the
// inbox was empty. Without this the harness walks a Mac with no other
// agents on it, and that is the one machine where the defect cannot appear.
const LIVE = process.env.LIVE === '1';
// found (her real Mac, via the renderer's fixtures) | none (a Mac with no agent
// files anywhere, which is what beat eight looks like to most new users).
const AGENTS = process.env.AGENTS ?? 'found';
console.log('claude code       :', CLAUDE);
console.log('agent files       :', AGENTS);
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
  // The sessions Agentbox finds by itself, which are nothing to do with the
  // import on the finish card: they are Claude Code running elsewhere on the
  // machine. `startedByZero` absent means they are somebody else's, which is
  // what `listed` in shared/agents.mjs asks.
  agents: LIVE
    ? [
      { pid: 90101, name: 'agentbox-bb', product: 'agentbox', productName: 'Agentbox', startedAt: Date.now() - 90_000, lastActiveAt: Date.now() - 60_000 },
      { pid: 90102, name: 'agentbox-b2', product: 'agentbox', productName: 'Agentbox', startedAt: Date.now() - 90_000, lastActiveAt: Date.now() - 61_000 },
    ]
    : [],
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
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: no answer in 60s`)); }, 60_000);
  pending.set(id, (m) => { clearTimeout(timer); return m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);
await call('Page.enable');
await call('Inspector.enable').catch(() => {});
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });

// THE BRIDGE. compose writes into the snapshot the way the store does, with the
// labels it was handed, and records what it was called with. firstRunAnswer
// writes the result the way main does. firstRunWalking records the hold. Every
// call is stamped, which is where the timings below come from.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__SNAP__ = ${JSON.stringify(snapshot)};
    window.__THREADS__ = {};
    /*
     * ONE ROW'S TWO FILES, in the shape the store really writes them.
       No backticks anywhere in here: this whole block is a template literal in
       the harness, so one would end it.
       The ledger: the system's birth line, then her half carrying the ask, then
       the agent's half carrying the result, which is the order
       stagePracticeRows appends and the order threadEvents reads.
       The log: HH:MM:SS then TWO spaces then the line, which is what
       traceStreamLine writes and what item-thread.ts parses.
       THE CLOCK IS UTC AND IT IS FLOORED TO THE SECOND, for the same two
       reasons main/store.mjs is: momentOf reads those digits as UTC and puts
       the date back, and it adds a whole day if the line lands even a
       millisecond before the session started. Shot with a local clock on
       2026-08-24 and the pane printed Mon, Aug 24 3:38pm under a result
       stamped 10:37pm. */
    window.__thread = (id, o) => {
      const clock = (ms) => new Date(ms).toISOString().slice(11, 19);
      window.__THREADS__[id] = {
        lines: [
          { id, ts: o.at, source: 'system', patch: { title: o.title, kind: o.kind, priority: 5 } },
          { id, ts: o.at, source: 'founder', patch: { title: o.title, body: o.body } },
          // THE CLAIM IS WHAT MAKES THE RUN VISIBLE. withRuns
          // (renderer/src/thread-history.ts) hangs a session's lines off this
          // event and drops them if it is not there, so a thread without it
          // draws the ask and the result and none of the work.
          { id, ts: o.at, source: 'agent', epoch: 1, claim: { holder: 'first-run', leaseUntil: o.at + 60000 }, patch: { status: 'claimed' } },
          { id, ts: o.at + 500, source: 'agent', epoch: 1, release: true },
          // AFTER THE RUN, not one second after the claim: the thread sorts by
          // stamp, so a result written before the last line of the run prints
          // the conclusion in the middle of the work. Same arithmetic as
          // stagePracticeRows in main/store.mjs.
          { id, ts: o.at + 1000 + o.trace.length * 9000 + 1000, source: 'agent', patch: { result: o.result } },
        ],
        sessions: [{
          startedAt: Math.floor((o.at + 1000) / 1000) * 1000,
          text: o.trace.map((l, i) => clock(Math.floor((o.at + 1000) / 1000) * 1000 + i * 9000) + '  ' + l).join('\\n') + '\\n',
        }],
      };
    };
    window.__LOG__ = [];
    window.__T0__ = 0;
    const stamp = (what, extra) => window.__LOG__.push({ what, at: Date.now(), ...extra });
    window.zero = {
      snapshot: async () => window.__SNAP__,
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      // THE THREADS ARE REAL HERE.
      //
      // These two answered an empty list to everything, so every reading pane
      // harness ever photographed drew "Nothing has been said here yet." — and
      // that is what she opened on the round three page.
      //
      // A STUB THAT ANSWERS EMPTY IS A HARNESS THAT CANNOT SHOW THE FEATURE.
      // These now build the exact two files main/store.mjs writes: the ledger
      // lines (stagePracticeRows) and the session log (writePracticeTrace),
      // off the same shared module. So the pane draws them with the app's own
      // components and nothing here is a mock of a thread.
      sessionTrace: async (p) => ({ ok: true, sessions: (window.__THREADS__[p?.id] ?? {}).sessions ?? [] }),
      itemHistory: async (p) => ({ ok: true, lines: (window.__THREADS__[p?.id] ?? {}).lines ?? [] }),
      codeChange: async () => ({ ok: false }),
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
      // THE FINISH CARD CARRIES THE IMPORT, so it needs agents to import. These
      // are the renderer's own fixtures (renderer/src/fixtures.ts), which are
      // read off her real Mac, so the card draws what she would really see.
      //
      // AGENTS=none GIVES THE OTHER STATE: a Mac with no agent files at all. It
      // is now a finish card with no offer on it at all, and this is what
      // photographs that.
      agentFiles: async () => (${JSON.stringify(AGENTS === 'none')} ? { user: [], project: [], chosen: null } : {
        user: [
          { name: 'leon-okafor-qa', title: 'Leon Okafor QA', line: 'QA agent that embodies the persona of Leon Okafor, a founder being onboarded to Agentbox.', scope: 'all', path: '/Users/x/.claude/agents/leon-okafor-qa.md' },
          { name: 'localhost-qa', title: 'Localhost QA', line: 'Validate frontend changes against the running app.', scope: 'all', path: '/Users/x/.claude/agents/localhost-qa.md' },
          { name: 'qa-browser-tester', title: 'QA Browser Tester', line: 'Playwright-powered browser testing subagent.', scope: 'all', path: '/Users/x/.claude/agents/qa-browser-tester.md' },
          { name: 'docs-reviewer', title: 'Docs Reviewer', line: 'Review developer documentation for accuracy and consistency with the codebase.', scope: 'all', path: '/Users/x/.claude/agents/docs-reviewer.md' },
        ],
        project: [
          { name: 'cleanup-analyzer', title: 'Cleanup Analyzer', line: 'Run static analysis and return structured cleanup recommendations.', scope: 'project', path: '/Users/x/dev/zero/.claude/agents/cleanup-analyzer.md' },
          { name: 'plan-checker', title: 'Plan Checker', line: 'Validate implementation plans against documented architecture patterns.', scope: 'project', path: '/Users/x/dev/zero/.claude/agents/plan-checker.md' },
        ],
        chosen: null,
      }),
      projectSetting: async () => ({ ok: true }),
      // THE ONE WRITE THE IMPORT MAKES.
      setProjectSetting: async (p) => { stamp('setProjectSetting', { key: p.key, value: p.value }); return { ok: true }; },
      onChanged: () => () => {},
      badge: async () => {},
      notify: async () => ({ ok: true }),
      bootInfo: async () => ({ reloaded: false }),
      compose: async (p) => {
        stamp('compose', { labels: p.labels ?? null, title: p.title });
        window.__T0__ = Date.now();
        const made = {
          // THE PROJECT AND THE KIND ARE WHATEVER THE APP SENT, NOT TWO
          // CONSTANTS. This stub answered every compose with productName
          // 'Agentbox v2' and kind 'directive', so the first task anybody sends
          // in the walk was photographed reading "the app v2 · directive" under
          // its title while the band above it said nothing in here is yours.
          // Neither word was true: App.tsx composes to run.practice, falling
          // back to run.product, and the composer sends no kind at all, so it
          // is a task in the practice project. The harness was libelling the
          // app, which is the one thing a harness may never do.
          id: 'w-first',
          product: p.product,
          productName: p.product === "practice" ? "Practice" : 'Agentbox v2',
          status: 'open',
          title: p.title, body: p.body, kind: p.kind ?? 'task',
          labels: [...new Set(['founder', ...(p.labels ?? [])])],
          priority: p.priority ?? 5, epoch: 1, claim: null,
          createdAt: Date.now(), updatedAt: Date.now(),
          // THE STORE WRITES THIS MAP AND THE INBOX READS IT. composeItem
          // applies her title and body with founder authority, and without
          // that here the answered row is real and simply never drawn.
          wrote: {
            title: { ts: Date.now(), source: 'founder' },
            body: { ts: Date.now(), source: 'founder' },
          },
        };
        window.__SNAP__ = { ...window.__SNAP__, items: [...window.__SNAP__.items, made] };
        return made;
      },
      firstRunAnswer: async (p) => {
        stamp('firstRunAnswer', { id: p.id, waited: Date.now() - window.__T0__ });
        // THE HOLD, AND IT IS THE HARNESS'S, NOT THE APP'S. The app writes the
        // answer two seconds after the key (ANSWER_AFTER_MS) and moves to the
        // reading pane. Dressing the card and reading the contrast off the
        // pixels takes longer than two seconds, so the first run of this script
        // measured the "while it runs" beat on the screen AFTER it. Main is
        // what takes the time in the real app, so making main take longer here
        // is the honest way to stand still on that step. It changes how long
        // the row is working and nothing about what is drawn.
        await new Promise((r) => setTimeout(r, ${Number(process.env.HOLD ?? 2500)}));
        // THE PRACTICE PROJECT ANSWERS WITH ITS OWN PRE-WRITTEN LINE
        // (main/store.mjs finishFirstRunTask). The readme read is what a REAL
        // project's first task gets, and the walk no longer sends one there.
        const line = p.product === ${JSON.stringify(PRACTICE_SLUG)}
          ? ${JSON.stringify(PRACTICE_ANSWER)}
          : ${JSON.stringify(answer)};
        const at = Date.now();
        // AND THE RUN IT DID, so beat eleven opens onto a conversation rather
        // than onto "Nothing has been said here yet." main writes this too
        // (writePracticeTrace, called from finishFirstRunTask).
        const item = window.__SNAP__.items.find((i) => i.id === p.id);
        window.__thread(p.id, {
          at: at - ${PRACTICE_TASK_TRACE.length} * 9000,
          title: item?.title ?? '', kind: 'directive',
          body: item?.body ?? '', result: line,
          trace: ${JSON.stringify(PRACTICE_TASK_TRACE)},
        });
        window.__SNAP__ = {
          ...window.__SNAP__,
          items: window.__SNAP__.items.map((i) => (i.id === p.id
            ? { ...i, result: line, updatedAt: at,
                // main writes this with source 'agent', which is the whole of
                // what puts the answered row back in her inbox.
                wrote: { ...(i.wrote ?? {}), result: { ts: at, source: 'agent' } } }
            : i)),
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
      // THE PRACTICE PROJECT, MADE THE WAY main/store.mjs MAKES IT.So the
      // harness makes a REAL second product in the snapshot with the three rows
      // already in it, and everything after this beat is the app scoped to it.
      firstRunPractice: async () => {
        stamp('firstRunPractice');
        const now = Date.now();
        const made = ${JSON.stringify(PRACTICE_ROWS.map((r, i) => ({
          id: `w-p${i + 1}`, kind: r.kind, ago: r.agoMs, title: r.title,
          body: r.body, result: r.result, trace: r.trace,
        })))}.map((o) => {
          window.__thread(o.id, { ...o, at: now - o.ago });
          return {
          id: o.id, product: ${JSON.stringify(PRACTICE_SLUG)}, productName: ${JSON.stringify(PRACTICE_NAME)},
          status: 'open', kind: o.kind, title: o.title, body: o.body, result: o.result,
          labels: ['founder', 'first-run'], priority: 5, epoch: 1, claim: null,
          createdAt: now - o.ago, updatedAt: now - o.ago + 1000,
          wrote: {
            title: { ts: now - o.ago, source: 'founder' },
            body: { ts: now - o.ago, source: 'founder' },
            result: { ts: now - o.ago + 1000, source: 'agent' },
          },
        };
        });
        window.__SNAP__ = {
          ...window.__SNAP__,
          products: [...window.__SNAP__.products, {
            slug: ${JSON.stringify(PRACTICE_SLUG)}, name: ${JSON.stringify(PRACTICE_NAME)},
            oneLiner: '', repoPath: null, practice: true,
          }],
          items: [...window.__SNAP__.items, ...made],
        };
        return { slug: ${JSON.stringify(PRACTICE_SLUG)}, examples: made.map((m) => m.id) };
      },
      // AND ARCHIVED AT THE END, which is what takes it off the rail.
      firstRunPracticeEnd: async () => {
        stamp('firstRunPracticeEnd');
        window.__SNAP__ = {
          ...window.__SNAP__,
          products: window.__SNAP__.products.filter((p) => !p.practice),
          items: window.__SNAP__.items.filter((i) => i.product !== ${JSON.stringify(PRACTICE_SLUG)}),
        };
        return { archived: 1 };
      },
      importAgents: async (p) => { stamp('importAgents', { agents: p.agents }); return { filed: 0 }; },
      // BEAT NINE'S THREE ROWS, written the way main/store.mjs writes them:
      // her half at the moment they claim to have landed, the agent's half a
      // second later, which is what puts a row in her inbox at all
      // (answeredHerAsk, renderer/src/list-rules.ts).
      firstRunExamples: async () => {
        stamp('firstRunExamples');
        const now = Date.now();
        // THE REAL THREE, NOT A COPY OF THEM. This block used to carry its own
        // hand-typed titles, so the day the rows changed the picture went on
        // saying what they used to say. the titles now open with "Example:"
        // and the first shot after that change still showed the old ones. They
        // come off the shared module now, which is the same file
        // main/store.mjs writes the real rows from.
        const made = ${JSON.stringify(EXAMPLES.map((e, i) => ({
          id: `w-ex${i + 1}`, kind: e.kind, ago: e.agoMs, title: e.title, result: e.result,
        })))}.map((o) => ({
          id: o.id, product: 'agentbox-v2', productName: 'Agentbox v2', status: 'open',
          kind: o.kind, title: o.title, body: '', result: o.result,
          labels: ['founder', 'first-run'], priority: 5, epoch: 1, claim: null,
          createdAt: now - o.ago, updatedAt: now - o.ago + 1000,
          wrote: {
            title: { ts: now - o.ago, source: 'founder' },
            body: { ts: now - o.ago, source: 'founder' },
            result: { ts: now - o.ago + 1000, source: 'agent' },
          },
        }));
        window.__SNAP__ = { ...window.__SNAP__, items: [...window.__SNAP__.items, ...made] };
        return { ids: made.map((m) => m.id) };
      },
      // CLOSING A ROW, which is what E does and what beats seven and nine ask
      // for. It writes the status the way the store does, so the row really
      // leaves the list rather than being hidden by the harness.
      answer: async (p) => {
        stamp('answer', { id: p.id, status: p.status ?? null });
        const now = Date.now();
        window.__SNAP__ = {
          ...window.__SNAP__,
          items: window.__SNAP__.items.map((i) => (i.id === p.id
            ? { ...i, status: p.status ?? i.status, answer: p.answer ?? i.answer, updatedAt: now,
                wrote: { ...(i.wrote ?? {}), status: { ts: now, source: 'founder' } } }
            : i)),
        };
        return window.__SNAP__.items.find((i) => i.id === p.id) ?? null;
      },
      // SNOOZING, which is what S does and what beat fourteen asks for. The
      // moment goes on the row's runAt, which is where the real one goes
      // (main/ipc.mjs, schedule), so the row really leaves the inbox by the
      // app's own rule (belongsInInbox) rather than being hidden by the
      // harness.
      schedule: async (p) => {
        stamp('schedule', { id: p.id, runAt: p.runAt ?? null });
        const now = Date.now();
        window.__SNAP__ = {
          ...window.__SNAP__,
          items: window.__SNAP__.items.map((i) => (i.id === p.id
            // THE STAMP IS WHAT MAKES IT THE FOUNDER'S, and without it the row does not
            // move. belongsInInbox hides a row on hiddenUntil, and hiddenUntil
            // reads the runAt only when wrote.runAt.source is founder, which is
            // what the real store writes. The first cut of this stub set runAt
            // alone and the row sat in the inbox with a moment on it, so the
            // walk stood still on the snooze beat. Caught by driving it.
            ? { ...i, runAt: p.runAt ?? 0, updatedAt: now,
                wrote: { ...(i.wrote ?? {}), runAt: { ts: now, source: 'founder' } } }
            : i)),
        };
        return { ok: true };
      },
      scheduleAgent: async () => ({ ok: true }),
      // THE SIDEBAR NOTE. Without this the panel's load fails and api.ts hands
      // back "quit and reopen the app to keep a note here", which RailNote then
      // prints as a toast across the bottom of the window. This makes the shot
      // honest, and the note it answers with is the practice project's real
      // one.
      railNote: async (p) => ({ ok: true, text: p?.product === ${JSON.stringify(PRACTICE_SLUG)} ? ${JSON.stringify(PRACTICE_NOTE)} : '', mtime: 0 }),
      saveRailNote: async () => ({ ok: true, mtime: 0 }),
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// `e.key` is what every listener in the app reads, so it has to be the DOM's
// own name for the key and not the glyph the button prints. Enter dispatched as
// '↵' matches nothing and the walk simply stands still, which is what the first
// run of this script did. ESCAPE IS ONE OF THEM NOW. the agents question is the
// end), so the harness has to be able to press it rather than only letters and
// Enter. AND THE ARROWS, because walking the list is the only way to reach a
// row that is not the top one, and the walk's own alphabet cannot do it: J and
// K are caps, so on a beat that asks for E they are wrong presses and get
// swallowed before the list ever sees them (`swallowPress`). An arrow is not a
// cap and goes through, which is also how a person moves down this list
// mid-walk.
const NAMED = {
  Enter: { code: 'Enter', vk: 13 }, Escape: { code: 'Escape', vk: 27 },
  ArrowDown: { code: 'ArrowDown', vk: 40 }, ArrowUp: { code: 'ArrowUp', vk: 38 },
};
const key = async (k, mods = 0) => {
  const enter = k === 'Enter';
  const named = NAMED[k];
  const common = {
    modifiers: mods,
    key: named ? k : k,
    // A DIGIT IS A `Digit1`, NOT A `Key1`. Beat thirteen answers the stopped row
    // with 1, and the app reads `e.key`, so the code only has to be honest
    // rather than matched on; a wrong one is still a lie in a harness that
    // exists to press what a person presses.
    code: named ? named.code : (/^[0-9]$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`),
    windowsVirtualKeyCode: named ? named.vk : k.toUpperCase().charCodeAt(0),
    // NO nativeVirtualKeyCode. It is a MAC keycode here, not a Windows one, and
    // macOS keycode 13 is the letter W. Measured on 2026-08-21: ⌘↵ sent with
    // nativeVirtualKeyCode 13 left the page receiving a trusted, auto-repeating
    // 'w' about four thousand times a second for the rest of the run, and the
    // next key pressed after that wedged the renderer outright. Chrome only
    // consults the native code when a modifier is down, which is why every
    // unmodified press in this harness has always been fine and ⌘↵ never was.
  };
  // A MODIFIED PRESS IS A rawKeyDown, NOT A keyDown WITH TEXT. Measured here on
  // 2026-08-21: ⌘↵ sent as a keyDown carrying '\r' left the page receiving a
  // trusted, auto-repeating 'w' about four thousand times a second for the rest
  // of the run, and any key pressed after that wedged the renderer outright.
  // Chrome only synthesises text for an unmodified press; handing it text under
  // a modifier is what produces the phantom.
  if (mods) {
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    return;
  }
  // A NAMED KEY CARRIES NO TEXT. Escape typed as text is a character nobody
  // listens for, and the modal would stay open with the run reading as a walk
  // that refused to move.
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...common, ...(named ? (enter ? { text: '\r' } : {}) : { text: k }) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
};
// A REAL PRESS OF THE MOUSE, AT A POINT ON THE SCREEN. The walk holds the
// beat with a capture-phase listener on the window, so a synthetic MouseEvent
// handed to a node proves nothing about whether it beats the app's own
// handlers to the press. This is what a person does: the browser dispatches
// it, in order, with the button really down.
const click = async (x, y) => {
  const common = { x, y, button: 'left', buttons: 1, clickCount: 1 };
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 });
};

// THE BOTTOM BAND, at real pixels. A full screen at 1440x900 shows anything
// small down there at about the size of a full stop, so this is the same shot
// clipped to the last 130 points of the window, which on a 2x page is 260 real
// pixels of the reply box and whatever is sitting on it. It was cut for the row
// of counting dots printed across the reply box; the dots are gone and the
// clip stays, because the reply box is still the one place
// in this walk where two things are drawn in the same inch.
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
  const t = (document.querySelector('.fr-tether.co-made') || document.querySelector('.fr-tether'));
  const rows = [...document.querySelectorAll('.list-pane .row')];
  // THE FIRST CHARACTER OF THE SENTENCE, not the paragraph box: a fixed <p> can
  // be as wide as it likes and still start where the letters do. The bug was
  // that this number did not match the row's title.
  let ink = null;
  if (t && t.firstChild) {
    const rg = document.createRange();
    rg.setStart(t.firstChild, 0);
    rg.setEnd(t.firstChild, Math.min(1, t.firstChild.length));
    const r = rg.getBoundingClientRect();
    ink = Math.round(r.left * 10) / 10;
  }
  const title = rows[0]?.querySelector('.subject')?.getBoundingClientRect();
  // WHAT IS DOWN BY THE REPLY BOX. The row of counting dots used to be printed
  // across it, and the dots have since been taken off altogether. What is
  // measured now is the way out, which is the only thing the
  // walk still draws over the app, and the answer wanted is that it is nowhere
  // near this box: it is up in the practice strip.
  const box = (el) => (el ? (({ top, right, bottom, left }) => ({
    top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(left),
  }))(el.getBoundingClientRect()) : null);
  const outEl = document.querySelector('.fr-out');
  const dockEl = document.querySelector('.dock-card');
  const out = box(outEl);
  const dock = box(dockEl);
  const overlap = (out && dock)
    ? Math.max(0, Math.min(out.bottom, dock.bottom) - Math.max(out.top, dock.top))
    : null;
  return {
    err: window.__ERR__ ?? null,
    sentence: t ? t.textContent : null,
    sentenceX: ink,
    titleX: title ? Math.round(title.left * 10) / 10 : null,
    misalignment: (ink != null && title) ? Math.round((ink - title.left) * 10) / 10 : null,
    out, dock, outOverDock: overlap,
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


// ------------------------------------------------------------------------ //



// ------------------------------------------------------------------------ //
// WHAT THE APP DREW, read off the real rectangles.
// ------------------------------------------------------------------------ //
const MEASURE = `(() => {
  const box = (el) => (el ? (({ x, y, width, height }) => ({
    x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height),
  }))(el.getBoundingClientRect()) : null);
  const ring = document.querySelector('.fr-ring');
  const card = document.querySelector('.fr-tether');
  // WHAT THE RING IS ROUND. The svg is drawn 10px bigger than the ring on every
  // side so the blur has somewhere to go, and the rect inside it is the ring.
  const rect = ring ? ring.querySelector('rect.halo') : null;
  const r = rect ? rect.getBoundingClientRect() : null;
  return {
    err: window.__ERR__ ?? null,
    screen: document.querySelector('.fr-screen') ? 'a setup screen' : 'the app',
    ring: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    strokes: ring ? [...ring.querySelectorAll('rect')].map((e) => e.getAttribute('class')) : null,
    card: box(card),
    quiet: card ? (card.querySelector('.fr-quiet')?.textContent ?? null) : null,
    loud: card ? (card.querySelector('.fr-loud')?.textContent ?? null) : null,
    theme: document.documentElement.getAttribute('data-theme'),
    skin: document.documentElement.getAttribute('data-skin'),
    out: (() => { const o = document.querySelector('.fr-out'); if (!o) return null;
      const r = o.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), say: o.textContent };
    })(),
    rows: [...document.querySelectorAll('.list-pane .row')].map((e) => e.querySelector('.subject')?.textContent ?? ''),
    buttons: [...document.querySelectorAll('.focus-actions button')].map((e) => e.textContent.trim()),
    // AND WHERE THEY ARE, so "the glow is on the button next door" is a number.
    buttonBoxes: [...document.querySelectorAll('.focus-actions button')].map(box),
    // The ring rect plus half its stroke.
    clear: r && card ? Math.round(card.getBoundingClientRect().top - (r.y + r.height)) : null,
    // THE THING ITSELF, AND ITS NEIGHBOURS.
    rx: rect ? Number(rect.getAttribute('rx')) : null,
    // THE THING THE RING IS SUPPOSED TO BE ROUND, measured beside the ring, so
    // "the ring is on it" is a number rather than a look at a picture. Added
    // 2026-08-23 after a band across the top of the window moved every ring 38
    // points down the screen and every existing check still passed. The
    // candidates are every anchor the walk uses.
    anchor: (() => {
      const sels = [
        'button[aria-label="New thread"]', '.modal.compose .dock-send',
        '.focus-actions .focus-resolve', 'button[aria-label="Commands"]',
        '.list-pane .row',
      ];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        // Whichever anchor this beat's ring is actually near.
        if (r && Math.abs(b.x - r.x) < 40 && Math.abs(b.y - r.y) < 60) {
          return { sel, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        }
      }
      return null;
    })(),
    rowBoxes: [...document.querySelectorAll('.list-pane .row')].map(box),
    // WHETHER THE CARD IS SITTING ON THE REPLY BOX. The beat that teaches how a
    // task ends is the one beat whose card is drawn low inside an open task,
    // and the reply box is directly under it. When that card grew a second
    // paragraph this session it landed eight points into the box, and the only
    // thing that caught it was somebody looking at a picture. It is a number
    // now: the overlap in points, 0 when they are clear.
    overDock: (() => {
      const d = document.querySelector('.dock-card');
      if (!d || !card) return null;
      const a = card.getBoundingClientRect();
      const b = d.getBoundingClientRect();
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      return (y > 0 && x > 0) ? Math.round(y) : 0;
    })(),
    // THE GAP THE LIST OPENS FOR THE CARD. Read as three separate facts rather
    // than one, because they fail separately: which row is marked, what depth
    // the pane was told, and what the rows after the marked one are really
    // transformed by. A shot where the depth is set and moved is 0 is a CSS
    // miss; one where marked is null is the component not having found the row.
    // No backticks in here: this whole block is inside a template literal on
    // its way to the browser.
    room: (() => {
      const pane = document.querySelector('.list-pane');
      const marked = document.querySelector('.list-pane .row[data-fr-room]');
      const after = marked ? marked.parentElement.querySelectorAll('.row[data-fr-room] ~ .row') : [];
      const moved = [...after].map((e) => {
        const t = getComputedStyle(e).transform;
        const m = t && t !== 'none' ? t.match(/matrix\(([^)]*)\)/) : null;
        return m ? Math.round(Number(m[1].split(',')[5])) : 0;
      });
      return {
        marked: marked ? marked.getAttribute('data-item-id') : null,
        room: pane ? pane.style.getPropertyValue('--fr-room') || null : null,
        moved,
      };
    })(),
    gapAbove: (() => {
      if (!r) return null;
      const above = [...document.querySelectorAll('.list-pane .row')]
        .map((e) => e.getBoundingClientRect()).filter((b) => b.bottom <= r.y + 2);
      return above.length ? Math.round(r.y - Math.max(...above.map((b) => b.bottom))) : null;
    })(),
    gapBelow: (() => {
      if (!r) return null;
      const below = [...document.querySelectorAll('.list-pane .row')]
        .map((e) => e.getBoundingClientRect()).filter((b) => b.top >= r.y + r.height - 2);
      return below.length ? Math.round(Math.min(...below.map((b) => b.top)) - (r.y + r.height)) : null;
    })(),
  };
})()`;

// WHATEVER THE PAGE SAYS OUT LOUD. A render loop pegs the thread and every
// evaluate below it simply times out, which tells you nothing; the console
// arrives over the wire and says which one.
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (m.params.type === 'error' || m.params.type === 'warning') console.log('  page:', t.slice(0, 300));
  }
  if (m.method === 'Inspector.targetCrashed' || m.method === 'Target.targetCrashed') {
    console.log('  the page CRASHED:', JSON.stringify(m.params ?? {}));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('  page threw:', (m.params.exceptionDetails.exception?.description ?? '').slice(0, 400));
  }
});

const WATCH = `(() => {
  if (window.__K__) return true;
  window.__K__ = [];
  addEventListener('keydown', (e) => window.__K__.push((e.isTrusted ? 'T' : 'S') + ':' + e.key), true);
  return true;
})()`;

const out = { beats: [] };
// WHAT WAS PICKED ON THE LOOK STEP, filled in when that step is driven and
// empty before it. Every beat after it is held to this.
//
// THE THEME AND NOT THE PICTURE, and that is not laziness. An empty inbox is
// the inbox-zero surface and it pins the default picture whatever the app is
// set to, which is a deliberate design decision and is still right. So the
// skin legitimately differs between a beat with rows and a beat without, and
// the thing that must NEVER differ is light against dark.
const PICKED = { theme: null, skin: null };

const beat = async (name, what) => {
  const flood = await evaluate(`(() => { const n = (window.__K__ || []).length; const k = [...new Set(window.__K__ || [])].slice(-4); window.__K__ = []; return JSON.stringify({ n, k }); })()`).catch(() => 'n/a');
  console.log('  keys since last beat:', flood);
  const m = await evaluate(MEASURE);
  if (m.err) console.log('  !! page error:', m.err);
  if (PICKED.theme && m.theme !== PICKED.theme) {
    throw new Error(`${name} is in ${m.theme} and the look step picked ${PICKED.theme}`);
  }
  // AND THE PICTURE TOO, which is the other half of her sentence: somebody who
  // picked one of the sixteen photographs was shown Gouache Valley on the five
  // beats with an empty inbox. The pin is off inside the walk now, so the skin
  // must not move either.
  if (PICKED.skin && m.skin !== PICKED.skin) {
    throw new Error(`${name} is wearing ${m.skin} and the look step picked ${PICKED.skin}`);
  }
  const kb = await shot(name);
  out.beats.push({ name, what, kb, ...m });
  console.log(`  ${name.padEnd(28)} ${m.screen.padEnd(15)} ${m.theme}${m.skin ? '/' + m.skin : ''}${m.out ? `  way out at ${m.out.x},${m.out.y}` : ''}`);
  if (m.quiet) console.log(`     "${m.quiet}"  /  "${m.loud}"`);
  if (m.anchor) console.log(`     anchor ${m.anchor.sel} ${m.anchor.w}x${m.anchor.h} at ${m.anchor.x},${m.anchor.y}  -> ring offset ${m.ring.x - m.anchor.x},${m.ring.y - m.anchor.y}`);
  if (m.ring) console.log(`     ring ${m.ring.w}x${m.ring.h} at ${m.ring.x},${m.ring.y}  rx ${m.rx}  card ${m.clear}px under it  air above ${m.gapAbove} below ${m.gapBelow}`);
  if (m.overDock) console.log(`     THE CARD IS ON THE REPLY BOX by ${m.overDock}px`);
  if (m.rowBoxes && m.rowBoxes.length) console.log(`     rowboxes ${JSON.stringify(m.rowBoxes)}`);
  if (m.rows.length) console.log(`     rows ${JSON.stringify(m.rows)}`);
  if (m.buttons.length) console.log(`     bar  ${JSON.stringify(m.buttons)} ${JSON.stringify(m.buttonBoxes)}`);
  return m;
};
const until = async (expr, ms = 12_000) => {
  for (let i = 0; i < ms / 200; i += 1) {
    if (await evaluate(expr)) return true;
    await wait(200);
  }
  return false;
};

// ------------------------------------------------------------------------ //
await goto(origin);
// AND IT SEEDS NO LOOK. It used to write the lake into both keys here, which is
// exactly what `seedFirstRunLook` does on a real first run — so the app's own
// seed never ran and every shot of the walk was of a Mac that had already been
// set up. She changed the default that evening and the harness would have gone
// on photographing the old one.
await evaluate(`(() => { localStorage.clear(); return true; })()`);
// AND WHAT THE MAC WAS ALREADY WEARING, WHICH IS THE STATE THE FAULT LIVES IN.
// Cleared, this is a fresh install: `seedFirstRunLook` fires, writes Gouache
// Valley into both keys, and every screen of the walk inherits it whether it
// pins anything or not. That is why this harness has never once photographed
// her bug.
//
// SHE IS NOT ON A FRESH INSTALL. She reaches the walk from ⌘K's "Run the
// onboarding again", on a store months old that has already chosen a look, so
// the seed does not fire and never should. WAS=light is that Mac: set up, plain
// light, no picture. WAS=<skin id> is the other case, somebody already wearing
// one of the sixteen. Default is the fresh install, so every existing shot is
// taken exactly as it was before.
const WAS = process.env.WAS ?? null;
if (WAS) {
  const theme = WAS === 'light' || WAS === 'dark' ? WAS : 'dark';
  const skin = WAS === 'light' || WAS === 'dark' ? 'none' : WAS;
  await evaluate(`(() => {
    localStorage.setItem('zero.theme', ${JSON.stringify('')} + ${JSON.stringify(theme)});
    localStorage.setItem('zero.skin', ${JSON.stringify(skin)});
    return true;
  })()`);
  console.log('the Mac was already :', theme + (skin === 'none' ? '' : '/' + skin));
}
await goto(origin + (process.env.NOVEIL === '1' ? '/?noveil=1' : (process.env.NOCOACH7 === '1' ? '/?nocoach7=1' : '')));
await evaluate(`(async () => { await document.fonts.ready; })()`);
await evaluate(WATCH);
await wait(2400);

// A CONTROL, for when a beat stops answering: the same app with the walk
// already finished and one row in the inbox, opened with the same key. If this
// wedges too then it is the harness or the pane and not the walk.
if (process.env.CONTROL === '1') {
  await evaluate(`(() => { localStorage.setItem('zero.firstRun.done','1'); return true; })()`);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    addEventListener('DOMContentLoaded', () => {});
    (() => {
      const now = Date.now();
      const s = window.__SNAP__;
      if (!s) return;
      window.__SNAP__ = { ...s,
        products: [{ slug: 'agentbox-v2', name: 'Agentbox v2', oneLiner: '', repoPath: ${JSON.stringify(folder)} }],
        items: [{ id: 'w-one', product: 'agentbox-v2', productName: 'Agentbox v2', status: 'open',
          kind: 'question', title: 'Which of these two names should the project use?', body: '',
          result: 'Example. Both are free.', labels: ['founder'], priority: 5, epoch: 1, claim: null,
          createdAt: now - 60000, updatedAt: now,
          wrote: { title: { ts: now - 60000, source: 'founder' },
                   body: { ts: now - 60000, source: 'founder' },
                   result: { ts: now, source: 'agent' } } }] };
    })();
  ` });
  await goto(origin);
  await wait(2500);
  console.log('  control: rows', JSON.stringify(await evaluate(`[...document.querySelectorAll('.list-pane .row .subject')].map((e) => e.textContent)`)));
  await key('Enter'); await wait(1500);
  console.log('  control: pane', await evaluate(`(() => !!document.querySelector('.focus-pane'))()`));
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}

console.log('\n=== 1 to 3: the setup screens ===');
const first = await beat('01-welcome', 'the welcome, corner to corner');
// AND EVERY SCREEN FROM HERE TO THE PICKER IS HELD TO THIS ONE. The hold used
// to start AFTER the picker, so the six screens before it were the one stretch
// of the walk nothing checked, and that is precisely where the fault was: the
// walk started on the valley theme and switched to light mode on the first
// introduction slab.
//
// The walk may change its look ONCE, on the screen whose whole purpose is that,
// and the change has to be one the user made. Anything else is the app arguing
// with itself in front of them.
PICKED.theme = first.theme;
PICKED.skin = first.skin;
console.log('  the walk opens in  :', first.theme + (first.skin ? '/' + first.skin : ''));
if (!first.skin) throw new Error(`the walk opened on ${first.theme} with no picture on it`);

// This script used to photograph the way out here, on the welcome, because it
// used to be on every screen. It is photographed on the first practice beat
// now, and what is checked here is its ABSENCE.
if (await evaluate(`!!document.querySelector('.fr-out')`)) {
  throw new Error('the way out is on the welcome screen, and it belongs off the setup screens');
}

await key('Enter'); await wait(1500);
// THE FOLDER SCREEN IS A LIST NOW (w-ec62ab6b38). This Mac has no recent
// conversations, so the list is the one row that opens the chooser, and Return
// takes it; the chooser answers with the folder and the walk goes straight on.
await beat('02-where-is-your-code', 'the folders to pick from, and the chooser as the last row');
await key('Enter'); await wait(1200);
await beat('03-what-is-it-called', 'the name, taken from the folder');
await key('Enter'); await wait(2600);

// THE INTRODUCTION, IN FRONT OF THE APP.Four screens, each one leaving on
// Enter, and none of them is the app.
console.log('\n=== 4 to 6: what this is, before anything is pressed ===');
await beat('04-your-agents-get-an-inbox', 'the first slab, words at reading size');
await key('Enter'); await wait(800);
// The old headline on this slab was hard to read and was replaced. The
// file name moves with the slab, because a shot folder that goes on saying
// the old headline is how a session reads the wrong screen off the right
// picture.
await beat('05-one-sentence-and-an-agent-does-the-work', 'the second slab');
// AND THE PIECE IS MEASURED RATHER THAN LOOKED AT. The rule for all three of
// them is that they run off the right edge of the window and are never scaled,
// so a piece whose right edge is INSIDE the window is a piece that has been
// sized by its content instead. Printed, because squinting at a screenshot is
// how the last two rounds of this got the answer wrong.
console.log('     piece   :', JSON.stringify(await evaluate(`(() => {
  const p = document.querySelector('.fr-piece');
  const box = (e) => (e ? { x: Math.round(e.getBoundingClientRect().x), right: Math.round(e.getBoundingClientRect().right), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) } : null);
  return { win: innerWidth, piece: box(p) };
})()`)));
await key('Enter'); await wait(800);
// THE SIDEBAR SLAB WAS THIRD FOR ONE DAY AND WAS MOVED OUT. It is beat
// seventeen now, `17-your-goals-live-here` below.
await beat('06-leave-no-agent-waiting-on-you', 'the last slab, which is the positioning said early');
await key('Enter'); await wait(800);

// THE MOUSE RULE HAD A SCREEN HERE AND IT WAS CUT. The old shot was
// 07-put-the-mouse-down.
//
// SO IT IS DRIVEN HERE, AFTER THE INTRODUCTION AND BEFORE THE HAND-OFF, which
// is the first of the two places it could go. It was between the name and the
// introduction until this morning.
//
// FOUR TILES NOW, NOT EIGHTEEN, so there are three shots rather than two and the
// middle one is new. The row is the picture being shown plus Dark, Light and
// Match my system, and the sixteen pictures are reached through Randomize my
// theme. That makes the button a thing this harness has to press, because a
// randomiser nobody drives is a claim rather than a feature.
console.log('\n=== 7: pick how it looks, last before the practice round ===');
// THE PICKER OPENS ON WHAT THE SIX SCREENS BEFORE IT WERE WEARING, and this is
// the line that says so. It is checked BEFORE the hold is released, so a picker
// that snaps back to the store on arrival stops the run rather than being
// photographed. That snap is the second half of the bug: extending the pin
// alone would have moved the flip from beat four to beat seven.
//
// Then the hold comes off, because the next three shots are of tiles being
// pressed and the window is meant to move under them.
await beat('07a-pick-how-agentbox-looks', 'four tiles, on the default');
const openedOn = { theme: PICKED.theme, skin: PICKED.skin };
PICKED.theme = null;
PICKED.skin = null;
const lookOpened = await evaluate(`(() => {
  const on = document.querySelector('.look.on .look-name');
  return {
    lit: on ? on.textContent : null,
    skin: document.documentElement.getAttribute('data-skin'),
    tiles: [...document.querySelectorAll('.look .look-name')].map((n) => n.textContent),
    behind: document.querySelectorAll('.fr-look-app .list-pane .row').length,
  };
})()`);
console.log('     on      :', JSON.stringify(lookOpened));
if (lookOpened.tiles.length !== 4) throw new Error(`the row is meant to be four tiles, it is ${lookOpened.tiles.length}`);
if (!lookOpened.behind) throw new Error('there is no app behind the card, so the step is a wallpaper again');
// AND THE TICKED TILE IS THE PICTURE THE WINDOW IS ACTUALLY SHOWING. This is
// the half that painting could never have fixed: with the pin extended and
// nothing else, the picker still read the store on arrival and opened white
// with Light ticked. Truthful, and a flip. The tick and the window agree here
// or the run stops.
if (lookOpened.skin !== openedOn.skin) {
  throw new Error(`the picker opened wearing ${lookOpened.skin} and the six screens before it wore ${openedOn.skin}`);
}
// RANDOMIZE, AND READ THE WINDOW BACK. If `data-skin` does not move, the button
// is a picture of a button.
await evaluate(`document.querySelector('.fr-look-more').click()`);
await wait(700);
await beat('07b-a-different-picture', 'Randomize pressed: a new picture, on the tile and on the window');
const rolled = await evaluate(`(() => ({
  lit: (document.querySelector('.look.on .look-name') || {}).textContent || null,
  skin: document.documentElement.getAttribute('data-skin'),
  stored: localStorage.getItem('zero.skin'),
}))()`);
console.log('     rolled  :', JSON.stringify(rolled));
if (rolled.skin === lookOpened.skin) throw new Error('Randomize my theme did not move the window');
// AND A PLAIN THEME, which is the other half of the row and the only press that
// takes the photograph off altogether.
await evaluate(`(() => { const t = [...document.querySelectorAll('.look')].find((b) => b.textContent.trim().startsWith('Light')); if (t) t.click(); return !!t; })()`);
await wait(700);
await beat('07c-and-the-window-changes', 'Light pressed, and the whole screen wearing it');
console.log('     after   :', JSON.stringify(await evaluate(`(() => ({
  lit: (document.querySelector('.look.on .look-name') || {}).textContent || null,
  theme: document.documentElement.getAttribute('data-theme'),
  skin: document.documentElement.getAttribute('data-skin'),
  stored: localStorage.getItem('zero.theme'),
}))()`)));
// AND BACK TO A PICTURE, because the rest of the walk is the app somebody chose
// and not a picture of some other theme.
//
// THIS IS THE LINE THAT PUT HER TUTORIAL IN LIGHT MODE.
//
// It used to look for a tile whose name starts with "Gouache Valley", and after
// Randomize was pressed six lines above there is no such tile: the first slot
// holds whichever of the sixteen came out of the bag, and the other three are
// Dark, Light and Match my system. `find` returned undefined, `if (t)` skipped
// the click WITHOUT SAYING SO, and the walk carried the Light press from 07c
// through every beat after it. Beats 9, 10 and 17 to 19 looked right anyway,
// because an empty inbox pins dark and the picture whatever the app is set to,
// so it was exactly the six tutorial beats with rows on them that came out
// white. That is the block of white screens in the middle of her page.
//
// So it presses THE FIRST TILE, which is the picture slot whatever picture is
// in it, and then reads the window back and throws. A restore that can fail
// silently is how a whole page of screens gets taken in the wrong theme.
//
// KEEP=light WALKS THE REST IN LIGHT INSTEAD, and it is not a curiosity: it is
// the exact machine she photographed. Her page of nineteen was taken with Light
// left on by accident, and the answer she wants to see is that a walk in Light
// is light on EVERY beat rather than white on six and dark on five. So this run
// leaves the Light press standing rather than pressing back, and `beat` holds
// all nineteen to it the same way.
const KEEP = process.env.KEEP ?? 'picture';
await evaluate(KEEP === 'light'
  ? `(() => { const t = [...document.querySelectorAll('.look')].find((b) => b.textContent.trim().startsWith('Light')); if (t) t.click(); return !!t; })()`
  : `(() => { const t = document.querySelector('.look'); if (t) t.click(); return !!t; })()`);
await wait(700);
const restored = await evaluate(`(() => ({
  lit: (document.querySelector('.look.on .look-name') || {}).textContent || null,
  theme: document.documentElement.getAttribute('data-theme'),
  skin: document.documentElement.getAttribute('data-skin'),
  stored: localStorage.getItem('zero.theme'),
}))()`);
console.log('     back to :', JSON.stringify(restored));
if (KEEP === 'light') {
  if (restored.theme !== 'light') throw new Error(`KEEP=light did not leave the window in light: ${JSON.stringify(restored)}`);
} else if (restored.theme !== 'dark' || !restored.skin) {
  throw new Error(`the look step did not go back to a picture: ${JSON.stringify(restored)}`);
}
/*
 * AND `SKIN=lake` PINS THE PICTURE FOR THE REST OF THE WALK. WHY THIS EXISTS, because it looks like a convenience and is not:
   the beat above PRESSES Randomize, deliberately, and then keeps whichever of
   the sixteen came out of the bag. That is right for a run photographing the
   walk once. It is WRONG the moment the same walk is run twice to lay one card
   beside another, because then every picture is different and the comparison
   is of wallpapers rather than cards. The chosen card is GLASS, whose whole
   question is how the photograph reads THROUGH it, so a different photograph
   per run is exactly the confound that would make the comparison worthless.
   IT IS SET AFTER THE PICKER AND READ BACK, never assumed. `zero.skin` is the
   key the app itself stores it under (`skins.ts`), and the picker is already
   shut by the time this runs, so nothing on screen contradicts it. */
if (process.env.SKIN) {
  await evaluate(`(() => {
    localStorage.setItem('zero.skin', ${JSON.stringify(process.env.SKIN)});
    document.documentElement.setAttribute('data-skin', ${JSON.stringify(process.env.SKIN)});
    return true;
  })()`);
  await wait(500);
  const pinned = await evaluate(`document.documentElement.getAttribute('data-skin')`);
  if (pinned !== process.env.SKIN) throw new Error(`SKIN=${process.env.SKIN} did not take: the window is wearing ${pinned}`);
  restored.skin = pinned;
  console.log('     pinned  :', pinned);
}
// WHAT THE REST OF THE WALK HAS TO BE WEARING. Read once, here, off the window
// rather than off what we think we pressed, and every beat after this is held
// to it by `beat` itself.
PICKED.theme = restored.theme;
PICKED.skin = restored.skin;
await key('Enter'); await wait(900);

console.log('\n=== 8: into the practice project ===');
await beat('08-this-is-a-practice-project', 'nothing in here is yours, and it names neither project');
await key('Enter'); await wait(2600);

console.log('\n=== 9: make a task, on the real empty practice inbox ===');
await beat('09-make-a-task', 'the band, the whole app at full size, the ring on the plus');

const outBox = await evaluate(`(() => {
  const b = document.querySelector('.fr-out');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return {
    text: b.textContent, opacity: Number(cs.opacity),
    fromRight: Math.round(innerWidth - r.right), fromBottom: Math.round(innerHeight - r.bottom),
    w: Math.round(r.width), h: Math.round(r.height),
  };
})()`);
console.log('     way out :', JSON.stringify(outBox));
if (!outBox) throw new Error('there is no way out of the walk on the first practice beat');
if (outBox.opacity > 0.6) throw new Error(`the way out is not low-key, it is at ${outBox.opacity}`);
await evaluate(`document.querySelector('.fr-out').click()`);
await wait(500);
await beat('09b-a-quiet-way-out', 'the way out, and the card that asks them to stay');
console.log('     stay    :', JSON.stringify(await evaluate(`(() => {
  const c = document.querySelector('.fr-stay');
  return c ? { head: c.querySelector('.fr-stay-head').textContent, keep: c.querySelector('.fr-stay-keep').textContent, go: c.querySelector('.fr-stay-go').textContent } : null;
})()`)));
await evaluate(`document.querySelector('.fr-stay-keep').click()`);
await wait(400);
if (await evaluate(`!!document.querySelector('.fr-stay')`)) throw new Error('Keep going did not close the card');

// AND THE OTHER HALF OF THE HOLD, ON THE BEAT WHERE IT IS EASIEST TO GET WRONG.
// Beat nine's ring is round the plus in the top right corner and NOTHING ELSE
// on this screen may be pressed. A lock that refuses everything is easy; a lock
// that still lets the one right thing through is the whole design, and the
// opposite risk matters as much: a click that does nothing at all makes the
// app look dead. So both are driven with a real mouse: the settings gear
// beside the plus, which must do nothing, and then the plus itself, which must
// open the compose card. THE CARD IS COMPARED WITH ITSELF, NOT WITH A SENTENCE
// TYPED IN HERE (2026-08-28, folding the two rounds together). This read the
// beat's words off a literal, and the other round on the walk reworded that
// very beat the same afternoon, so the check failed saying "the card moved"
// while the card had not moved at all. What it is really asking is whether the
// click disturbed the beat, and that question is answered by reading the card
// before and after.
const cardBefore = await evaluate(`(document.querySelector('.fr-loud') || {}).textContent || null`);
const gearBox = await evaluate(`(() => {
  const g = document.querySelector('button[aria-label="Settings"], .top-actions button:last-of-type');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
if (gearBox) {
  const gear = JSON.parse(gearBox);
  await click(gear.x, gear.y);
  await wait(400);
  const after = JSON.parse(await evaluate(`JSON.stringify({
    settings: !!document.querySelector('.settings'),
    modal: !!document.querySelector('.modal-backdrop'),
    // THE LOUD LINE, because the grey one is optional since and a beat that has
    // none draws no fr-quiet span at all. Every beat has a loud one.
    card: (document.querySelector('.fr-loud') || {}).textContent || null,
  })`));
  console.log('     the corner beside the plus, clicked :', JSON.stringify(after));
  if (after.settings || after.modal) throw new Error('a click beside the plus opened something');
  if (!after.card) throw new Error('the click took the card off the screen');
  if (after.card !== cardBefore) throw new Error(`the card moved: ${JSON.stringify(cardBefore)} -> ${JSON.stringify(after.card)}`);
}
// AND THE PLUS ITSELF STILL WORKS, clicked rather than pressed. The ring is
// round it, so it is by definition the one thing this beat is about.
const plusBox = await evaluate(`(() => {
  const b = document.querySelector('button[aria-label="New thread"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
if (!plusBox) throw new Error('the plus is not drawn on the beat whose ring is round it');
const plus = JSON.parse(plusBox);
await click(plus.x, plus.y);
await wait(900);
const opened = await evaluate(`!!document.querySelector('.modal.compose')`);
console.log('     the plus, clicked :', opened ? 'the compose card opened' : 'NOTHING');
if (!opened) throw new Error('the walk locked the one thing its own ring is round');
// And back out of it, so the beat is driven by its own key below exactly as it
// always was and every existing shot is taken the same way.
await key('Escape'); await wait(600);
if (await evaluate(`!!document.querySelector('.modal.compose')`)) throw new Error('the compose card would not close again');

console.log('\n=== 10: start it ===');
await key('c'); await wait(1600);
await beat('10-start-it', 'the compose card, the ring on Start');

console.log('\n=== 11: it runs, and it comes back ===');
await key('Enter', 4); await wait(2600);
await beat('11a-it-is-running', 'the row, working');
await until(`(() => document.querySelectorAll('.list-pane .row').length > 0 && !!document.querySelector('.fr-quiet') && document.querySelector('.fr-quiet').textContent.startsWith('It ran'))()`);
await wait(900);
await beat('11b-open-it', 'it landed in the inbox and she opens it');

console.log('\n=== 12: end it ===');
if (process.env.WHERE === '1') await call('Debugger.enable');
if (process.env.PROBE === '1') {
  // WHERE THE KEY GOES. A capture listener before every other, a bubble
  // listener after, and the key dispatched from a timer so the evaluate that
  // sets this up returns before the press happens. Whatever is missing when
  // the page stops answering is the handler that did not come back.
  await evaluate(`(() => {
    window.__K__ = [];
    addEventListener('keydown', (e) => window.__K__.push((e.isTrusted ? 'T' : 'S') + ':' + e.key + ':' + (e.target && e.target.className ? String(e.target.className).slice(0, 40) : e.target && e.target.tagName)), true);
    setTimeout(() => {
      window.__K__.push('dispatching');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      window.__K__.push('returned');
    }, 400);
    return true;
  })()`);
  for (let i = 0; i < 12; i += 1) {
    await wait(250);
    const id = nextId++;
    const seen = await new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 2000);
      pending.set(id, (m) => { clearTimeout(timer); resolve(m.result?.result?.value ?? '?'); });
      ws.send(JSON.stringify({ id, sessionId, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({ n: window.__K__.length, first: [...new Set(window.__K__)].slice(0, 8), last: window.__K__.slice(-4) })', returnByValue: true } }));
    });
    console.log(`  +${(i + 1) * 250}ms  ${seen ?? 'NO ANSWER'}`);
    if (seen === null) break;
  }
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}
if (process.env.CLICK === '1') {
  await evaluate(`(() => { const r = document.querySelector('.list-pane .row'); if (r) r.click(); return !!r; })()`);
} else await key(process.env.KEY7 || 'Enter');
if (process.env.TRACE === '1') {
  await wait(1200);
  const pic = await new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 8000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m.result?.data ?? null); });
    ws.send(JSON.stringify({ id, sessionId, method: 'Page.captureScreenshot', params: { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } } }));
  });
  if (pic) { fs.writeFileSync('/tmp/wedged.png', Buffer.from(pic, 'base64')); console.log('  wrote /tmp/wedged.png'); }
  else console.log('  the compositor did not answer either');
  for (let i = 0; i < 20; i += 1) {
    await wait(300);
    const id = nextId++;
    const answered = await new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 2500);
      pending.set(id, (m) => { clearTimeout(timer); resolve(m.result?.result?.value ?? 'no value'); });
      ws.send(JSON.stringify({ id, sessionId, method: 'Runtime.evaluate', params: {
        expression: `JSON.stringify({ step: JSON.parse(localStorage.getItem('zero.firstRun') || '{}').step, pane: !!document.querySelector('.focus-pane'), dock: !!document.querySelector('.focus-dock'), tether: !!document.querySelector('.fr-tether') })`,
        returnByValue: true } }));
    });
    console.log(`  +${(i + 1) * 300}ms  ${answered ?? 'NO ANSWER'}`);
    if (answered === null) break;
  }
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}
await wait(1400);
if (process.env.WHERE === '1') {
  // WHERE THE THREAD IS, when it is not answering. A hung renderer times every
  // evaluate out and says nothing; pausing it prints the stack that is looping.
  const stack = await new Promise((resolve) => {
    const on = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Debugger.paused') { ws.removeEventListener('message', on); resolve(m.params.callFrames); }
    };
    ws.addEventListener('message', on);
    call('Debugger.pause');
    setTimeout(() => resolve(null), 8000);
  });
  console.log('  stack:', JSON.stringify((stack ?? []).slice(0, 14).map((f) => `${f.functionName || '(anon)'} @ ${f.location.lineNumber}:${f.location.columnNumber}`), null, 1));
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}
await beat('12-end-it', 'the ring on close this task, and two verbs in the bar');

// THE PANEL ON THE RIGHT.It is here rather than at the end of the walk because
// an empty inbox draws the inbox-zero surface and no rail at all: the beat sat
// after the tab tour for one build and the shot of it is an empty screen.
console.log('\n=== 13: the sidebar note ===');
// CLOSING HER OWN TASK IS WHAT STAGES THE FOUR WAITING ROWS, and those arriving
// is this beat. The E used to be at the head of the next section.
await key('e'); await wait(2600);
await until(`(() => { const q = document.querySelector('.fr-quiet'); return !!q && q.textContent.startsWith('Anything you write'); })()`, 9000);
await wait(700);
await beat('13-the-sidebar-note', 'the ring on the sidebar note, with the practice project\'s real note in it');
console.log('     note    :', JSON.stringify(await evaluate(`(() => {
  const n = document.querySelector('.rail-note');
  const t = (n ? n.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 90);
  const r = n ? n.getBoundingClientRect() : null;
  return { text: t, box: r ? { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) } : null };
})()`)));
await key('Enter'); await wait(1400);

console.log('\n=== 14: the first one that is finished ===');
await beat('14a-this-one-is-finished', 'four rows, the ring on the first finished one, and the card about that row alone');

// THE RING IS ON A ROW, NOT ON WHATEVER THE LIST DREW FIRST. Read as an id,
// because "there is a ring somewhere" is what the old shots proved and it is
// not the thing that was wrong.
const finished = [1, 2].map((n) => `w-p${n}`);
const ringedAt = async () => evaluate(`(() => {
  const r = document.querySelector('.fr-ring');
  if (!r) return null;
  const b = r.getBoundingClientRect();
  const rows = [...document.querySelectorAll('.list-pane .row')];
  const mid = b.top + b.height / 2;
  const on = rows.find((e) => { const q = e.getBoundingClientRect(); return mid >= q.top && mid <= q.bottom; });
  return on ? on.getAttribute('data-item-id') : null;
})()`);
const ring1 = await ringedAt();
console.log('     ring on :', ring1, '(want', finished[0] + ')');
if (ring1 !== finished[0]) throw new Error(`the clearing beat rings ${ring1}, not the first finished row ${finished[0]}`);
const card1 = await evaluate(`(document.querySelector('.fr-quiet') || {}).textContent || null`);
console.log('     card    :', JSON.stringify(card1));
// AND THE FIRST OF THE TWO CARRIES THE UNDO LESSON IN ITS QUIET LINE. Both
// halves are checked, so a fold that quietly drops her sentence fails the run
// rather than the shot.
if (!card1 || !card1.startsWith('This one is finished.')) throw new Error(`the card says ${JSON.stringify(card1)}`);
if (!/\bZ\b/.test(card1)) throw new Error(`the card lost the undo lesson: ${JSON.stringify(card1)}`);

// AND HER E, ON THE ROW IT IS WRONG FOR, PRESSED HERE ON PURPOSE. This beat
// asks for E and E is the right key, so the wrong-key cap at 15b below cannot
// see this: the key is right and the ROW is wrong.
//
// The ledger says why. The four rows were taken in this order, seconds apart:
// the STOPPED one, closed with E; the two finished ones; the one that is not
// for today, snoozed. Every beat ends on "that row
// left the inbox", so beat 16 opened with its row eleven seconds gone and was
// over in the render it began in. The press 1 card was never drawn.
//
// So the stopped row is walked to and E is pressed on it, and the count is read
// before and after: if the row goes, the fix is not there whatever was said.
const stopped = `w-p${PRACTICE_ROWS.findIndex((r) => r.waiting) + 1}`;
await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown'); await wait(300);
const beforeWrongRow = await evaluate(`document.querySelectorAll('.list-pane .row').length`);
await key('e'); await wait(500);
const wrongRow = await evaluate(`(() => ({
  rows: document.querySelectorAll('.list-pane .row').length,
  stillThere: !!document.querySelector('.list-pane .row[data-item-id="${stopped}"]'),
  said: (document.querySelector('.toast') || {}).textContent || null,
  pulsing: !!document.querySelector('.fr-wrong'),
  card: (document.querySelector('.fr-quiet') || {}).textContent || null,
}))()`);
console.log('     E on it :', JSON.stringify({ before: beforeWrongRow, ...wrongRow }));
if (wrongRow.rows !== beforeWrongRow || !wrongRow.stillThere) {
  throw new Error(`E closed the stopped row: ${beforeWrongRow} rows became ${wrongRow.rows}`);
}
// AND NOTHING ELSE ON THE SCREEN SAYS ANYTHING. The press used to reach the
// app, which refused it in a toast at the foot of the window while the card
// beside the list was still saying press E.So the press is answered by the
// cap, the way a wrong key already is, and there is one instruction on the
// screen.
if (!wrongRow.pulsing) throw new Error('E on the wrong row was stopped but the cap never answered it');
if (wrongRow.said) throw new Error(`a second instruction was drawn as well: ${JSON.stringify(wrongRow.said)}`);
if (!wrongRow.card?.startsWith('This one is finished.')) throw new Error(`the card moved off its row: ${JSON.stringify(wrongRow.card)}`);
await beat('14a2-e-on-the-agent-that-is-stopped', 'E on the row an agent is stopped on: the cap answers, the row stays, and nothing else on the screen speaks');

// AND THE SAME PRESS WITH THE MOUSE, WHICH IS HOW SHE MADE IT. Her screenshot
// has the hover underline on the stopped row, and the E key acts on the row
// under the POINTER when there is one (`pointed` in App.tsx), so the arrow-key
// walk above is not her press: the keyboard's row and the pointer's row are two
// different targets and only one of them was ever driven here. This drives the
// other one.
await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${stopped}"]');
  if (!row) return false;
  row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  return true;
})()`);
await wait(250);
const beforeHover = await evaluate(`document.querySelectorAll('.list-pane .row').length`);
await key('e'); await wait(500);
const hovered = await evaluate(`(() => ({
  rows: document.querySelectorAll('.list-pane .row').length,
  stillThere: !!document.querySelector('.list-pane .row[data-item-id="${stopped}"]'),
  said: (document.querySelector('.toast') || {}).textContent || null,
  card: (document.querySelector('.fr-quiet') || {}).textContent || null,
}))()`);
console.log('     E under the pointer :', JSON.stringify({ before: beforeHover, ...hovered }));
if (hovered.rows !== beforeHover || !hovered.stillThere) throw new Error(`E under the pointer closed the stopped row: ${beforeHover} became ${hovered.rows}`);
if (hovered.said) throw new Error(`the toast came back under the pointer: ${JSON.stringify(hovered.said)}`);
if (!hovered.card?.startsWith('This one is finished.')) throw new Error(`the card moved: ${JSON.stringify(hovered.card)}`);
// AND WHAT THAT ROW IS PRINTING WHILE THE POINTER IS ON IT. Her screenshot has
// "R Reply E Close" at the right end of the stopped row. Neither key does
// anything there: R is a wrong key on this beat and E is the right key on the
// wrong row, so both are promises the app breaks. The hint is drawn after
// HINT_WAIT, so this waits for it rather than reading too early.
await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${stopped}"]');
  if (row) row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  return true;
})()`);
await wait(1400);
const promised = await evaluate(`(() => {
  const say = (id) => {
    const row = document.querySelector('.list-pane .row[data-item-id="' + id + '"]');
    const keys = row ? row.querySelector('.row-keys') : null;
    return keys ? [...keys.querySelectorAll('kbd')].map((k) => k.textContent) : [];
  };
  return { stopped: say('${stopped}'), hinted: document.querySelectorAll('.row-keys').length };
})()`);
console.log('     keys promised on the stopped row :', JSON.stringify(promised));
if (promised.stopped.length) throw new Error(`the stopped row promises ${JSON.stringify(promised.stopped)} and the walk eats all of it`);
await beat('14a3-e-with-the-pointer-on-it', 'her own press: the pointer on the stopped row, E, and still one instruction on the screen');

// AND THE ROW THE BEAT IS ABOUT STILL SAYS ITS ONE KEY, so this is not a hint
// switched off, it is a hint told the truth.
await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${finished[0]}"]');
  if (row) row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  return true;
})()`);
await wait(1400);
const onTheRing = await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${finished[0]}"]');
  const keys = row ? row.querySelector('.row-keys') : null;
  return keys ? [...keys.querySelectorAll('kbd')].map((k) => k.textContent) : [];
})()`);
console.log('     keys promised on the ringed row  :', JSON.stringify(onTheRing));
if (JSON.stringify(onTheRing) !== JSON.stringify(['E'])) throw new Error(`the ringed row promises ${JSON.stringify(onTheRing)}, wanted just E`);
// AND THE SAME ROW CLICKED, WHICH IS WHAT MARGARETTE ACTUALLY DID. The two
// presses above are the KEY half of this beat, settled on 08-27. Her half is
// the mouse.
//
// AND IT IS A REAL TRUSTED PRESS, dispatched by the browser at a point on the
// screen, not a synthetic MouseEvent handed to a node. The lock is a
// capture-phase listener on the window and a synthetic event would prove
// nothing about whether it beats the app's own handlers to it.
//
// THE ANSWER IS MEASURED OFF THE PAINTED PIXELS, mid-animation, the way every
// other number in this file is read off the app's own rectangles. The veil is
// dimmer for half a second and the ring is thicker; both come from
// getComputedStyle WHILE the animation is running, so a rule that exists in the
// stylesheet and never reaches the screen fails the run rather than the shot.
const restingVeil = await evaluate(`(() => {
  const v = document.querySelector('.fr-veil');
  const h = document.querySelector('.fr-ring .halo');
  return JSON.stringify({
    veil: v ? getComputedStyle(v).backgroundColor : null,
    stroke: h ? getComputedStyle(h).strokeWidth : null,
    knocked: !!document.querySelector('.fr-veil.fr-knock'),
  });
})()`);
console.log('     at rest :', restingVeil);
await beat('14a4-before-the-stray-click', 'the beat at rest: the ring on the row it is about, and four rows she could click on');
const strayBox = await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${stopped}"]');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
if (!strayBox) throw new Error('the row to click on is not drawn');
const stray = JSON.parse(strayBox);
console.log('     clicking the stopped row at', stray.x + ',' + stray.y);
const beforeClick = JSON.parse(await evaluate(`JSON.stringify({
  rows: document.querySelectorAll('.list-pane .row').length,
  opened: !!document.querySelector('.focus-pane'),
  card: (document.querySelector('.fr-quiet') || {}).textContent || null,
})`));
await click(stray.x, stray.y);
// A THIRD OF THE WAY THROUGH THE 620ms, which is where the keyframes peak.
await wait(190);
const answered = JSON.parse(await evaluate(`(() => {
  const v = document.querySelector('.fr-veil');
  const h = document.querySelector('.fr-ring .halo');
  return JSON.stringify({
    rows: document.querySelectorAll('.list-pane .row').length,
    opened: !!document.querySelector('.focus-pane'),
    card: (document.querySelector('.fr-quiet') || {}).textContent || null,
    said: (document.querySelector('.toast') || {}).textContent || null,
    veil: v ? getComputedStyle(v).backgroundColor : null,
    stroke: h ? getComputedStyle(h).strokeWidth : null,
    capPulsing: !!document.querySelector('.fr-wrong'),
  });
})()`));
console.log('     answered:', JSON.stringify(answered));
// NOTHING HAPPENED TO THE APP. This is the whole of the founder's ask.
if (answered.opened || beforeClick.opened) throw new Error('the click opened the agent conversation');
if (answered.rows !== beforeClick.rows) throw new Error(`the click changed the list: ${beforeClick.rows} rows became ${answered.rows}`);
if (answered.card !== beforeClick.card) throw new Error(`the card moved off its row: ${JSON.stringify(answered.card)}`);
// AND NOTHING WAS SAID.
if (answered.said) throw new Error(`a sentence was drawn at her as well: ${JSON.stringify(answered.said)}`);
// AND THE WALK ANSWERED. A click that does nothing at all is a dead app.
if (!answered.capPulsing) throw new Error('the click was refused and the cap never answered it');
const alpha = (c) => Number((String(c).match(/rgba?\(([^)]+)\)/) || [])[1]?.split(',')[3] ?? 1);
const rest = JSON.parse(restingVeil);
if (!(alpha(answered.veil) > alpha(rest.veil))) {
  throw new Error(`the veil did not deepen: ${rest.veil} -> ${answered.veil}`);
}
if (!(parseFloat(answered.stroke) > parseFloat(rest.stroke))) {
  throw new Error(`the ring did not swell: ${rest.stroke} -> ${answered.stroke}`);
}
console.log(`     veil ${rest.veil} -> ${answered.veil}   ring ${rest.stroke} -> ${answered.stroke}`);
await shot('14a5-the-walk-answers-the-stray-click');
out.knock = { at: stray, rest, answered, before: beforeClick };
await wait(700);
const doorBox = await evaluate(`(() => {
  const b = document.querySelector('.fr-out');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
if (!doorBox) throw new Error('the way out is not drawn during the practice round');
const outAt = JSON.parse(doorBox);
await click(outAt.x, outAt.y);
await wait(400);
const doorOpened = await evaluate(`!!document.querySelector('.fr-stay-scrim')`);
if (!doorOpened) throw new Error('Skip was clicked during the hold and the card never appeared');
console.log('     the way out still opens on a click');
// And back into the walk, because the run is not over: "Keep going" is the
// button this test is not about pressing.
const keepBox = await evaluate(`(() => {
  const k = document.querySelector('.fr-stay-keep');
  if (!k) return null;
  const r = k.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
if (!keepBox) throw new Error('the leave card has no way back into the walk');
const keepAt = JSON.parse(keepBox);
await click(keepAt.x, keepAt.y);
await wait(400);
if (await evaluate(`!!document.querySelector('.fr-stay-scrim')`)) throw new Error('the leave card would not close again');

// And the pointer off it again, so the arrow keys below are the target once more.
await evaluate(`(() => {
  const row = document.querySelector('.list-pane .row[data-item-id="${stopped}"]');
  if (row) row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  return true;
})()`);
await wait(250);
// Back to the top, because the two rows this beat is really about are up there.
await key('ArrowUp'); await key('ArrowUp'); await key('ArrowUp'); await wait(300);
// CLEARED THE WAY A PERSON WOULD: E on each row, which is what the card says.
// AND CLEARING THEM IS THE WHOLE BEAT NOW. There used to be a second half here,
// the empty inbox held for four seconds under a card saying "This is inbox
// zero. Get back here every day. it "said 'that's it' or somehting even tho
// onboarding continued". It is deleted, so the third E goes straight on to ⌘K.
// AND THE LIGHTS ARE PHOTOGRAPHED HALF WAY THROUGH, because a picture of three
// unlit keys proves nothing about whether they ever light. One press, one shot,
// then the other two. The count they read is the number of rows LEFT in the
// list, not a tally of key presses, so this shot is also the check that those
// two agree.
await key('e'); await wait(700);
// AND THE FIRST LIGHT REALLY IS FILLED IN NOW. It never was: the lights counted
// EVERY row in the pane against the two presses, and four rows minus two lights
// floors at zero, so both keys stayed empty for the whole beat and this shot
// has been photographing them empty since the snooze row went in on 08-24.
// Measured 2026-08-27 before the fix: 4 rows nothing lit, 3 nothing, 2 nothing.
const mid = await evaluate(`(() => ({
  lit: document.querySelectorAll('.fr-lights .fr-lit').length,
  of: document.querySelectorAll('.fr-lights kbd').length,
  ring: (() => {
    const r = document.querySelector('.fr-ring');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    const mid = b.top + b.height / 2;
    const on = [...document.querySelectorAll('.list-pane .row')].find((e) => { const q = e.getBoundingClientRect(); return mid >= q.top && mid <= q.bottom; });
    return on ? on.getAttribute('data-item-id') : null;
  })(),
  card: (document.querySelector('.fr-quiet') || {}).textContent || null,
}))()`);
console.log('     halfway :', JSON.stringify(mid));
if (mid.lit !== 1 || mid.of !== 2) throw new Error(`one press in, ${mid.lit} of ${mid.of} lights are filled`);
if (mid.ring !== finished[1]) throw new Error(`the ring stayed on ${mid.ring} instead of moving to ${finished[1]}`);
if (mid.card !== 'This one is finished too.') throw new Error(`the second card says ${JSON.stringify(mid.card)}`);
await beat('14b-one-is-out', 'one row gone, the first light filled in, the ring moved to the other finished row, and the undo bar readable');
await key('e'); await wait(1400);

// ROUND FOUR'S WHOLE POINT (2026-08-24). The third row is not finished: an
// agent is stopped on it waiting for an answer, and the walk used to tell
// somebody to close it with E, which leaves the agent stopped for good and the
// inbox empty with nothing running.
//
// So this beat is opened and ANSWERED, in two halves, the way a person would.
//
// The fourth practice row is real work that is nobody's emergency, so E is
// wrong on it and answering it is not on offer. S is what it is for, and S is
// the app's own key: nothing was added to make this beat work.
console.log('\n=== 15: the one that is not for today ===');
await until(`(() => { const q = document.querySelector('.fr-quiet'); return !!q && q.textContent.startsWith('Real work, but not for today'); })()`, 8000);
await wait(600);
await beat('15a-not-for-today', 'the row that is real work and not urgent, with S on the card');

// AND HER E, PRESSED HERE, ON PURPOSE.
//
// THIS IS THAT EXACT PRESS. E closes a row, this beat asks for S, and before
// today E went through and closed the row this beat is about. The row count is
// read before and after, so this is a measurement rather than a screenshot of a
// pulse: if the count moves, the fix is not there whatever the cap did.
const before = await evaluate(`document.querySelectorAll('.list-pane .row').length`);
await key('e'); await wait(220);
await beat('15b-the-wrong-key-does-nothing', 'E pressed on the beat that asks for S: the cap answers and the row stays');
const wrong = await evaluate(`(() => ({
  rows: document.querySelectorAll('.list-pane .row').length,
  pulsing: !!document.querySelector('.fr-wrong'),
  step: (document.querySelector('.fr-quiet') || {}).textContent || null,
}))()`);
console.log('     wrong E :', JSON.stringify({ before, ...wrong }));
if (wrong.rows !== before) throw new Error(`E closed a row: ${before} rows became ${wrong.rows}`);
if (!wrong.pulsing) throw new Error('E was swallowed but the cap never answered it');
await wait(700);

await key('s'); await wait(1200);
await beat('15c-when-should-it-come-back', 'the picker, and the card over it saying what it is for');
await evaluate(`(() => { const b = [...document.querySelectorAll('.modal.snooze .palette-item')].find((e) => /Tomorrow/.test(e.textContent)); if (b) b.click(); return !!b; })()`);
await wait(2200);

console.log('\n=== 16: the one that is not finished ===');
await beat('16a-one-is-waiting', 'the last row, and the card says an agent is stopped on it');
await key('Enter'); await wait(1500);
await beat('16b-answer-it', 'the options it offered, with the ring on them');
await key('1'); await wait(2600);

// ROUND FOUR'S SECOND HALF. The walk never said what the other two tabs were,
// so somebody finished it having only ever seen the Inbox, and an empty inbox
// with no idea where the work went reads as an app with nothing in it.
//
// Three presses of Tab, one per tab, driven the way a person drives it.
console.log('\n=== 17: where it all went ===');
await until(`(() => { const q = document.querySelector('.fr-quiet'); return !!q && q.textContent.startsWith('Great!'); })()`, 8000);
await wait(600);
await beat('17a-your-inbox-is-empty', 'inbox zero, and the ring on the tab the next press goes to');
// ⌘1 TO ⌘4, NOT TAB. Tab stopped moving between views on 2026-09-23, and the
// tour rings the sidebar's rows since w-ec62ab6b38. The order is the sidebar's:
// In progress, Scheduled, Closed, then back to Inbox.
await key('2', 4); await wait(1200);
// FOUR TABS SINCE THE SNOOZE BEAT WENT IN. Snoozing a row gives the app a
// Scheduled tab it did not have a minute earlier, and the tour has to say what
// it is like it says what the other two are. Driving this is how the four was
// found: three presses used to land back on the inbox and now they land on
// Closed, and the walk stood still at the end of its own tour.
await beat('17b-the-agent-is-working', 'In progress, holding the agent she answered rather than closed');
await key('3', 4); await wait(1200);
await beat('17c-the-one-you-put-off', 'Scheduled, holding the row she snoozed rather than closed');
await key('4', 4); await wait(1200);
await beat('17d-everything-you-finished', 'Closed, holding her own task and the two she closed');
await key('1', 4); await wait(1600);

console.log('\n=== 18: ⌘K, over an empty inbox with an agent running ===');
await until(`(() => { const q = document.querySelector('.fr-quiet'); return !!q && q.textContent.startsWith('Everything you just did'); })()`, 8000);
await wait(600);
await beat('18a-the-command-bar', 'back on the empty inbox, with the ring on the command key');
await evaluate(`(() => { const b = document.querySelector('button[aria-label="Commands"]'); if (b) b.click(); return !!b; })()`);
await wait(1200);
await beat('18b-the-palette', 'the palette, open for as long as the user wants to look at it');

console.log('\n=== 19: bring your agents across ===');
// AND CLOSING THE PALETTE BRINGS THE LAST QUESTION.
//
// AND IT IS ONLY THE QUESTION NOW.The celebration is on the landing, two shots
// below.
await key('Escape'); await wait(1800);
await beat('19-bring-your-agents-across', 'the question, first line of the card, with her own agents under it');

// WHAT THE TWO SIDES OF THE SWITCH REALLY SHOW, pressed rather than reasoned
// about. TABS=1, because it clicks the card and every shot after it would
// otherwise be of a card somebody had been poking.
if (process.env.TABS === '1') {
  const read = `(() => ({
    side: [...document.querySelectorAll('.fr-side')].map((b) => b.textContent),
    on: document.querySelector('.fr-side.on')?.textContent ?? null,
    listed: [...document.querySelectorAll('.fr-agent-name')].map((e) => e.textContent),
    empty: document.querySelector('.fr-empty')?.textContent ?? null,
  }))()`;
  console.log('  every project :', JSON.stringify(await evaluate(read)));
  await evaluate(`(() => { const b = [...document.querySelectorAll('.fr-side')][1]; if (b) b.click(); return !!b; })()`);
  await wait(600);
  console.log('  this project  :', JSON.stringify(await evaluate(read)));
  await evaluate(`(() => { const b = [...document.querySelectorAll('.fr-side')][0]; if (b) b.click(); return !!b; })()`);
  await wait(400);
}

// WHAT HAS BEEN WRITTEN BY THE TIME THE CARD IS UP, and what is written when
// the button goes down.
const wrote = async (when) => {
  const log = await evaluate(`JSON.stringify((window.__LOG__ || []).filter((e) => e.what === 'setProjectSetting'))`);
  console.log('  writes ' + when + ':', log);
};
await wrote('while the card is up');

// AND THE LAST TWO BEATS ARE HELD TOO, WHEN A PICTURE WAS PICKED.
//
// Beats 20 and 21 are the user's own project on their own empty inbox, which is
// the inbox-zero surface.
//
// KEEP=light STILL RELEASES, and that is the inbox-zero design decision doing
// what it is meant to. Plain Light with no picture on is the case that decision
// covers, so that walk lands on the dark photograph on purpose. Turning that off
// as well would be one clause in App.tsx, and this line is where the run would
// stop releasing.
if (KEEP === 'light') {
  PICKED.theme = null;
  PICKED.skin = null;
}

console.log('\n=== 20: landing in her own project, with the confetti ===');
await evaluate(`(() => { const b = document.querySelector('.fr-finish-go'); if (b) b.click(); return !!b; })()`);
await wait(700);
await beat('20-you-are-ready', 'her own project, her own inbox, and the confetti falling over it');
console.log('     landing :', JSON.stringify(await evaluate(`(() => {
  const l = document.querySelector('.fr-landed');
  return {
    up: !!l,
    bits: document.querySelectorAll('.fr-bit').length,
    says: (document.querySelector('.fr-landed-head') || {}).textContent || null,
    line: (document.querySelector('.fr-landed-line') || {}).textContent || null,
    takesClicks: l ? getComputedStyle(l).pointerEvents : null,
  };
})()`)));
// AND IT TAKES ITSELF DOWN. Nothing has to be pressed to get past it, which is
// the whole difference from the card it came off.
await wait(5200);
await beat('21-the-walk-is-over', 'their own project, empty, with the confetti gone by itself');
console.log('     after   :', JSON.stringify(await evaluate(`(() => ({ landing: !!document.querySelector('.fr-landed'), rows: document.querySelectorAll('.list-pane .row').length }))()`)));
await wrote('after the button ');

// AND THE WAY BACK IN, FROM ⌘K.Typed rather than clicked, because the row has
// to be FOUND by a word she would reach for.
if (process.env.AGAIN === '1') {
  console.log('\n=== ⌘K, and the walk again ===');
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="Commands"]'); if (b) b.click(); return !!b; })()`);
  await wait(900);
  for (const ch of 'onboarding') await key(ch);
  await wait(700);
  const rows = await evaluate(`[...document.querySelectorAll('.pal-row, .palette-row, [class*="pal"] [class*="row"]')].map((e) => e.textContent).slice(0, 6)`);
  console.log('  matched      :', JSON.stringify(rows));
  await shot('12a-the-row-in-command-k');
  await key('Enter');
  await wait(1600);
  const back = await evaluate(`(() => ({
    screen: !!document.querySelector('.fr-screen'),
    head: document.querySelector('.fr-head')?.textContent ?? null,
    doneKey: localStorage.getItem('zero.firstRun.done'),
    kept: Object.keys(localStorage).filter((k) => k.startsWith('zero.')).sort(),
  }))()`);
  console.log('  after Enter  :', JSON.stringify(back));
  await shot('12b-the-walk-again-from-command-k');
}

fs.writeFileSync(path.join(outDir, 'walk.json'), JSON.stringify(out, null, 2));
console.log('\nwrote walk.json,', out.beats.length, 'beats');
ws.close(); chrome.kill(); server.close(); process.exit(0);
