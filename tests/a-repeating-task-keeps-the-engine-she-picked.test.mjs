// A REPEATING TASK KEEPS THE ENGINE AND THE MODEL SHE PICKED.
//
// She can compose "every morning", VISIBLY pick Codex and a Codex model in the
// same sentence, press send, and every run for the rest of the year goes to
// whatever the workspace default happens to be that day.
//
// MEASURED BY READING THE PATH, 2026-09-05, and it is dropped four times over:
//
//   `Compose` sends `{ repeat, engine, model }` — both words are on the payload.
//   `App.tsx`'s repeat branches name `{ product, title, body, priority, rule }`
//     and nothing else, so both are gone before the bridge.
//   `store.composeRepeat(slug, { title, body, priority, every, at, on })` cannot
//     store them: the signature names the fields one by one.
//   `Repeats.serve` builds the occurrence with title, body, kind, priority and
//     labels, so even a rule that carried them would not hand them on.
//
// THE SAME SHAPE AS THE `on` BUG, AND THE SAME LESSON. A field that has to be
// named in four places is a field that will be missing from one of them.
//
// A REPEAT IS A RULE AND STAYS ONE. Nothing here turns it into a work item:
// `engine` and `model` join the rule's own fields in its own `repeats.jsonl`,
// with the same append-only newest-wins fold, and are stamped onto each
// occurrence at the moment that occurrence is created. The spec's six reasons
// (docs/superpowers/specs/2026-08-12-repeating-tasks-design.md) are untouched.
//
// AND WHAT THE GATE MEANS HERE. A rule written before the opt-in should behave
// like a ROW written before it. It does, and it costs
// no staleness machinery, because of an accident of ordering that is worth
// writing down: `engine` is a NEW field on a repeat rule, so no rule on her disk
// carries one, and every rule that ever will carries one only because
// `Supervisor#engineOffered` let it through — which answers null on every Mac
// where the gate is shut. So "a rule with no engine" IS "a rule written before
// the opt-in", exactly as an unmarked row is a row written before it, and both
// run on the workspace default. There is nothing to be stale about.
//
// The residue is stated rather than papered over: a rule written while the gate
// was open keeps its engine if the gate is later closed and REOPENED with a
// newer moment, where a ledger row from the same day would go stale. That is
// deliberate. A rule is a live object on her Scheduled screen that she can edit
// or end in one press; the staleness rule exists for rows in an 8 MiB ledger
// window that she cannot see and will never revisit. And a shut gate neutralises
// it either way: `engineFor` answers Claude Code for every row while it is shut,
// whatever the row says.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repeats } from '../main/repeats.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { foldRepeats } from '../shared/repeats.mjs';
import { Name } from '../shared/product-name.mjs';
import {
  ENGINE_CHOICE_ENABLED, engineFor, modelForEngine,
} from '../shared/engines.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let dir; let repeats; let mods;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-engine-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  mods = await loadStore();
  repeats = new Repeats(mods);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const items = () => mods.workItemsDisk.readWorkItems(dir);
const SEEDED_AT = at(2026, 9, 4, 9);

const seed = (extra = {}, now = SEEDED_AT) => repeats.setRule(dir, {
  title: 'Onboarding QA', body: 'run it', every: 'day', at: '09:00', ...extra,
}, now);

/* ========================== the rule holds them ========================== */

describe('the rule she wrote', () => {
  it('keeps the engine and the model on the rule itself', () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    expect(repeats.get(dir, rule.id)).toMatchObject({ engine: 'codex', model: 'gpt-5.6-sol' });
  });

  // Through the FILE, folded, rather than off the object `setRule` returns: a
  // field that is written and not folded reads correctly once and is gone on the
  // next app start, which is exactly how `on` disappeared off weekly rules.
  it('keeps them across the fold, which is what a restart reads', () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    const lines = fs.readFileSync(repeats.filePath(dir), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(foldRepeats(lines).get(rule.id)).toMatchObject({ engine: 'codex', model: 'gpt-5.6-sol' });
  });

  // THE CASE THAT MUST NOT MATCH, and it is every rule on her disk today: a
  // rule that names neither carries neither, rather than carrying an empty one.
  it('writes neither field on a rule that names neither', () => {
    const rule = seed();
    const stored = repeats.get(dir, rule.id);
    expect('engine' in stored).toBe(false);
    expect('model' in stored).toBe(false);
  });

  // Changing the rule can change them, the same way changing its day can.
  it('can be moved to the other engine later', () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' }, SEEDED_AT);
    repeats.patchRule(dir, rule.id, { engine: 'claude', model: 'opus' }, SEEDED_AT + 1000);
    expect(repeats.get(dir, rule.id)).toMatchObject({ engine: 'claude', model: 'opus' });
  });
});

/* ======================== and every run carries them ===================== */

describe('each run of a repeating task', () => {
  it('is marked with the engine and the model the rule names', async () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    await repeats.serve(dir, rule.id, '2026-09-05', at(2026, 9, 5, 10));

    const [run] = [...items()];
    expect(run.engine).toBe('codex');
    expect(run.model).toBe('gpt-5.6-sol');
    // And it is still an ordinary run in every other respect.
    expect(run.labels).toEqual(['founder', `repeat:${rule.id}`]);
  });

  // The whole point of carrying them: the run really routes.
  it('routes to the engine she picked, with her model on it', async () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    await repeats.serve(dir, rule.id, '2026-09-05', at(2026, 9, 5, 10));
    const [run] = [...items()];

    const where = {
      enabled: ENGINE_CHOICE_ENABLED,
      config: { engine: 'claude', engineChoice: '2026-09-04' },
      found: { codex: true },
    };
    expect(engineFor(run, where)).toBe('codex');
    expect(modelForEngine(run, 'codex')).toBe('gpt-5.6-sol');
  });

  // THE CASE THAT MUST NOT MATCH: a rule with no engine makes a run with no
  // engine, which is the workspace default and is every run she has today.
  it('marks nothing on a run whose rule names nothing', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-09-05', at(2026, 9, 5, 10));

    const [run] = [...items()];
    expect(run.engine).toBeUndefined();
    expect(run.model).toBeUndefined();
  });

  // A RULE WRITTEN BEFORE THE OPT-IN BEHAVES LIKE A ROW WRITTEN BEFORE IT, and
  // that is what this asserts: with the gate shut, a run off an unmarked rule
  // runs on Claude Code, and so does a run off a marked one.
  it('runs on Claude Code while the gate is shut, marked or not', async () => {
    const bare = seed();
    const marked = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    await repeats.serve(dir, bare.id, '2026-09-05', at(2026, 9, 5, 10));
    await repeats.serve(dir, marked.id, '2026-09-05', at(2026, 9, 5, 10));

    for (const run of items()) {
      expect(engineFor(run, { config: { engine: 'codex' }, found: { codex: true } })).toBe('claude');
    }
  });

  // Serving the same period twice still creates nothing, so the marks cannot
  // become a second row.
  it('does not make a second run out of the same period', async () => {
    const rule = seed({ engine: 'codex', model: 'gpt-5.6-sol' });
    const now = at(2026, 9, 5, 10);
    await repeats.serve(dir, rule.id, '2026-09-05', now);
    const again = await repeats.serve(dir, rule.id, '2026-09-05', now);
    expect(again.created).toBe(false);
    expect([...items()].length).toBe(1);
  });
});

/* ==================== and the path from her card is whole ================ */
// Four hand-offs, and the bug was that any one of them could drop the pair
// without a symptom. Three of them are asserted as source: `main/ipc.mjs`
// imports electron at module scope, `App.tsx` and `preload.cjs` are not loadable
// here either, and what is worth checking is that each one names both fields.

describe('the whole path from the card to the rule', () => {
  // THE ENGINE CLAUSE MOVED, DELIBERATELY (2026-09-05). It was `...(engine ? {
  // engine }: {})`, and a null engine is how this card spells Claude Code --
  // so her explicit "With Claude Code." sent nothing, the rule was filed
  // naming no engine, and every run of it then took the WORKSPACE DEFAULT,
  // which may be Codex. A repeating task is where that costs most: it is
  // inherited by every future run rather than being one wrong task.
  // tests/choosing-claude-code-is-not-the-same-as-choosing-nothing.test.mjs is
  // the whole of it. What this line still holds is that the pair leaves the
  // card together.
  it('the composer already sends both, beside the rule', () => {
    const compose = read('renderer/src/components/Compose.tsx');
    expect(compose).toMatch(/\.\.\.\(repeat \? \{ repeat \} : \{\}\)/);
    expect(compose).toMatch(/engineRows\.length > 1\s*\?\s*\{ engine: engine \?\? DEFAULT_ENGINE \}/);
  });

  it('the compose branch carries both into composeRepeat', () => {
    // THE SEND MOVED TO THE THREADS CARD, and the pair moved with it: the card
    // builds `harness` out of the engine and model she picked and spreads it
    // beside the rule. Read where the call is rather than where it was.
    const card = read('renderer/src/threads/ThreadComposer.tsx');
    const at = card.indexOf('api.composeRepeat({');
    expect(at).toBeGreaterThan(-1);
    const call = card.slice(at, at + 400);
    expect(call).toContain('product: product.slug');
    expect(call).toContain('rule: when.repeat');
    expect(call).toContain('engine: harness.engine');
    expect(call).toContain('model: harness.model');
  });

  it('a schedule set on an existing row carries the row\'s own pair', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/composeRepeat\(\{\s*\n?\s*product: item\.product[^}]*engine: item\.engine[^}]*model: item\.model/s);
  });

  // AND THE DOOR THAT EDITS A RULE IS GATED TOO, WHICH IS A HOLE THIS SLICE
  // OPENED AND HAD TO CLOSE. `zero:set-repeat` forwards its patch WHOLE to
  // `patchRule`, and the renderer is the one place in Agentbox that is not
  // trusted. Before this slice an `engine` in that patch was appended to the
  // jsonl and then dropped by the fold, because the field was not in `FIELDS`;
  // adding it to `FIELDS` made the same patch land. So a rule could have been
  // marked for Codex without ever passing `engineOffered` -- the gate, bypassed
  // by the one handler that takes a free-form patch.
  it('folds an engine off a bare patch, which is why the edit door has to gate one', () => {
    const rule = seed({}, SEEDED_AT);
    repeats.patchRule(dir, rule.id, { engine: 'codex' }, SEEDED_AT + 1000);
    expect(repeats.get(dir, rule.id).engine).toBe('codex');
  });

  it('gates the edit door on the same two tests as the compose door', () => {
    const ipc = read('main/ipc.mjs');
    const start = ipc.indexOf("ipcMain.handle('zero:set-repeat'");
    expect(start).toBeGreaterThan(-1);
    const next = ipc.indexOf('ipcMain.handle(', start + 1);
    const body = ipc.slice(start, next === -1 ? ipc.length : next);
    expect(body).toMatch(/engine: supervisor\.engineOffered\(engine\)/);
    expect(body).toMatch(/model: supervisor\.modelOffered\(engine, model\)/);
  });

  it('the bridge and the door both name them', () => {
    const preload = read('preload.cjs');
    const api = read('renderer/src/api.ts');
    const ipc = read('main/ipc.mjs');
    expect(preload).toContain("composeRepeat: (payload) => ipcRenderer.invoke('zero:compose-repeat', payload)");
    expect(api).toMatch(/composeRepeat\(p: \{[^}]*engine\?: string;[^}]*model\?: string;/s);
    expect(ipc).toMatch(/zero:compose-repeat[\s\S]{0,400}?engine: supervisor\.engineOffered\(engine\)/);
    expect(ipc).toMatch(/zero:compose-repeat[\s\S]{0,400}?model: supervisor\.modelOffered\(engine, model\)/);
  });

  // AND THE STORE'S OWN HAND-OFF IS RUN, NOT READ. `composeRepeat` names the
  // rule's fields one by one on its way into `setRule`, which is exactly how
  // `on` was lost off every weekly rule, so a source match on the signature is
  // not enough: the signature can name a field the call below it drops.
  it('carries both from the store\'s own door into the rule', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-engine-store-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    const productDir = path.join(accountRoot, 'agentbox');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'agentbox', name: Name, repoPath: null,
    }));
    const { Store } = await import('../main/store.mjs');
    const store = await new Store({
      storeRoot: tmp, accountId: 'test-account', accountRoot, products: [],
    }).init();

    const rule = store.composeRepeat('agentbox', {
      title: 'Onboarding QA', body: 'run it', priority: 5, every: 'day', at: '09:00',
      engine: 'codex', model: 'gpt-5.6-sol',
    });
    expect(rule).toMatchObject({ engine: 'codex', model: 'gpt-5.6-sol', every: 'day', at: '09:00' });
    expect(store.listRepeats()).toEqual([expect.objectContaining({
      engine: 'codex', model: 'gpt-5.6-sol',
    })]);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // The case that must not match: neither word is invented for a rule she wrote
  // without them.
  it('writes neither through that door when she named neither', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-engine-store-plain-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    const productDir = path.join(accountRoot, 'agentbox');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'agentbox', name: Name, repoPath: null,
    }));
    const { Store } = await import('../main/store.mjs');
    const store = await new Store({
      storeRoot: tmp, accountId: 'test-account', accountRoot, products: [],
    }).init();

    const rule = store.composeRepeat('agentbox', {
      title: 'Onboarding QA', priority: 5, every: 'day', at: '09:00',
      engine: null, model: null,
    });
    expect('engine' in rule).toBe(false);
    expect('model' in rule).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
