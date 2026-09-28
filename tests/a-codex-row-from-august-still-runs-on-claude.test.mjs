// A ROW SHE MARKED `codex` IN AUGUST MUST NOT START RUNNING ON CODEX BECAUSE
// WE PUT THE ENGINE RULE BACK.
//
// Fourteen files went, this module's `shared/engines.mjs` among them (counted
// with `git diff-tree --diff-filter=D -r 258d71d`; her commit message says
// thirteen).
//
// WHAT DID NOT GO IS THE FIELD. `engine` is still a live name on the work-item
// contract — `WORK_ITEM_FIELDS` at shared/work-items.mjs:95, accepted by the
// patch validator at :290, which stores it as a free string and deliberately
// validates nothing because "nothing here reads them". So the ledger has been
// able to carry `engine: "codex"` continuously since 08-25. That is a claim
// about the fold, so the third block below PROVES it through the real
// `foldWorkItems` rather than asserting it in a comment: a JSON line off disk,
// folded, still has the field.
//
// HOW MANY SUCH ROWS SHE HAS IS UNKNOWN AND DELIBERATELY NOT GUESSED AT HERE.
// There is no ~/Zero on the machine this was written on, so the count could
// not be taken. On her Mac it is
// `grep -rho '"engine":"[a-z]*"' ~/Zero | sort | uniq -c`.
//
// Restoring the 08-25 resolver unchanged would have read those rows and
// honoured them the moment the module landed: no picker anywhere, nothing in
// Settings, no approval path built, and a row quietly spawning on the engine
// she asked us to remove. So `engineFor` now takes a capability gate that is
// CLOSED unless a caller passes `ENGINE_CHOICE_ENABLED`, the module's own
// Symbol, and a closed gate answers Claude Code whatever the row and the
// workspace say.
//
// The fourth block is the one that would actually catch a bypass. Everything
// above it tests a pure function, and a routing bug does not have to go
// through a pure function. So it folds a real `engine: "codex"` line, hands it
// to the REAL `Supervisor.spawnWorker` with only `child_process.spawn`
// stubbed, and reads back which executable the app chose. That is the failure
// this slice exists to prevent, observed where it would actually happen.
//
// The measurement under the default itself is from the day she asked for
// Codex, head to head on her Mac, identical task, four fresh repos each: Codex
// 16.8 / 45.3 / 96.9 / 18.6 seconds, Claude Code 19.0 / 19.8 / 19.8 / 21.2.
// Both correct every run. Codex is slower on median and it wanders, which is
// why Claude Code is the answer this file keeps insisting on.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// The one seam. `main/supervisor.mjs` imports `spawn` at module scope, so this
// is the only place a test can stand between the app's choice of executable
// and a real process. Nothing else about child_process is touched.
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

import {
  ENGINES,
  ENGINE_IDS,
  DEFAULT_ENGINE,
  ENGINE_CHOICE_ENABLED,
  isEngine,
  engineLabel,
  availableEngines,
  engineChoiceExists,
  engineFor,
  enginePicked,
} from '../shared/engines.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

const BOTH = { codex: true };
const ONLY_CLAUDE = { codex: false };
const OPEN = { enabled: ENGINE_CHOICE_ENABLED };

describe('a codex row from August still runs on Claude Code', () => {
  // THE CASE THAT MUST NOT MATCH, and the reason this slice exists at all.
  it('does not honour a persisted codex choice while the gate is closed', () => {
    const august = { id: 'w-250cd74811', engine: 'codex' };
    expect(engineFor(august)).toBe('claude');
    expect(engineFor(august, {})).toBe('claude');
    expect(engineFor(august, { found: BOTH })).toBe('claude');
    expect(engineFor(august, { config: { engine: 'codex' }, found: BOTH })).toBe('claude');
  });

  it('does not honour a workspace default of codex while the gate is closed', () => {
    expect(engineFor({}, { config: { engine: 'codex' }, found: BOTH })).toBe('claude');
  });

  // The gate has to be impossible to open by accident, so nothing a caller
  // might already have lying around can be mistaken for it: not `true`, not
  // the string, not the engine id, not a same-description Symbol built
  // somewhere else, and not the global registry (which is why the module uses
  // `Symbol` and never `Symbol.for`).
  it('is not opened by anything that merely looks enabled', () => {
    const row = { engine: 'codex' };
    for (const enabled of [
      true,
      1,
      'codex',
      'enabled',
      ENGINE_CHOICE_ENABLED.description,
      Symbol(ENGINE_CHOICE_ENABLED.description),
      Symbol.for(ENGINE_CHOICE_ENABLED.description),
      {},
      [ENGINE_CHOICE_ENABLED],
    ]) {
      expect(engineFor(row, { enabled, found: BOTH })).toBe('claude');
    }
  });

  // The rows that carry `engine` come off disk as JSON, and so does every
  // config. A Symbol survives neither, so the ledger cannot express the gate
  // even if a forged line tried to. (An Electron IPC payload is the other
  // serialized input and fails louder: structured clone throws on a Symbol
  // rather than dropping it. Both are safe; only this one is testable here.)
  it('cannot be opened by anything that arrived as JSON', () => {
    const forged = JSON.parse(JSON.stringify({ ...OPEN, config: { engine: 'codex' }, found: BOTH }));
    expect(forged.enabled).toBeUndefined();
    expect(engineFor({ engine: 'codex' }, forged)).toBe('claude');
  });
});

describe('which engine a task runs on once the gate is open', () => {
  it('is Claude Code when nobody has chosen', () => {
    expect(DEFAULT_ENGINE).toBe('claude');
    expect(engineFor({}, { ...OPEN, config: {}, found: BOTH })).toBe('claude');
  });

  it('is her choice on the task, over the workspace default', () => {
    expect(engineFor({ engine: 'codex' }, { ...OPEN, config: { engine: 'claude' }, found: BOTH })).toBe('codex');
    expect(engineFor({ engine: 'claude' }, { ...OPEN, config: { engine: 'codex' }, found: BOTH })).toBe('claude');
  });

  it('is the workspace default when the task says nothing', () => {
    expect(engineFor({}, { ...OPEN, config: { engine: 'codex' }, found: BOTH })).toBe('codex');
    expect(engineFor(null, { ...OPEN, config: { engine: 'codex' }, found: BOTH })).toBe('codex');
  });

  // A row outlives the Mac it was written on. A session that never starts
  // tells her nothing about why, so an absent binary falls back and runs.
  // This is the older guard and the gate is IN ADDITION to it, not instead.
  it('falls back rather than dying when the engine is not on this machine', () => {
    expect(engineFor({ engine: 'codex' }, { ...OPEN, found: ONLY_CLAUDE })).toBe('claude');
    expect(engineFor({}, { ...OPEN, config: { engine: 'codex' }, found: ONLY_CLAUDE })).toBe('claude');
    expect(engineFor({ engine: 'codex' }, OPEN)).toBe('claude');
  });

  it('reads a name it does not know as no choice at all, rather than throwing', () => {
    expect(engineFor({ engine: 'cursor' }, { ...OPEN, found: BOTH })).toBe('claude');
    expect(engineFor({ engine: '' }, { ...OPEN, found: BOTH })).toBe('claude');
    expect(engineFor({ engine: 42 }, { ...OPEN, found: BOTH })).toBe('claude');
    expect(engineFor({ engine: null }, { ...OPEN, config: { engine: {} }, found: BOTH })).toBe('claude');
    expect(engineFor(undefined)).toBe('claude');
  });
});

describe('the names the engine rule holds', () => {
  it('lists Claude Code first and Codex second', () => {
    expect(ENGINES.map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(ENGINE_IDS).toEqual(['claude', 'codex']);
    expect(engineLabel('codex')).toBe('Codex');
    expect(engineLabel('cursor')).toBe('Claude Code');
    expect(engineLabel(null)).toBe('Claude Code');
  });

  it('knows an engine id from anything else', () => {
    expect(isEngine('claude')).toBe(true);
    expect(isEngine('codex')).toBe(true);
    expect(isEngine('cursor')).toBe(false);
    expect(isEngine(null)).toBe(false);
    expect(isEngine(undefined)).toBe(false);
    expect(isEngine(0)).toBe(false);
  });

  // A picker offering one option is a word she reads past on every task.
  it('offers no choice on a Mac with only Claude Code, and two with both', () => {
    expect(availableEngines(ONLY_CLAUDE).map((e) => e.id)).toEqual(['claude']);
    expect(availableEngines().map((e) => e.id)).toEqual(['claude']);
    expect(engineChoiceExists(ONLY_CLAUDE)).toBe(false);
    expect(engineChoiceExists()).toBe(false);
    expect(availableEngines(BOTH).map((e) => e.id)).toEqual(['claude', 'codex']);
    expect(engineChoiceExists(BOTH)).toBe(true);
  });

  // What keeps the composer's footer open, the same rule the level and the
  // model follow. Agreeing with the default is not a change.
  it('counts only a move off the default as a pick', () => {
    expect(enginePicked('codex')).toBe(true);
    expect(enginePicked('claude')).toBe(false);
    expect(enginePicked('cursor')).toBe(false);
    expect(enginePicked(null)).toBe(false);
  });
});

// THE PREMISE, THROUGH THE REAL FOLD RATHER THAN A HAND-BUILT OBJECT.
//
// Everything above is only worth running if a row can still arrive carrying
// `engine: "codex"`. That is a fact about `pickFields` and `foldWorkItems`, and
// the restored slice inherited it as an assumption. These take a line the shape
// the ledger writes it, put it through JSON, and fold it.
describe('the ledger really does still carry an engine', () => {
  // How a line looks coming off disk: text, parsed, nothing else done to it.
  const fromDisk = (...lines) => foldWorkItems(lines.map((l) => JSON.parse(JSON.stringify(l))));
  const line = (patch, { ts = 1, source = 'founder' } = {}) => ({ id: 'w-250cd74811', ts, source, patch });

  it('keeps the field she set in August all the way through the fold', () => {
    const item = fromDisk(
      line({ title: 'look at the churned account', status: 'open' }, { ts: 1, source: 'system' }),
      line({ engine: 'codex' }, { ts: 2 }),
    ).get('w-250cd74811');

    expect(item.engine).toBe('codex');
    // And that folded row, unchanged, is what the gate is holding.
    expect(engineFor(item)).toBe('claude');
    expect(engineFor(item, { ...OPEN, found: BOTH })).toBe('codex');
  });

  // The validator stores it as a free string and checks nothing, which is why
  // `engineFor` has to be the one that refuses a name it does not know.
  it('keeps a name nothing recognises, and leaves the refusing to the rule', () => {
    const item = fromDisk(line({ status: 'open', engine: 'cursor' })).get('w-250cd74811');
    expect(item.engine).toBe('cursor');
    expect(engineFor(item, { ...OPEN, found: { cursor: true } })).toBe('claude');
  });

  // THE CASE THAT MUST NOT MATCH. The ledger is a contract, not a bag: an
  // unrecognised KEY is dropped. So `engine` surviving is a fact about the
  // field list, not about the fold passing everything through — which is the
  // difference between this premise being real and being a coincidence.
  it('drops a field the contract does not name', () => {
    const item = fromDisk(line({ status: 'open', engin: 'codex', harness: 'codex' })).get('w-250cd74811');
    expect(item.engine).toBeUndefined();
    expect(item.engin).toBeUndefined();
    expect(item.harness).toBeUndefined();
    expect(engineFor(item, { ...OPEN, found: BOTH })).toBe('claude');
  });

  // And the limit of the claim, which the header used to overstate. A later
  // equal-or-stronger write replaces the field, so an August `codex` is
  // "probably still there", never "there forever".
  it('lets a later write of hers replace it', () => {
    const item = fromDisk(
      line({ status: 'open', engine: 'codex' }, { ts: 1 }),
      line({ engine: 'claude' }, { ts: 2 }),
    ).get('w-250cd74811');
    expect(item.engine).toBe('claude');
  });
});

// WHERE THE BYPASS WOULD ACTUALLY HAPPEN.
//
// A pure-function test cannot see a supervisor that reads `item.engine` itself,
// branches on the string, or picks a different binary without asking
// `engineFor` at all. This runs the real spawn path with only `spawn` stubbed
// and reads back the executable the app chose.
describe('a persisted codex row still spawns Claude Code', () => {
  const CLAUDE_BIN = '/nonexistent/claude-code/claude';
  const dirs = [];

  const build = () => {
    const dir = mkdtempSync(join(tmpdir(), 'august-row-'));
    dirs.push(dir);
    const product = { slug: 'agentbox', dir, repoPath: null };
    return new Supervisor(
      {
        home: '/nonexistent-home-with-no-second-account',
        storeRoot: dir,
        claudeBin: CLAUDE_BIN,
        maxConcurrentSessions: 4,
        authProfiles: ['default'],
      },
      { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {} },
      '/nonexistent-app',
    );
  };

  // The row as it comes off her ledger, not as a literal: if the fold ever
  // stopped preserving `engine` this fixture would quietly stop being a Codex
  // row and the test would pass for the wrong reason. So it is asserted.
  const codexRow = () => {
    const item = foldWorkItems([
      JSON.parse(JSON.stringify({
        id: 'w-250cd74811',
        ts: 1,
        source: 'founder',
        patch: { title: 'try the second engine', status: 'open', engine: 'codex' },
      })),
    ]).get('w-250cd74811');
    expect(item.engine).toBe('codex');
    return { ...item, product: 'agentbox' };
  };

  // The trace stream opens on the next tick, so let it, and then let teardown
  // sweep the temp home. This used to be the whole guard against an unhandled
  // ENOENT and it was the wrong half of the fix: the supervisor now listens for
  // that stream's failure itself, because the same event arrives when a product
  // folder moves mid-run or the disk fills, and there it was killing the main
  // process. See tests/a-run-whose-trace-cannot-be-written-still-runs.test.mjs.
  // This stays because letting the spawn settle before asserting on it is right
  // regardless, not because anything depends on it any more.
  const settle = () => new Promise((resolve) => { setImmediate(resolve); });

  beforeEach(() => { spawns.length = 0; });
  afterAll(() => {
    for (const dir of dirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('runs the Claude Code binary and no other', async () => {
    const sup = build();
    sup.spawnWorker(codexRow());
    await settle();

    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
  });

  // NOT A SCAN OF THE ENVIRONMENT, deliberately. The first draft of this swept
  // every env value for /codex/i and went red on the machine it was written on,
  // because the worktree was called agentbox-codex-harness and `PWD` is inherited.
  // A test that depends on what somebody's folder is called is the kind that
  // fails at 2am for no reason. The argv is ours and the cwd is the product's,
  // so those are the two that can honestly be asserted.
  it('passes no engine argument and starts in the product folder', async () => {
    const sup = build();
    const item = codexRow();
    sup.spawnWorker(item);
    await settle();

    expect(JSON.stringify(spawns[0].args ?? [])).not.toMatch(/codex/i);
    expect(spawns[0].options?.cwd).toBe(sup.store.listProducts()[0].dir);
  });

  // The workspace default is the other half of the old rule, and it is the
  // half a Settings screen would write. Same answer.
  it('runs Claude Code even when the workspace config also says codex', async () => {
    const sup = build();
    sup.config.engine = 'codex';
    sup.spawnWorker(codexRow());
    await settle();

    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
  });
});

describe('nothing in the app can reach the second engine yet', () => {
  const sources = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...sources(path));
      else if (/\.(mjs|cjs|js|ts|tsx)$/.test(entry)) out.push(path);
    }
    return out;
  };
  const appFiles = () => [...sources(join(repo, 'main')), ...sources(join(repo, 'renderer', 'src'))];
  const holding = (name) => appFiles().filter((path) => readFileSync(path, 'utf8').includes(name));

  /**
   * The same sweep with the PROSE TAKEN OFF, which is what "calls it" means.
   *
   *  Every file in this app carries the reasoning in its comments, and the
   *  reasoning about a rule names the rule: `EnginePicker.tsx` explains, in
   *  words, why it does NOT ask `availableEngines`, and a raw string sweep reads
   *  that paragraph as the very call it was written to rule out. A test that
   *  cannot tell a file explaining a rule from a file breaking it is a test that
   *  makes the rule undocumentable. tests/the-line-under-the-title.test.mjs
   *  strips comments for exactly this reason and says so in the same words.
   *
   *  `holding` is kept AS IT IS for the gate token below. That one is not about
   *  a call: a file that so much as names `ENGINE_CHOICE_ENABLED` is a file
   *  thinking about the permission, and the stricter reading is the one worth
   *  having there. */
  const withoutProse = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const calling = (name) => appFiles().filter((path) => withoutProse(readFileSync(path, 'utf8')).includes(name));

  // THIS IS THE TEST THAT WAS SUPPOSED TO BE REWRITTEN, AND IT HAS BEEN, ONCE.
  //
  // It read `toEqual([])` and said that the slice which finally opened the gate
  // would be one somebody had to come here and argue for. That slice is
  // 2026-09-04, and the argument is in the header of
  // tests/the-second-engine-runs-only-once-she-has-turned-it-on.test.mjs: there
  // is now a config surface, `engineChoice` in zero.config.json, and
  // `Supervisor#_engineFor` hands the token over when and only when it names a
  // real moment. Nothing else changed -- the default is still off, there is
  // still no picker, and the four blocks above still pass in the form they were
  // written in.
  //
  // SO IT IS AN EXACT LIST AND NOT A DELETION. One file may reach the token.
  // The next one to import it goes red here and has to say why, which is the
  // whole value of this line and is worth more than the empty array was: an
  // empty array could only ever be satisfied by never shipping the feature.
  //
  // renderer/src IS STILL IN THE SWEEP and is still expected to hold none of
  // it. The renderer must not be able to route anything anywhere; if a picker
  // ever needs to know whether the gate is open, it asks main for the answer
  // rather than importing the permission.
  it('lets exactly one file reach the gate token, and it is the supervisor', () => {
    expect(holding('ENGINE_CHOICE_ENABLED')).toEqual([join(repo, 'main', 'supervisor.mjs')]);
  });

  // AND THE OPT-IN ITSELF IS READ IN ONE PLACE TOO. `engineChoiceSince` is what
  // turns a line in her config into the token above, so a second reader of it
  // is a second way to open the gate and has to be argued for here as well.
  it('reads the opt-in in that same one place', () => {
    expect(holding('engineChoiceSince')).toEqual([join(repo, 'main', 'supervisor.mjs')]);
  });

  // AND THE HONEST LIMIT OF THE GATE, WHICH THE PICKER SLICE HAD TO ANSWER FOR.
  //
  // `availableEngines`, `engineChoiceExists` and `enginePicked` are UNGATED, so
  // they would happily describe a two-engine Mac to a picker that never
  // imported the token -- "she would be offered a choice that `engineFor` then
  // refuses, which is its own kind of lie" (shared/engines.mjs). This line read
  // `toEqual([])` three times and said the slice that drew a picker had to come
  // here and deal with it. That slice is 2026-09-04, and this is the dealing.
  //
  // THE ANSWER IS THAT THE OFFER IS MADE BY THE THING THAT REFUSES THE ROUTING.
  // `Supervisor#engineChoices` asks `engineChoiceSince` first, from the same
  // expression `_engineFor` derives the token from, and only then asks
  // `availableEngines` about the binary. So the picker and the spawn cannot come
  // apart: on a Mac with Codex installed and no moment written, BOTH answer one
  // engine, and every screen draws exactly what it drew before.
  // tests/the-engine-choice-reaches-her-screen.test.mjs holds all three refusals
  // on the offer side; the four blocks above are unchanged and still hold them
  // on the routing side.
  //
  // RENDERER/SRC IS STILL EXPECTED TO HOLD NONE OF IT, and that is the half of
  // this line that is doing the real work now. The renderer draws the picker
  // out of a list main handed it on the snapshot; it never asks what is on this
  // Mac and it never decides what counts as a choice.
  it('lets only the supervisor answer what is on offer, and never the renderer', () => {
    expect(calling('availableEngines')).toEqual([join(repo, 'main', 'supervisor.mjs')]);
  });

  // AND `enginePicked` NOW HAS NO CALLER OUTSIDE shared/engines.mjs, WHICH IS A
  // TIGHTENING RATHER THAN A LOSS (2026-09-05). This line read
  // `[main/supervisor.mjs]`, because `engineOffered` and `modelOffered` asked
  // it -- and what it answers is "not Claude Code", which those two were using
  // to mean "not what this row would run on anyway". The two are only the same
  // sentence where the WORKSPACE default is Claude Code, so on a Mac set to
  // Codex her explicit "With Claude Code." was refused as no choice at all and
  // the row then ran on Codex
  // (tests/choosing-claude-code-is-not-the-same-as-choosing-nothing.test.mjs).
  // Both now ask `_engineFor(null)` -- the row's own answer -- and the helper is
  // left to the two staleness rules inside shared/engines.mjs that really do
  // mean "not the default". The invariant this block is about is unharmed and
  // stronger: nothing outside that module derives a second opinion, and the
  // renderer still derives none at all.
  it('has nobody outside the rule itself deciding what counts as a choice', () => {
    expect(calling('enginePicked')).toEqual([]);
  });

  // `engineChoiceExists` STILL HAS NO CALLER, on purpose. `engineChoices`
  // returns the list, and every surface asks it the same question by looking at
  // its length; a boolean kept beside the list is a second fact that can
  // disagree with it, which is the shape this repo has been bitten by often
  // enough to have a rule about. It stays exported and unused rather than
  // deleted because it is the honest name for what the length means.
  it('still has nobody deriving a second answer beside that list', () => {
    expect(calling('engineChoiceExists')).toEqual([]);
  });
});
