// AN AGENT CAN STOP A REPEATING TASK WHEN THE PERSON ASKS IT TO.
//
// On thread w-bb9005d535a1 the person answered "Switch it off" about an old
// daily task a new teammate replaced. The agent had no tool for it: the store
// tools could read, change or make a repeating task, never end one, so it
// handed the person steps to find the task and press Stop repeating, which
// they could not follow. Measured by reading mcp/tools.mts: no tool called
// endRule.
//
// The cases: stopped by its name or its id on the person's own thread, and on
// a teammate's run where the person answered; refused without their words, with
// words that ask for no stop, and with a teammate's words in place of theirs; a
// name two live tasks share refused, ending neither; an unknown name refused
// with the live names listed; a task in another product found by name; and
// stopping one that already stopped changes nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';
import { isOwed } from '../shared/repeats.mts';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const morning = at(2026, 11, 12, 9);

describe('an agent asked to stop a repeating task', () => {
  let product: { id: string }; let dir: string; let repeats: Repeats;
  let core: typeof import('../mcp/core/repeats.mts');
  let work: typeof import('../main/store/work-items.mts');
  let createProduct: typeof import('../mcp/core/products.mts').createProduct;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    ({ createProduct } = await import('../mcp/core/products.mts'));
    product = createProduct(`Stops ${Math.random().toString(36).slice(2, 8)}`);
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

  const rule = (title: string, where = dir) => repeats.setRule(where, { title, body: `${title}.`, every: 'day', at: '07:00' }, morning - 86_400_000)!;

  const onAThread = (answer: string | null = 'Switch it off', labels = ['founder']) => {
    const thread = work.createWorkItem(dir, { title: 'Set up the new helper', body: 'Replaces the old daily check.', labels }, { source: 'founder', now: morning - 60_000 });
    if (answer) work.updateWorkItem(dir, thread.id, { answer }, { source: 'founder', now: morning - 30_000 });
    process.env.ZERO_ITEM = thread.id;
    process.env.ZERO_PRODUCT = product.id;
    return thread;
  };

  const stop = (which: string, askedBecause: string | undefined = 'Switch it off', extra: { product?: string } = {}) =>
    core.stopRepeatingTask({ which, askedBecause, ...extra }, { now: morning });

  it('stops the task named, so it is not owed again', () => {
    const old = rule('Daily check');
    const other = rule('Weekly digest');
    onAThread();
    expect(isOwed(repeats.get(dir, old.id, morning)!, morning)).toBe(true);

    const done = stop('daily check');
    expect(done.repeat).toBe(old.id);
    expect(done.ended).toBe(true);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBe(morning);
    expect(repeats.due(dir, morning).map((d) => d.rule.id)).toEqual([other.id]);
  });

  it('stops it by its id', () => {
    const old = rule('Daily check');
    onAThread();
    expect(stop(old.id).repeat).toBe(old.id);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBe(morning);
  });

  it('stops it from a teammate\'s run the person answered', () => {
    const old = rule('Daily check');
    onAThread('Switch it off', ['founder', 'teammate:t-1', 'hop:0']);
    expect(stop('Daily check').ended).toBe(true);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBe(morning);
  });

  it('refuses without the person\'s words, or with words that ask for no stop, and ends nothing', () => {
    const old = rule('Daily check');
    onAThread('Looks good to me');
    expect(() => stop('Daily check', undefined)).toThrow(/own words on this thread/i);
    expect(() => stop('Daily check', 'Switch it off')).toThrow(/own words on this thread/i);
    expect(() => stop('Daily check', 'Looks good to me')).toThrow(/own words on this thread/i);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBeUndefined();
  });

  it('refuses a teammate\'s words standing in for the person\'s', () => {
    const old = rule('Daily check');
    const thread = onAThread(null, ['founder', 'teammate:t-1']);
    work.updateWorkItem(dir, thread.id, { answer: 'Switch it off' }, { source: 'system', now: morning - 10_000 });
    expect(() => stop('Daily check')).toThrow(/own words on this thread/i);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBeUndefined();
  });

  it('refuses a name two live tasks share, naming both, and ends neither', () => {
    const a = rule('Daily check');
    const b = rule('Daily check');
    onAThread();
    expect(() => stop('Daily check')).toThrow(new RegExp(`${a.id}.*${b.id}|${b.id}.*${a.id}`));
    expect(repeats.get(dir, a.id, morning)!.endedAt).toBeUndefined();
    expect(repeats.get(dir, b.id, morning)!.endedAt).toBeUndefined();
  });

  it('refuses a name nothing has, and lists the live ones', () => {
    rule('Daily check');
    onAThread();
    expect(() => stop('Nightly backup')).toThrow(/Daily check/);
  });

  it('finds a task in another product by its name', () => {
    const elsewhere = createProduct(`Other ${Math.random().toString(36).slice(2, 8)}`);
    const otherDir = path.join(appHome(), 'accounts', 'acct', elsewhere.id);
    const old = rule('Morning report', otherDir);
    onAThread();
    const done = stop('Morning report');
    expect(done.product).toBe(elsewhere.id);
    expect(repeats.get(otherDir, old.id, morning)!.endedAt).toBe(morning);
  });

  it('leaves one already stopped as it was', () => {
    const old = rule('Daily check');
    repeats.endRule(dir, old.id, morning - 5_000);
    onAThread();
    const again = stop(old.id);
    expect(again.ended).toBe(true);
    expect(repeats.get(dir, old.id, morning)!.endedAt).toBe(morning - 5_000);
  });
});
