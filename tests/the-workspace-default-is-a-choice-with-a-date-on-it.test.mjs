// THE WORKSPACE DEFAULT IS A CHOICE WITH A DATE ON IT, LIKE EVERY OTHER ONE.
//
// The gate is a MOMENT and not a flag: `engineChoice` in zero.config.json says
// "Codex may be chosen FROM NOW ON", and `engineChoiceOnRowIsStale` is what
// makes that mean something -- a row whose `wrote.engine.ts` predates the moment
// is a choice she made before there was a way to make one, so it is not
// honoured. That is the whole design (shared/engines.mjs).
//
// TWO THINGS WERE WRONG WITH IT AND THEY POINT THE SAME WAY: both of them move
// work ONTO the second engine, which is the one direction the gate exists to
// prevent.
//
// 1. AN OLD EXPLICIT `claude` ROW WAS DISCARDED INTO A `codex` DEFAULT.
//
//    `engineChoiceOnRowIsStale` asked `isEngine(item.engine)`, so it was true of
//    a row naming EITHER engine. A row saying `engine: "claude"`, written before
//    the moment, was therefore thrown away -- and `engineFor` then fell through
//    to `config.engine`, which may be `codex`. So her explicit "run this on
//    Claude Code" was read as no choice at all and answered with Codex. That is
//    the precise opposite of what staleness is for.
//
//    The fix is one word: `enginePicked` instead of `isEngine`. A row naming the
//    DEFAULT engine asks for nothing the gate withholds, so there is nothing for
//    it to be stale about, and discarding it could only ever move work to the
//    second engine.
//
// 2. `config.engine` HAD NO DECISION MOMENT, SO THE ROLLBACK LIFECYCLE LEAKED.
//
// But re-opening it with a NEWER moment used to re-arm a workspace default set
// weeks earlier: every row that names nothing went straight back to Codex
// without her saying so again, which is exactly the claim `engineChoice` is
// supposed to make impossible.
//
//    THE PREVIOUS SLICE ARGUED IT COULD NOT BE DONE and the argument was wrong,
//    in its own words: "JSON has no per-key write times, and `engine` sits in
//    the same file as this, so opening that file to write the moment is the same
//    act as reading the line above it." JSON has no per-key write times; the APP
//    does. `main/settings.mjs` is the only thing that writes `engine`, and
//    `saveConfig` takes a patch of several keys, so the stamp rides in the same
//    write.
//
//    AND AN ABSENT STAMP MEANS HONOURED, WHICH IS THE OTHER HALF OF THAT SAME
//    ARGUMENT READ CORRECTLY. `engineChoice` is hand-written into her config;
//    a hand-written `engine` sits on the line above it, put there by the same
//    hand in the same act, so the two ARE contemporaneous and there is nothing
//    to be stale against. Only a default the app wrote can carry a stamp, and
//    only a stamped default can go stale. That is what keeps every config that
//    exists today, and every fixture in this suite, behaving exactly as it did.
//
// WHAT IS DELIBERATELY NOT DONE HERE: closing the gate does not erase
// `config.engine` from her file, and nothing pretends it did. The setting still
// reads `Codex` on disk; what changes is that the fleet does not act on it
// until she picks it again, and the Settings screen already draws what really
// runs (`engineSettings` reads `engineFacts.workspace`, which is
// `_engineFor(null)`).

import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENGINE_CHOICE_ENABLED, DEFAULT_ENGINE,
  engineFor, engineChoiceOnRowIsStale, engineDefaultIsStale,
} from '../shared/engines.mjs';
import { loadConfig } from '../main/config.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';

const OPEN = { enabled: ENGINE_CHOICE_ENABLED };
const BOTH = { codex: true };

// Fixed moments, so nothing here depends on the day the suite runs.
const BEFORE = Date.parse('2026-09-01T00:00:00Z');
const MOMENT = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-09-10T00:00:00Z');

/** A row as the fold hands it over: the engine, and when that field was set. */
const rowChosen = (engine, ts) => ({ engine, wrote: { engine: { ts } } });

const dirs = [];
const withConfig = (overrides) => {
  const appDir = mkdtempSync(join(tmpdir(), 'engine-default-stamp-'));
  dirs.push(appDir);
  writeFileSync(join(appDir, 'zero.config.json'), JSON.stringify({
    storeRoot: '/tmp/store', maxConcurrentSessions: 3, sessionArgs: [], ...overrides,
  }, null, 2));
  const config = loadConfig(appDir);
  config.appDir = appDir;
  return { appDir, config };
};
const onDisk = (appDir) => JSON.parse(readFileSync(join(appDir, 'zero.config.json'), 'utf8'));

/* ============ 1. an explicit claude row is never thrown at codex ========= */

describe('a row that names Claude Code is not stale, ever', () => {
  it('is honoured however old it is, against a codex workspace default', () => {
    const old = rowChosen('claude', BEFORE);
    expect(engineChoiceOnRowIsStale(old, { engineChoice: MOMENT })).toBe(false);
    expect(engineFor(old, {
      ...OPEN, config: { engine: 'codex', engineChoice: MOMENT }, found: BOTH,
    })).toBe('claude');
  });

  // THE CASE THAT MUST NOT MATCH: the second engine on an old row is still
  // stale, which is the whole point of the gate and must not have moved.
  it('still discards an old codex row into the workspace default', () => {
    const old = rowChosen('codex', BEFORE);
    expect(engineChoiceOnRowIsStale(old, { engineChoice: MOMENT })).toBe(true);
    expect(engineFor(old, { ...OPEN, config: { engineChoice: MOMENT }, found: BOTH })).toBe('claude');
  });

  // The boundary the other side: a codex row chosen after the moment is hers.
  it('honours a codex row chosen since the moment', () => {
    const fresh = rowChosen('codex', AFTER);
    expect(engineChoiceOnRowIsStale(fresh, { engineChoice: MOMENT })).toBe(false);
    expect(engineFor(fresh, { ...OPEN, config: { engineChoice: MOMENT }, found: BOTH })).toBe('codex');
  });

  // And with no moment written at all there is nothing to be stale against,
  // which is every Mac before she opens the gate.
  it('is not stale on a config with no moment in it', () => {
    expect(engineChoiceOnRowIsStale(rowChosen('claude', BEFORE), {})).toBe(false);
    expect(engineChoiceOnRowIsStale(rowChosen('codex', BEFORE), {})).toBe(false);
  });
});

/* ================ 2. the workspace default carries a moment ============== */

describe('a workspace default set before the gate was reopened', () => {
  it('is not acted on, and an unmarked row runs on Claude Code', () => {
    const config = { engine: 'codex', engineAt: '2026-09-01', engineChoice: MOMENT };
    expect(engineDefaultIsStale(config)).toBe(true);
    expect(engineFor({}, { ...OPEN, config, found: BOTH })).toBe(DEFAULT_ENGINE);
    expect(engineFor(null, { ...OPEN, config, found: BOTH })).toBe(DEFAULT_ENGINE);
  });

  // And the row-level half of the same story: the two defects compounded, so
  // an OLD EXPLICIT CLAUDE ROW used to end up on Codex. Neither half does now.
  it('does not catch an old explicit claude row on the way down', () => {
    const config = { engine: 'codex', engineAt: '2026-09-01', engineChoice: MOMENT };
    expect(engineFor(rowChosen('claude', BEFORE), { ...OPEN, config, found: BOTH })).toBe('claude');
  });

  // The boundary either side of the moment.
  it('is acted on when it was set since the gate was opened', () => {
    const config = { engine: 'codex', engineAt: '2026-09-10', engineChoice: MOMENT };
    expect(engineDefaultIsStale(config)).toBe(false);
    expect(engineFor({}, { ...OPEN, config, found: BOTH })).toBe('codex');
  });

  it('is acted on when it was set at the very moment', () => {
    const config = { engine: 'codex', engineAt: MOMENT, engineChoice: MOMENT };
    expect(engineDefaultIsStale(config)).toBe(false);
    expect(engineFor({}, { ...OPEN, config, found: BOTH })).toBe('codex');
  });

  // THE CASE THAT MUST NOT MATCH, AND IT IS EVERY CONFIG THAT EXISTS TODAY.
  // A default with no stamp was written by the same hand, into the same file,
  // as the moment on the line above it. There is nothing to be stale against.
  it('honours a hand-written default that carries no stamp at all', () => {
    const config = { engine: 'codex', engineChoice: MOMENT };
    expect(engineDefaultIsStale(config)).toBe(false);
    expect(engineFor({}, { ...OPEN, config, found: BOTH })).toBe('codex');
  });

  // Same rule for a stamp that is not a moment. The parse is strict for the
  // reason `engineChoiceSince` is: "1" and "2026" are dates to `Date.parse` and
  // are not claims anybody made. A claim that cannot be read is not a claim, so
  // it reads as no stamp, which is the hand-written case above.
  it('honours a default whose stamp is not a moment', () => {
    for (const engineAt of ['1', '2026', 'yesterday', true, 17, null, {}]) {
      const config = { engine: 'codex', engineAt, engineChoice: MOMENT };
      expect(engineDefaultIsStale(config)).toBe(false);
      expect(engineFor({}, { ...OPEN, config, found: BOTH })).toBe('codex');
    }
  });

  // Naming the default engine is not a choice the gate withholds, so it is
  // never stale — the same rule the row half follows above.
  it('is never stale for a default of Claude Code', () => {
    expect(engineDefaultIsStale({ engine: 'claude', engineAt: '2026-09-01', engineChoice: MOMENT })).toBe(false);
  });

  // With the gate shut there is no moment to be stale against, and `engineFor`
  // answers Claude Code anyway.
  it('is not stale while the gate is shut', () => {
    expect(engineDefaultIsStale({ engine: 'codex', engineAt: '2026-09-01' })).toBe(false);
    expect(engineFor({}, { config: { engine: 'codex', engineAt: '2026-09-01' }, found: BOTH })).toBe('claude');
  });
});

/* ================= and the settings screen writes the stamp ============== */

describe('the settings screen stamps the default it writes', () => {
  it('writes when she picked it, beside what she picked', () => {
    const { appDir, config } = withConfig({});
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'engine', value: 'codex' });

    expect(onDisk(appDir).engine).toBe('codex');
    expect(typeof onDisk(appDir).engineAt).toBe('string');
    expect(Number.isFinite(Date.parse(onDisk(appDir).engineAt))).toBe(true);
    // The live object too, so a setting she changes takes effect on the next
    // tick rather than at the next restart (`saveConfig`).
    expect(config.engineAt).toBe(onDisk(appDir).engineAt);
  });

  // The stamp is what makes the rollback lifecycle work, so it has to be a
  // moment the rule can actually read. A gate moment in the far future is
  // strictly after anything this write can produce.
  it('writes a stamp the staleness rule can read', () => {
    const { config } = withConfig({});
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'engine', value: 'codex' });

    expect(engineDefaultIsStale({ ...config, engineChoice: '2099-01-01' })).toBe(true);
    expect(engineDefaultIsStale({ ...config, engineChoice: '2000-01-01' })).toBe(false);
  });

  // Picking Claude Code stamps too, so the pair in her file is never half
  // written — and it is never stale either way, which is the rule above.
  it('stamps a default of Claude Code as well', () => {
    const { appDir, config } = withConfig({ engine: 'codex', engineAt: '2026-09-01' });
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'engine', value: 'claude' });

    expect(onDisk(appDir).engine).toBe('claude');
    expect(Date.parse(onDisk(appDir).engineAt)).toBeGreaterThan(Date.parse('2026-09-01'));
  });

  // AND NOTHING ELSE IN HER FILE MOVED. `saveConfig` merges onto what is on
  // disk, and the stamp is one more key in the same patch rather than a second
  // write that could half-land.
  it('leaves every other key exactly as it found it', () => {
    const { appDir, config } = withConfig({ codexModel: 'gpt-5.5', engineChoice: MOMENT });
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'engine', value: 'codex' });

    const disk = onDisk(appDir);
    expect(disk.codexModel).toBe('gpt-5.5');
    expect(disk.engineChoice).toBe(MOMENT);
    expect(disk.storeRoot).toBe('/tmp/store');
    expect(disk.maxConcurrentSessions).toBe(3);
  });
});

afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});
