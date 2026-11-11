// AN AGENT CAN MAKE A NEW REPEATING TASK WHEN THE PERSON ASKS FOR ONE.
//
// On the "Regular app security checks" thread the person chose a daily review
// of new code and a weekly full audit. The agent shipped everything else, then
// ended with "I can't create repeating tasks from here, so these two are
// yours" and two sets of steps to type into the app by hand. The store tools
// only let a run of a repeating task change its own instruction; nothing
// could make one. Measured by reading mcp/tools.mts: no tool called setRule.
//
// The cases: a daily and a weekly task made from an ordinary thread, each
// served by the tick with the words asked for; the thread's own coding agent
// and model carried onto the rule; the first run now by default and at its
// next time when asked; a schedule the app cannot keep refused; and the same
// ask sent twice making one task, not two.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';
import { isOwed } from '../shared/repeats.mts';

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('an agent asked for a repeating task', () => {
  let product; let dir; let repeats; let core; let work;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Checks ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', 'acct', product.id);
    repeats = new Repeats(await loadStore());
    core = await import('../mcp/core/repeats.mts');
    work = await import('../main/store/work-items.mts');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const onAThread = (fields = {}) => {
    const thread = work.createWorkItem(dir, { title: 'Regular app security checks', ...fields }, { source: 'founder' });
    process.env.ZERO_ITEM = thread.id;
    process.env.ZERO_PRODUCT = product.id;
    return thread;
  };

  it('makes a daily task whose runs carry the words asked for', async () => {
    onAThread();
    const now = at(2026, 11, 10, 20);
    const made = core.createRepeatingTask({
      title: 'Daily security review',
      instruction: 'Do the daily security review in docs/security-checks.md, over what shipped since the last one.',
      every: 'day',
      at: '09:00',
    }, { now });

    expect(made.schedule).toMatch(/daily at 9:00/i);
    const rule = repeats.get(dir, made.repeat, now);
    expect(rule.title).toBe('Daily security review');

    const served = await repeats.serve(dir, rule.id, '2026-11-10', now);
    const body = work.readWorkItem(dir, served.occurrenceId, now).body;
    expect(body).toContain('over what shipped since the last one.');
  });

  it('makes a weekly task on the day named', () => {
    onAThread();
    const now = at(2026, 11, 10, 20);
    const made = core.createRepeatingTask({
      title: 'Weekly security audit',
      instruction: 'Do the weekly full security audit in docs/security-checks.md.',
      every: 'week',
      on: 'Monday',
      at: '10:00',
    }, { now });
    const rule = repeats.get(dir, made.repeat, now);
    expect(rule.every).toBe('week');
    expect(rule.on).toBe(1);
    expect(made.schedule).toMatch(/Mondays at 10:00/i);
  });

  it('runs on the coding agent and model of the thread that made it', () => {
    onAThread({ engine: 'codex', model: 'gpt-5.6-sol' });
    const made = core.createRepeatingTask({ title: 'Audit', instruction: 'Audit.', every: 'day', at: '09:00' });
    const rule = repeats.get(dir, made.repeat);
    expect(rule.engine).toBe('codex');
    expect(rule.model).toBe('gpt-5.6-sol');

    onAThread();
    const plain = repeats.get(dir, core.createRepeatingTask({ title: 'Review', instruction: 'Review.', every: 'day', at: '09:00' }).repeat);
    expect(plain.engine).toBeUndefined();
    expect(plain.model).toBeUndefined();
  });

  it('starts its first run now unless told to wait for its next time', () => {
    onAThread();
    const now = at(2026, 11, 10, 20);
    const now1 = repeats.get(dir, core.createRepeatingTask({ title: 'A', instruction: 'A.', every: 'day', at: '09:00' }, { now }).repeat, now);
    expect(isOwed(now1, now)).toBe(true);

    const later = repeats.get(dir, core.createRepeatingTask({ title: 'B', instruction: 'B.', every: 'day', at: '09:00', startNow: false }, { now }).repeat, now);
    expect(isOwed(later, now)).toBe(false);
    expect(isOwed(later, at(2026, 11, 11, 9) + 60_000)).toBe(true);
  });

  it('refuses a schedule the app cannot keep, and makes nothing', () => {
    onAThread();
    expect(() => core.createRepeatingTask({ title: 'A', instruction: 'A.', every: 'week', at: '09:00' })).toThrow(/day/i);
    expect(() => core.createRepeatingTask({ title: 'A', instruction: 'A.', every: 'day', at: '9am' })).toThrow(/schedule/i);
    expect(() => core.createRepeatingTask({ title: 'A', instruction: '  ', every: 'day', at: '09:00' })).toThrow(/instruction/i);
    expect(repeats.list(dir)).toHaveLength(0);
  });

  it('makes one task when the same ask arrives twice', () => {
    onAThread();
    const ask = { title: 'Daily review', instruction: 'Review new code.', every: 'day', at: '09:00' };
    const first = core.createRepeatingTask(ask);
    const second = core.createRepeatingTask(ask);
    expect(second.repeat).toBe(first.repeat);
    expect(repeats.list(dir)).toHaveLength(1);

    // A different hour is a different task.
    core.createRepeatingTask({ ...ask, at: '17:00' });
    expect(repeats.list(dir)).toHaveLength(2);
  });

  it('can be made in a named product from a session on no thread', () => {
    const made = core.createRepeatingTask({ product: product.id, title: 'A', instruction: 'A.', every: 'weekday', at: '08:30' });
    expect(repeats.get(dir, made.repeat).every).toBe('weekday');
    expect(() => core.createRepeatingTask({ title: 'A', instruction: 'A.', every: 'day', at: '09:00' })).toThrow(/product/i);
  });
});
