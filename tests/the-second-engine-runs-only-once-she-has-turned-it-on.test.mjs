// THE SWITCH THAT COULD OPEN THE GATE, BUILT AND LEFT OFF.
//
// `shared/engines.mjs` has answered Claude Code for every row on every machine
// since it came back, because `engineFor` refuses without `ENGINE_CHOICE_ENABLED`
// and nothing anywhere held that Symbol. This is the slice that builds the way
// it CAN be handed over, and it deliberately changes no default: with nothing
// written in `zero.config.json`, a row carrying `engine: "codex"` still spawns
// `claudeBin`, which is the tripwire in
// tests/a-codex-row-from-august-still-runs-on-claude.test.mjs and is kept in
// that exact form.
//
// THE OPT-IN IS A MOMENT, NOT A FLAG, AND THAT IS THE WHOLE ARGUMENT OF THIS
// FILE.
//
// `engine` survived the 2026-08-27 removal on the work-item contract
// (`WORK_ITEM_FIELDS`, shared/work-items.mjs:95), and the fold drops nothing, so
// an existing store may still hold rows marked `engine: "codex"` between 08-25
// and 08-27. They cannot be counted from here; on a machine with a store it is
// `grep -rho '"engine":"[a-z]*"' ~/Zero | sort | uniq -c`. A boolean
// opt-in would mean "every row that ever said codex is live from now on", and
// the first thing it would do is route an unknown number of August rows to a
// second engine with no picker, no byline saying which engine ran, and no
// warning. That is precisely the hazard the gate was built for, so an opt-in
// that walks straight into it is not an opt-in worth having.
//
// THE TWO ARE SEPARABLE, AND THE LEDGER ALREADY HOLDS WHAT SEPARATES THEM. The
// fold records `wrote[field] = { ts, source }` per field and stops deleting it
// on the way out precisely because readers needed it (shared/work-items.mjs:324;
// shared/answers.mjs reads `wrote.answer.ts` the same way). So "Codex may be
// chosen from now on" is a real, checkable statement: honour a row's `engine`
// only when `wrote.engine.ts` is at or after the moment she opened the gate.
// An August row is not a choice she is making now, so it is not honoured, and
// nothing routes anywhere she did not ask for.
//
// WHAT IS NOT CLAIMED. `wrote.engine.source` is NOT consulted. It would be the
// stronger rule -- only she may put a row on the second engine -- but CLAUDE.md
// is explicit that a ledger line names its own author as a plain string and
// nothing checks it, so a source check would be defence against an accident and
// never against a hostile worker, and it would silently refuse whatever a
// future picker happens to write. The timestamp is the rule; who may write
// `engine` at all belongs to the slice that draws the picker.
//
// AND THE WORKSPACE DEFAULT IS NOT TIME-SCOPED, because it cannot be: JSON has
// no per-key write times, and `engine` and the opt-in sit in the same file, so
// opening that file to write the moment is the same act as reading the `engine`
// line above it. Said out loud here rather than left to be discovered.
//
// HOW THE HAZARD SURFACES. Twice over. It does not happen, which is the real
// answer; and when a row IS refused for being stale the supervisor says so once
// per row, naming the row, both dates and what to do about it -- so opting in
// and looking at the log is the count nobody could take from here.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The one seam, as in the sibling files: `main/supervisor.mjs` imports `spawn`
// at module scope, so this is the only place between the app's choice of
// executable and a real process.
const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      return { stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

import { engineChoiceSince, engineChoiceOnRowIsStale, engineFor, ENGINE_CHOICE_ENABLED } from '../shared/engines.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { loadConfig } from '../main/config.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const AUGUST = Date.parse('2026-08-26T11:00:00Z');
const OPENED = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-09-04T09:00:00Z');

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';

const dirs = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

// A row exactly as it comes off her ledger: text, parsed, folded. Built this
// way and not as a literal because the whole rule below reads `wrote.engine.ts`,
// which only the real fold puts there -- a hand-made object would be testing
// the assertion rather than the ledger.
function ledgerRow(lines) {
  const item = foldWorkItems(lines.map((l) => JSON.parse(JSON.stringify({ id: 'w-250cd74811', source: 'founder', ...l })))).get('w-250cd74811');
  return { ...item, product: 'agentbox' };
}

const codexRowFrom = (ts) => ledgerRow([
  { ts: ts - 1000, patch: { title: 'try the second engine', status: 'open' } },
  { ts, patch: { engine: 'codex' } },
]);

function build(config = {}) {
  const dir = tempDir('engine-choice-');
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
      ...config,
    },
    {
      listItems: () => [], listProducts: () => [product], isDue: () => true,
      settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  sup._spawnCodexWorker = vi.fn(() => ({ stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} }));
  return { sup, product };
}

// The trace stream opens on a later tick; letting one pass keeps teardown from
// racing it. It cannot fail the run any more (see
// tests/a-run-whose-trace-cannot-be-written-still-runs.test.mjs), this is only
// so the temp folders stay tidy.
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

beforeEach(() => { spawns.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ===================== nothing opens the gate on its own ================== */

describe('the second engine is off until she writes the moment she turned it on', () => {
  // THE EXISTING TRIPWIRE, AT THE LEVEL THIS SLICE ADDS: a fresh install has no
  // config file at all, and an August row still runs Claude Code.
  // CHANGED 2026-10-05 (w-db6f5e331e): a machine with no zero.config.json now
  // writes its own first launch as the moment, because a new person with both
  // engines could otherwise never use Codex
  // (tests/a-new-install-with-both-engines-can-use-codex.test.mjs). What this
  // test is for still holds: the moment is NOW, so an August row is still
  // older than it and still runs Claude Code.
  it('opens at first launch on a machine with no zero.config.json, and an August row still runs Claude Code', async () => {
    const appDir = tempDir('engine-choice-app-');
    const config = loadConfig(appDir, { home: '/nonexistent-home' });

    expect(engineChoiceSince(config)).toBeGreaterThan(AUGUST);

    // claudeFound is pinned because loadConfig looks for the real Claude Code on
    // this machine, and GitHub's runners have none, so the row fell back to
    // Codex there for that reason alone (red on every push, 2026-10-01). What
    // this test is about is the gate, on a Mac that has both.
    const { sup } = build({ ...config, claudeFound: true, claudeBin: CLAUDE_BIN, codexBin: CODEX_BIN, storeRoot: tempDir('engine-choice-store-') });
    sup.store.listProducts = () => [{ slug: 'agentbox', dir: sup.config.storeRoot, repoPath: null }];
    expect(sup._engineFor(codexRowFrom(AUGUST))).toBe('claude');

    sup.spawnWorker(codexRowFrom(AUGUST));
    await settle();
    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect(sup._spawnCodexWorker).not.toHaveBeenCalled();
  });

  // AND THE ROW SHE WOULD MAKE TODAY, which is the one an opt-in is for: even a
  // choice made this minute is refused while nobody has opted in. Without this
  // the test above could pass because the row is old rather than because the
  // gate is shut.
  it('is off for a choice made this minute, not only for an August one', () => {
    const { sup } = build({ codexBin: CODEX_BIN });
    expect(sup._engineFor(codexRowFrom(Date.now()))).toBe('claude');
    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('claude');
  });

  // The workspace half of the old rule, which is what a Settings screen would
  // write. Same answer while the gate is shut.
  it('is off even when the workspace config itself says codex', async () => {
    const { sup } = build({ codexBin: CODEX_BIN, engine: 'codex' });
    expect(sup._engineFor(ledgerRow([{ ts: AFTER, patch: { status: 'open' } }]))).toBe('claude');

    sup.spawnWorker(codexRowFrom(AFTER));
    await settle();
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
  });
});

/* ======================= the moment it was written ======================== */

describe('once she has written the moment, a choice she makes now is honoured', () => {
  it('routes a row she marked after that moment to codex, and really spawns it there', async () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });

    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('codex');

    sup.spawnWorker(codexRowFrom(AFTER));
    await settle();
    expect(spawns).toHaveLength(0);
    expect(sup._spawnCodexWorker).toHaveBeenCalledTimes(1);
    expect(sup.sessions.get('w-250cd74811').engine).toBe('codex');
  });

  it('takes the workspace default when the row itself says nothing', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED, engine: 'codex' });
    expect(sup._engineFor(ledgerRow([{ ts: AFTER, patch: { status: 'open' } }]))).toBe('codex');
  });

  // Her choice on the row outranks the workspace, in both directions.
  it('lets the row outrank the workspace either way', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED, engine: 'claude' });
    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('codex');

    const other = build({ codexBin: CODEX_BIN, engineChoice: OPENED, engine: 'codex' });
    const claudeRow = ledgerRow([
      { ts: AFTER - 1000, patch: { status: 'open' } },
      { ts: AFTER, patch: { engine: 'claude' } },
    ]);
    expect(other.sup._engineFor(claudeRow)).toBe('claude');
  });

  // A date with no time in it is the shape a human actually writes.
  it('takes a plain date as well as a full timestamp', () => {
    expect(engineChoiceSince({ engineChoice: '2026-09-04' })).toBe(Date.parse('2026-09-04T00:00:00Z'));
    expect(engineChoiceSince({ engineChoice: OPENED })).toBe(Date.parse(OPENED));
    expect(engineChoiceSince({ engineChoice: '2026-09-04T09:30:00+02:00' })).toBe(Date.parse('2026-09-04T09:30:00+02:00'));
  });
});

/* ================= the case that must NOT match: no codex ================ */

describe('opting in on a mac with no codex is claude code, and nothing dies', () => {
  // She may opt in on the laptop that has Codex and read the same store on one
  // that does not. A session that never starts tells her nothing about why, so
  // the run happens on the engine that is here.
  it('falls back to claude code and still runs the row', async () => {
    const { sup } = build({ codexBin: null, engineChoice: OPENED });

    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('claude');

    expect(() => sup.spawnWorker(codexRowFrom(AFTER))).not.toThrow();
    await settle();
    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect(sup._spawnCodexWorker).not.toHaveBeenCalled();
    expect(sup.sessions.get('w-250cd74811').engine).toBe('claude');
  });

  // AND WHERE THAT null COMES FROM. `codexBin` is not taken on trust from
  // `zero.config.json`: main/config.mjs runs it through the real finder, which
  // stats it, and a path that is not there resolves to null rather than to a
  // process that dies on arrival. Asserted through `loadConfig` on a path that
  // exists and one that does not, so it holds on a Mac with Codex and on one
  // without.
  it('reads codexBin through the finder rather than believing the file', () => {
    const appDir = tempDir('engine-choice-app-');
    const missing = join(appDir, 'no-codex-here');
    writeFileSync(join(appDir, 'zero.config.json'), JSON.stringify({ codexBin: missing, engineChoice: OPENED }));
    const gone = loadConfig(appDir, { home: '/nonexistent-home' });
    expect(gone.codexBinConfigured).toBe(missing);
    expect(gone.codexFound).toBe(false);
    expect(gone.codexBin).toBe(null);
    expect(engineFor({ engine: 'codex' }, { config: gone, found: { codex: !!gone.codexBin }, enabled: ENGINE_CHOICE_ENABLED })).toBe('claude');

    const real = join(appDir, 'codex');
    writeFileSync(real, '#!/bin/sh\n');
    writeFileSync(join(appDir, 'zero.config.json'), JSON.stringify({ codexBin: real, engineChoice: OPENED }));
    const here = loadConfig(appDir, { home: '/nonexistent-home' });
    expect(here.codexFound).toBe(true);
    expect(here.codexBin).toBe(real);
  });
});

/* ==================== a garbage opt-in is an opt-in of nothing ============ */

describe('an opt-in that is not a moment is read as off, never as on', () => {
  // EVERY ONE OF THESE IS SOMETHING SOMEBODY MIGHT PLAUSIBLY WRITE, and the
  // last four are the ones that catch a lazy `Date.parse`: V8 will happily read
  // "1", "2026", "Sep 4 2026" and "2026/09/04" as dates, so a bare parse would
  // let `"engineChoice": "1"` open the second engine.
  const rubbish = [
    true, false, 1, 0, null, undefined, {}, [], Symbol('now'),
    'true', 'yes', 'on', 'enabled', 'codex', 'claude', '', ' ', 'now', 'today',
    '2026-13-45', '2026-09', 'not a date',
    '1', '2026', 'Sep 4 2026', '2026/09/04',
  ];

  it('reads none of them as a moment', () => {
    for (const engineChoice of rubbish) {
      expect(engineChoiceSince({ engineChoice })).toBe(null);
    }
  });

  it('runs claude code for every one of them, on a mac that has codex', () => {
    for (const engineChoice of rubbish) {
      const { sup } = build({ codexBin: CODEX_BIN, engineChoice, engine: 'codex' });
      expect(sup._engineFor(codexRowFrom(AFTER))).toBe('claude');
    }
  });

  // THE CASE THAT MUST NOT MATCH: the one shape that IS an opt-in still works,
  // so the list above is refusing rubbish rather than refusing everything.
  it('still opens on the one shape that is a moment', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('codex');
  });
});

/* ======================= the August rows, and saying so ================== */

describe('a row marked codex before she opted in is not what she just asked for', () => {
  let warned;
  beforeEach(() => { warned = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warned.mockRestore(); });

  it('runs on claude code even with the gate open and codex on the mac', async () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    const august = codexRowFrom(AUGUST);

    expect(august.engine).toBe('codex');
    expect(august.wrote.engine.ts).toBe(AUGUST);
    expect(sup._engineFor(august)).toBe('claude');

    sup.spawnWorker(august);
    await settle();
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect(sup._spawnCodexWorker).not.toHaveBeenCalled();
  });

  // NOT SILENTLY.
  it('says which row it was, and when the choice was made', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    sup._engineFor(codexRowFrom(AUGUST));

    expect(warned).toHaveBeenCalledTimes(1);
    const said = warned.mock.calls[0].join(' ');
    expect(said).toMatch(/w-250cd74811/);
    expect(said).toMatch(/Codex/);
    expect(said).toMatch(/2026-08-26/);
    expect(said).toMatch(/2026-09-04/);
  });

  // ONCE PER ROW. `_engineFor` is asked on every tick by the queue, the cap and
  // the spawn, so a line per call would be a line every few seconds forever.
  it('says it once, however many times the fleet asks about that row', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    for (let i = 0; i < 20; i += 1) sup._engineFor(codexRowFrom(AUGUST));
    expect(warned).toHaveBeenCalledTimes(1);
  });

  // THE CASE THAT MUST NOT MATCH, twice over: a row she marked after opting in
  // is not stale and says nothing, and neither does a row that names no engine
  // at all. A warning on either of those is noise on every ordinary row.
  it('says nothing about a row she marked since, or about one with no engine', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    sup._engineFor(codexRowFrom(AFTER));
    sup._engineFor(ledgerRow([{ ts: AFTER, patch: { status: 'open' } }]));
    sup._engineFor(ledgerRow([{ ts: AUGUST, patch: { status: 'open' } }]));
    expect(warned).not.toHaveBeenCalled();
  });

  // THE BOUNDARY EITHER SIDE OF THE MOMENT. At it is hers; one millisecond
  // before it is not.
  it('honours a choice made at the moment itself and refuses one a millisecond earlier', () => {
    const at = Date.parse(OPENED);
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup._engineFor(codexRowFrom(at))).toBe('codex');
    expect(sup._engineFor(codexRowFrom(at - 1))).toBe('claude');
  });

  // A ROW WITH NO `wrote` MAP AT ALL is an old line or an imported session
  // (renderer/src/byline.ts says the same of it). There is no evidence she
  // chose anything, so there is no choice to honour.
  it('refuses an engine on a row that carries no write time for it', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup._engineFor({ id: 'w-imported', engine: 'codex' })).toBe('claude');
    expect(sup._engineFor({ id: 'w-imported', engine: 'codex', wrote: {} })).toBe('claude');
    expect(sup._engineFor({ id: 'w-imported', engine: 'codex', wrote: { engine: {} } })).toBe('claude');
    expect(sup._engineFor({ id: 'w-imported', engine: 'codex', wrote: { engine: { ts: 'later' } } })).toBe('claude');
  });

  // The predicate on its own, so the rule can be read without a supervisor.
  it('is a rule about the row and the moment, and nothing else', () => {
    const open = { engineChoice: OPENED };
    expect(engineChoiceOnRowIsStale(codexRowFrom(AUGUST), open)).toBe(true);
    expect(engineChoiceOnRowIsStale(codexRowFrom(AFTER), open)).toBe(false);
    // Nobody opted in: there is no moment to be stale against, and the gate
    // itself is what refuses.
    expect(engineChoiceOnRowIsStale(codexRowFrom(AUGUST), {})).toBe(false);
    // A row naming no engine, or a name nothing recognises, asks for nothing.
    expect(engineChoiceOnRowIsStale(ledgerRow([{ ts: AUGUST, patch: { status: 'open' } }]), open)).toBe(false);
    expect(engineChoiceOnRowIsStale(null, open)).toBe(false);
  });
});

/* ================= the token is still out of reach of data =============== */

describe('nothing that arrived as data can open the gate', () => {
  // The opt-in lives in `zero.config.json`, which is JSON, and the rows live in
  // the ledger, which is JSON. Neither can spell a Symbol. What the config
  // grants is not the token itself but the supervisor's decision to hand the
  // token over, and that decision is made in source, in one method.
  it('cannot be opened by an `enabled` that came through JSON', () => {
    const forged = JSON.parse(JSON.stringify({
      enabled: ENGINE_CHOICE_ENABLED,
      config: { engine: 'codex', engineChoice: OPENED },
      found: { codex: true },
    }));
    expect(forged.enabled).toBeUndefined();
    expect(engineFor(codexRowFrom(AFTER), forged)).toBe('claude');
  });

  // A ROW CANNOT OPT ITSELF IN. The moment is a fact about the workspace, read
  // off the config; nothing on the item is consulted for it, so a ledger line
  // carrying the words cannot grant itself the second engine.
  it('cannot be opened by a row that carries the opt-in on itself', () => {
    const { sup } = build({ codexBin: CODEX_BIN });
    for (const extra of [
      { engineChoice: OPENED },
      { enabled: ENGINE_CHOICE_ENABLED },
      { config: { engineChoice: OPENED } },
    ]) {
      expect(sup._engineFor({ ...codexRowFrom(AFTER), ...extra })).toBe('claude');
    }
  });

  // AND THE SUPERVISOR HOLDS THE TOKEN, WHICH IS WHY THE LINE ABOVE IS THE ONLY
  // GUARD LEFT. Deleting the `engineChoice` from a config that had one shuts the
  // gate again on the same instance, so the token is not held open by anything
  // that happened earlier.
  it('shuts again the moment the opt-in is taken out of the config', () => {
    const { sup } = build({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('codex');
    delete sup.config.engineChoice;
    expect(sup._engineFor(codexRowFrom(AFTER))).toBe('claude');
  });
});
