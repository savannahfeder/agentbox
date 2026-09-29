// Composing a repeating task must not be able to leave an ordinary one-shot
// behind.
//
// composeItem appends an open founder item BEFORE it applies her content, and
// another copy of the app can spawn that intermediate state, so a rule that turned out to
// be unkeepable would leave a task running that she never asked to run once.
// The rule is therefore written first, and this path creates no work item at
// all: the first run arrives on the next tick.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { machineryPath } from '../main/store/home.mjs';

let root, dir, store;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  store = await new Store({
    accountRoot: root,
    products: [],
  }).init();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const items = () => store.modules.workItemsDisk.readWorkItems(dir);

describe('composing a repeating task', () => {
  it('writes a rule and no work item', () => {
    store.composeRepeat('p', { title: 'Onboarding QA', body: 'run it', every: 'day', at: '09:00' });
    expect(store.listRepeats().length).toBe(1);
    expect([...items()].length).toBe(0);
  });

  it('a schedule it cannot keep is refused, and leaves nothing behind', () => {
    expect(() => store.composeRepeat('p', { title: 'x', every: 'day', at: '25:00' })).toThrow();
    expect(store.listRepeats().length).toBe(0);
    expect([...items()].length).toBe(0);
  });

  // The exact call behind the toast she photographed: "Error invoking remote
  // method 'zero:compose-repeat': Error: not a schedule the app can keep: every
  // week at 08:00". This method named the rule's fields one by one and `on` was
  // not among them, so the day was dropped in transit and every weekly rule was
  // refused for missing the thing that had just been removed.
  it('keeps the day of a weekly rule all the way to disk', () => {
    const rule = store.composeRepeat('p', {
      title: 'Onboarding QA', body: 'run it', every: 'week', on: 4, at: '08:00',
    });
    expect(rule).toMatchObject({ every: 'week', on: 4, at: '08:00' });
    expect(store.listRepeats()[0]).toMatchObject({ every: 'week', on: 4, at: '08:00' });
    expect(fs.readFileSync(machineryPath(dir, 'repeats.jsonl'), 'utf8')).toContain('"on":4');
  });

  // And the refusal, when it is right to refuse, says which part is missing
  // rather than printing the half that was fine.
  it('names the missing day when a weekly rule has none', () => {
    expect(() => store.composeRepeat('p', { title: 'x', every: 'week', at: '08:00' }))
      .toThrow(/every week on no day at 08:00/);
  });

  it('carries her product and its name, so one list can be drawn', () => {
    store.composeRepeat('p', { title: 'Onboarding QA', every: 'day', at: '09:00' });
    expect(store.listRepeats()[0]).toMatchObject({ product: 'p', productName: 'P', at: '09:00' });
  });

  // A repeat used to be refused on a personal workspace, whose sessions could
  // never report a quiet run. Personal projects are deleted (w-d19d6d387c,
  // 2026-09-22) and every project can hold a repeat.

  it('ending one takes it out of her list', () => {
    const rule = store.composeRepeat('p', { title: 'Onboarding QA', every: 'day', at: '09:00' });
    store.endRepeat('p', rule.id);
    expect(store.listRepeats().length).toBe(0);
  });

  it('changing the time keeps the same rule rather than making a second', () => {
    const rule = store.composeRepeat('p', { title: 'Onboarding QA', every: 'day', at: '09:00' });
    store.setRepeat('p', rule.id, { at: '07:00' });
    const all = store.listRepeats();
    expect(all.length).toBe(1);
    expect(all[0]).toMatchObject({ id: rule.id, at: '07:00' });
  });
});
