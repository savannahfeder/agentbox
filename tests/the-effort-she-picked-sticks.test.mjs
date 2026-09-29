// The effort strip inside the model drawer, and the flag it becomes.
//
// Five mechanisms were drawn and one was picked: option A, the strip inside the
// model menu. Then, merging it onto a main that had grown a second engine, it
// had to support Codex and its models as well.
//
// Four things this file holds. Claude Code's words are the CLI's own five and
// no other, because the spawn hands one straight to `--effort` and the CLI
// refuses a word it does not know. Codex's words are PER MODEL, read off this
// Mac's cache beside the model's name, and a level the model does not
// advertise stops the run with a sentence rather than reaching `turn/start`.
// Nothing picked means nothing sent, because this app does not know what the
// engine chooses for a model and must not draw a guess as if it were running
// it. And the pick is remembered across cards, per engine, the way the model
// is, for the reason ../renderer/src/models.ts gives.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFORT_LEVELS, effortLabel, isEffort, isEffortWord } from '../shared/effort-levels.mjs';
import {
  EFFORTS,
  LAST_EFFORT_KEY,
  effortChoicesFor,
  effortLabelOf,
  effortPicked,
  lastEffortKey,
  readLastEffort,
  writeLastEffort,
} from '../renderer/src/effort.ts';
import { CODEX_OWN } from '../renderer/src/models.ts';
import { buildLine, foldWorkItems, pickFields } from '../shared/work-items.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { parseSessionArgs } from '../main/settings.mjs';
import { codexModelLevels, codexModels } from '../main/codex-models.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/codex-models-cache.json', import.meta.url));

const fakeStore = (refuse = false) => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
};

describe("Claude Code's five words", () => {
  // Measured against Claude Code 2.1.257 and 2.1.270:
  //   --effort <level>  Effort level for the current session (low, medium, high, xhigh, max)
  it('are the ones the CLI lists after --effort, in its order', () => {
    expect(EFFORT_LEVELS.map((e) => e.id)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(EFFORTS.map((e) => e.id)).toEqual(EFFORT_LEVELS.map((e) => e.id));
  });

  // No "default" row, for the reason the model list has none: a row whose job
  // is to explain that the control might not be doing anything.
  it('has no row that is not a level', () => {
    for (const e of EFFORTS) expect(e.label).not.toMatch(/default|usual|auto/i);
  });

  it('refuses anything else, so a stray word can never reach the CLI', () => {
    for (const bad of ['ultracode', 'auto', 'High', '', null, undefined, 3, {}]) {
      expect(isEffort(bad), String(bad)).toBe(false);
      expect(effortPicked(bad)).toBe(false);
    }
    expect(effortLabelOf('nope')).toBe(null);
  });

  it('spells the odd one the way the CLI does and the plain way for her', () => {
    expect(effortLabelOf('xhigh')).toBe('Extra');
    expect(effortLabelOf(null)).toBe(null);
  });
});

describe("Codex's words, which are the model's own", () => {
  // Off tests/fixtures/codex-models-cache.json, a trimmed copy of the cache
  // codex-cli keeps on this Mac: the levels differ per model, and that is the
  // whole reason the strip is not one list.
  const rows = codexModels({ home: path.dirname(FIXTURE), read: (f) => JSON.parse(fs.readFileSync(path.join(path.dirname(FIXTURE), 'codex-models-cache.json'), 'utf8')) });

  it('draws the picked model\'s own levels, and they differ per model', () => {
    const sol = effortChoicesFor('codex', 'gpt-5.6-sol', { codexModels: rowsFor(rows) });
    const five = effortChoicesFor('codex', 'gpt-5.5', { codexModels: rowsFor(rows) });
    expect(sol.map((e) => e.id)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
    expect(five.map((e) => e.id)).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('spells the shared words the same way on both engines and never invents one', () => {
    const sol = effortChoicesFor('codex', 'gpt-5.6-sol', { codexModels: rowsFor(rows) });
    expect(sol.find((e) => e.id === 'xhigh')?.label).toBe('Extra');
    expect(sol.find((e) => e.id === 'ultra')?.label).toBe('Ultra');
    expect(effortLabel('ultra')).toBe('Ultra');
    expect(effortLabel('Not a word')).toBe(null);
  });

  it('follows the model the card would run on when she has named none', () => {
    const viaDefault = effortChoicesFor('codex', null, { codexModels: rowsFor(rows), codexDefault: 'gpt-5.5' });
    expect(viaDefault.map((e) => e.id)).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  // "Codex's own" is a card whose model this app does not know, and a model it
  // does not know has levels it cannot draw. No strip beats a guess the run
  // would refuse.
  it('draws no strip for a model this Mac has no list for', () => {
    expect(effortChoicesFor('codex', null, { codexModels: rowsFor(rows), codexDefault: null })).toEqual([]);
    expect(effortChoicesFor('codex', CODEX_OWN, { codexModels: rowsFor(rows) })).toEqual([]);
    expect(effortChoicesFor('codex', 'gpt-5.6-slo', { codexModels: rowsFor(rows) })).toEqual([]);
    expect(effortChoicesFor('codex', 'gpt-5.5', { codexModels: [] })).toEqual([]);
  });

  it("Claude Code's strip is the five whatever the model", () => {
    expect(effortChoicesFor(null, 'haiku').map((e) => e.id)).toEqual(EFFORTS.map((e) => e.id));
    expect(effortChoicesFor('claude', null).map((e) => e.id)).toEqual(EFFORTS.map((e) => e.id));
  });

  // A remembered `ultra` on a card whose model stops at `xhigh` is neither lit
  // nor sent; it is only a pick against the rows in front of her.
  it('a level is a pick only against the rows the card is drawing', () => {
    const five = effortChoicesFor('codex', 'gpt-5.5', { codexModels: rowsFor(rows) });
    expect(effortPicked('ultra', five)).toBe(false);
    expect(effortPicked('xhigh', five)).toBe(true);
  });

  it('the shape of a word is all the ledger can check', () => {
    for (const ok of ['low', 'ultra', 'xhigh']) expect(isEffortWord(ok)).toBe(true);
    for (const bad of ['High', 'x high', '', null, 3, 'a'.repeat(30)]) expect(isEffortWord(bad), String(bad)).toBe(false);
  });

  it('reads one model\'s levels off the cache, and says when it cannot', () => {
    const home = path.dirname(FIXTURE);
    const read = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(codexModelLevels('gpt-5.5', { home, read })).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(codexModelLevels('gpt-reserve', { home, read })).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(codexModelLevels('gpt-5.6-slo', { home, read })).toBe(null);
    expect(codexModelLevels('gpt-5.5', { home, read: () => null })).toBe(null);
  });
});

/** The rows as main/settings.mjs hands them to the card: id, label, levels. */
function rowsFor(rows) {
  return rows.map((m) => ({ id: m.id, label: m.label, levels: m.levels.map((l) => l.id), defaultLevel: m.defaultLevel }));
}

describe('remembering it', () => {
  it('survives the send', () => {
    const store = fakeStore();
    writeLastEffort('max', store);
    expect(readLastEffort(store)).toBe('max');
    expect(store.map.get(LAST_EFFORT_KEY)).toBe('max');
  });

  it('unpicking clears it rather than storing a word', () => {
    const store = fakeStore();
    writeLastEffort('high', store);
    writeLastEffort(null, store);
    expect(store.map.has(LAST_EFFORT_KEY)).toBe(false);
    expect(readLastEffort(store)).toBe(null);
  });

  // A key left by some other build must not come back as a flag the CLI
  // refuses: the memory is checked against the five on the way out too.
  it('forgets a word that is not one of the five', () => {
    const store = fakeStore();
    store.map.set(LAST_EFFORT_KEY, 'ultrathink');
    expect(readLastEffort(store)).toBe(null);
  });

  // ONE KEY PER ENGINE. `ultra` is a Codex word Claude Code's CLI refuses, and
  // the other way round is a word a Codex model may not advertise. Claude Code
  // keeps the original key, so a level she has already chosen survives.
  it('is kept per engine, and Claude Code keeps the original key', () => {
    expect(lastEffortKey(null)).toBe(LAST_EFFORT_KEY);
    expect(lastEffortKey('claude')).toBe(LAST_EFFORT_KEY);
    expect(lastEffortKey('codex')).toBe(`${LAST_EFFORT_KEY}.codex`);
    const store = fakeStore();
    writeLastEffort('high', store, null);
    writeLastEffort('ultra', store, 'codex');
    expect(readLastEffort(store, null)).toBe('high');
    expect(readLastEffort(store, 'codex')).toBe('ultra');
    // Codex's memory is a word; the model decides whether it is a pick.
    writeLastEffort('Not a word', store, 'codex');
    expect(readLastEffort(store, 'codex')).toBe(null);
  });

  it('a refused store loses the memory and never the send', () => {
    const store = fakeStore(true);
    expect(() => writeLastEffort('low', store)).not.toThrow();
    expect(readLastEffort(store)).toBe(null);
  });
});

describe('on the work item', () => {
  // The ledger keeps only the fields it knows (shared/work-items.mjs), so the
  // field has to be one of them or the card's pick is dropped on the floor the
  // way the model once was.
  it('is a field the ledger keeps', () => {
    expect(pickFields({ effort: 'high' })).toEqual({ effort: 'high' });
    const line = buildLine({ id: 'w-1', source: 'founder', patch: { effort: 'xhigh' } });
    expect(line.patch).toEqual({ effort: 'xhigh' });
  });

  it('folds onto the item', () => {
    const items = foldWorkItems([
      { id: 'w-1', ts: 1, source: 'system', patch: { title: 't', kind: 'directive', status: 'open' } },
      { id: 'w-1', ts: 2, source: 'founder', patch: { effort: 'max' } },
    ].map((l) => JSON.stringify(l)));
    expect(items.get('w-1').effort).toBe('max');
  });
});

// THE FLAG. The same shape ./what-one-reply-may-do.test.mjs uses to watch the
// model reach the args: a supervisor with her real session args and a task.
describe('what the spawn sends Claude Code', () => {
  let appDir;
  let storeRoot;
  const productDir = (slug) => path.join(storeRoot, slug);
  const acme = () => ({ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null });
  const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });
  const supervisor = (over = {}) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = appDir;
    // Her own folder, which the app keeps outside the checkout (w-3dc46f3a67).
    s.userDir = appDir;
    s.config = { sessionArgs: ['--model', 'claude-opus-5'], personalSessionArgs: [], personalProducts: [] };
    s._personalSessions = {};
    s.buildBrief = () => 'THE BRIEF';
    s.store = { listProducts: () => [acme()] };
    Object.assign(s, over);
    return s;
  };
  const effortOf = (args) => {
    const i = args.indexOf('--effort');
    return i === -1 ? null : args[i + 1];
  };

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-effort-'));
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-effort-store-'));
    fs.mkdirSync(productDir('acme'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it('hands a picked level to --effort beside the model', () => {
    const { args } = supervisor().spawnPlan(item({ model: 'fable', effort: 'xhigh' }), acme());
    expect(effortOf(args)).toBe('xhigh');
    expect(parseSessionArgs(args).model).toBe('fable');
  });

  it('sends nothing when nothing was picked, so Claude Code chooses', () => {
    const { args } = supervisor().spawnPlan(item(), acme());
    expect(args).not.toContain('--effort');
  });

  it('sends nothing for a word the CLI would refuse', () => {
    const { args } = supervisor().spawnPlan(item({ effort: 'ultrathink' }), acme());
    expect(args).not.toContain('--effort');
  });

  // A Codex word on a row that resolved to Claude Code is not a Claude Code
  // flag. The cross-harness guard upstream should never let this happen, and
  // if it does the run still starts rather than dying on a usage error.
  it("sends nothing for a Codex model's word", () => {
    const { args } = supervisor().spawnPlan(item({ effort: 'ultra' }), acme());
    expect(args).not.toContain('--effort');
  });

  it('sends the flag exactly once', () => {
    const { args } = supervisor().spawnPlan(item({ effort: 'low' }), acme());
    expect(args.filter((a) => a === '--effort')).toHaveLength(1);
  });

  // The plan carries the word for the other engine to judge; Claude Code's
  // command line never does.
  it('carries the word on the plan for Codex and keeps it off the Claude command line', () => {
    const plan = supervisor().spawnPlan(item({ effort: 'ultra' }), acme(), { engine: 'codex' });
    expect(plan.effort).toBe('ultra');
    expect(plan.args).not.toContain('--effort');
  });
});

// THE TURN. Codex has no argv: the level is `turn/start`'s own `effort` field
// ("Override the reasoning effort for this turn and subsequent turns", off
// `codex app-server generate-json-schema`, codex-cli 0.153.4, 2026-09-14), and
// it takes a word THE MODEL advertises. So the word is judged against the model
// that will run, at the same place the model itself is judged.
describe('what the spawn sends Codex', () => {
  let home;
  const build = ({ cache = true, toml = null, codexModel } = {}) => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-effort-codex-'));
    if (cache) fs.copyFileSync(FIXTURE, path.join(home, 'models_cache.json'));
    if (toml !== null) fs.writeFileSync(path.join(home, 'config.toml'), toml);
    const s = Object.create(Supervisor.prototype);
    s.config = { codexHome: home, ...(codexModel === undefined ? {} : { codexModel }) };
    s._workerEnv = () => ({});
    return s;
  };
  afterEach(() => { if (home) fs.rmSync(home, { recursive: true, force: true }); });

  it('puts the level on the turn beside her words', () => {
    const turn = build().codexTurnParamsFor({ prompt: 'do the thing', effort: 'ultra' });
    expect(turn).toEqual({ input: [{ type: 'text', text: 'do the thing' }], effort: 'ultra' });
  });

  it('sends no level when nothing was picked, so her config.toml decides', () => {
    expect(build().codexTurnParamsFor({ prompt: 'do the thing' })).toEqual({ input: [{ type: 'text', text: 'do the thing' }] });
    expect(build().codexTurnParamsFor({ prompt: 'do the thing', effort: null })).not.toHaveProperty('effort');
  });

  it('carries a level the model advertises into the thread without a word', () => {
    const sup = build();
    expect(sup.codexEffortRefusal('gpt-5.6-sol', 'ultra')).toBe(null);
    expect(() => sup.codexThreadParamsFor({ model: 'gpt-5.6-sol', effort: 'ultra' }, '/tmp/p', [], null)).not.toThrow();
  });

  // gpt-5.5 stops at xhigh. `ultra` on it is a run Codex would refuse at the
  // turn as a protocol error; the sentence here is the one she can act on.
  it('stops the run, before the thread, on a level that model does not offer', () => {
    const sup = build();
    const why = sup.codexEffortRefusal('gpt-5.5', 'ultra');
    expect(why).toMatch(/gpt-5\.5/);
    expect(why).toMatch(/"ultra"/);
    expect(why).toMatch(/low, medium, high, xhigh/);
    expect(() => sup.codexThreadParamsFor({ model: 'gpt-5.5', effort: 'ultra' }, '/tmp/p', [], null)).toThrow(/ultra/);
  });

  it('judges the level against the model that will actually run when the row names none', () => {
    // The workspace's model first, then her config.toml's.
    expect(build({ codexModel: 'gpt-5.5' }).codexEffortRefusal('', 'ultra')).toMatch(/gpt-5\.5/);
    expect(build({ toml: 'model = "gpt-5.5"\n' }).codexEffortRefusal('', 'ultra')).toMatch(/gpt-5\.5/);
    expect(build({ toml: 'model = "gpt-5.6-sol"\n' }).codexEffortRefusal('', 'ultra')).toBe(null);
  });

  // We refuse on a fact or not at all: no cache, or no model word to check
  // against, and the word goes to Codex as written.
  it('refuses nothing it cannot check', () => {
    expect(build({ cache: false }).codexEffortRefusal('gpt-5.5', 'ultra')).toBe(null);
    expect(build().codexEffortRefusal('', 'ultra')).toBe(null);
    expect(build().codexEffortRefusal('gpt-5.5', '')).toBe(null);
    expect(build().codexEffortRefusal('gpt-5.5', null)).toBe(null);
  });
});
