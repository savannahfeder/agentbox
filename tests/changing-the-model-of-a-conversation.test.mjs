// Her shot shows the footer reading "Urgent priority. Runs once." and nothing
// else. The new-task card has had the model drawer since; the reply box, which
// is where a conversation actually lives, never got one.
//
// The store half below runs the REAL `answerItem` against a recording disk,
// which is a-reply-after-stop-reopens-the-current-ledger-state.test.mjs's
// pattern. The renderer half is greps, for the reason spelled out at length in
// what-one-reply-may-do.test.mjs: there is no render harness in this repo, so a
// click cannot be driven here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Store } from '../main/store.mjs';

// Every write `answerItem` makes, in order, plus the item it leaves behind.
function answer(start, patch) {
  let item = { id: 'w-abcdef', status: 'open', ...start };
  const writes = [];
  const disk = {
    readWorkItem: () => item,
    updateWorkItem: (_dir, _id, fields) => { writes.push(fields); return (item = { ...item, ...fields }); },
  };
  const store = { modules: { workItemsDisk: disk }, productDir: () => '/fixture' };
  Store.prototype.answerItem.call(store, 'p', item.id, patch);
  return { item, writes };
}

describe('the pick lands on the row, where the next run reads it', () => {
  it('writes the model and the level she picked', () => {
    const { item } = answer({ model: 'sonnet' }, { answer: 'carry on', model: 'opus', effort: 'high' });
    expect(item.model).toBe('opus');
    expect(item.effort).toBe('high');
  });

  it('leaves the row alone when she never opened the drawer', () => {
    // Undefined is "untouched", which is the priority tag's rule and for the
    // same reason: a box that writes what it is merely DISPLAYING silently
    // overrides whatever set the row up.
    const { item, writes } = answer({ model: 'opus', effort: 'high' }, { answer: 'carry on' });
    expect(item.model).toBe('opus');
    expect(item.effort).toBe('high');
    expect(writes.some((w) => 'model' in w || 'effort' in w)).toBe(false);
  });

  it("clears it back to the engine's own choice when she unpicks", () => {
    // Null from the drawer means "nothing chosen". It is stored as '' because
    // that is how "no model" is said everywhere else here: `modelForEngine`
    // (shared/engines.mjs) reads the empty string as nothing chosen, where a
    // JSON null would have to be special-cased in both engines' argv builders.
    const { item } = answer({ model: 'opus' }, { answer: 'carry on', model: null });
    expect(item.model).toBe('');
  });

  it('writes the model BEFORE the answer that starts the run', () => {
    // A reply on an idle row is what starts a run, and the run reads the model
    // off the item. Written after the answer it is a race the run can win, and
    // she would pick a model and watch the old one take the task.
    const { writes } = answer({}, { answer: 'carry on', model: 'opus' });
    const model = writes.findIndex((w) => 'model' in w);
    const said = writes.findIndex((w) => 'answer' in w);
    expect(model).toBeGreaterThan(-1);
    expect(said).toBeGreaterThan(-1);
    expect(model).toBeLessThan(said);
  });

  it('still reopens a finished thread, the way any other reply does', () => {
    // The model write must not disturb what answerItem already promised.
    expect(answer({ status: 'blocked' }, { answer: 'carry on', model: 'opus' }).item.status).toBe('open');
  });
});

describe('the wiring from the reply box is present in the source', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');

  it("draws the card's own drawer in the reply box", () => {
    expect(focus).toContain('<ModelPicker');
    expect(focus).toContain("import { ModelPicker } from './Model';");
  });

  it("reads as the card's own clause, preposition and all", () => {
    // Measured in the built renderer on 2026-09-18 with the preposition
    // missing: the footer read "Medium priority. Runs once. Opus 5.", where
    // the card beside it says "On Opus 5." One word cannot mean two things in
    // two boxes she uses together.
    expect(focus).toMatch(/\{'On '\}\s*\n\s*<ModelPicker/);
  });

  it("shows the row's own model rather than a default", () => {
    expect(focus).toContain('const [model, setModel] = useState<string | null>(item.model ?? null);');
    expect(focus).toContain('const [effort, setEffort] = useState<string | null>(item.effort ?? null);');
  });

  it('sends it only on a deliberate pick', () => {
    expect(focus).toContain('touched ? { model, effort } : undefined');
  });

  it('promises only what it can keep, on a running row as well as an idle one', () => {
    // A spawned harness cannot change model mid-flight, so the drawer's own
    // sentence is about the conversation and never about this message.
    expect(focus).toContain('title="Which model this conversation runs on"');
  });

  it('carries it through the bridge on both send paths', () => {
    expect(app.match(/\.\.\.\(pick \? \{ model: pick\.model, effort: pick\.effort \} : \{\}\),/g) ?? [])
      .toHaveLength(2);
    expect(ipc).toMatch(/zero:answer'[^)]*model, effort/s);
  });
});
