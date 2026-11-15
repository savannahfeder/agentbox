// A REPEATING TASK STOPS ONLY ON WORDS THAT NAME IT.
//
// What was wrong (2026-11-14, daily security review): stop_repeating_task took
// any four characters of the person's own words that held a stop word. On a
// thread reading "Please remove the unused imports", an agent quoting "remove"
// ended "Daily security review" in another project. Measured on a stand-in
// store: endedAt was set. The person chose (2026-11-15): their quoted words
// must name the task, except on a run of that task, where "Switch it off" is enough.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';

const morning = new Date(2026, 10, 15, 9).getTime();

describe('stopping a repeating task from a thread', () => {
  let product: { id: string }; let dir: string; let other: string; let repeats: Repeats;
  let core: typeof import('../mcp/core/repeats.mts');
  let work: typeof import('../main/store/work-items.mts');

  beforeEach(async () => {
    const home = appHome();
    const acct = `acct-named-${Math.random().toString(36).slice(2, 8)}`;
    process.env.STORE_ACCOUNT_ID = acct;
    fs.mkdirSync(path.join(home, 'accounts', acct), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Named ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', acct, product.id);
    other = path.join(home, 'accounts', acct, createProduct(`Elsewhere ${Math.random().toString(36).slice(2, 8)}`).id);
    repeats = new Repeats(await loadStore());
    core = await import('../mcp/core/repeats.mts');
    work = await import('../main/store/work-items.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });

  const rule = (title: string, where: string) => repeats.setRule(where, { title, body: `${title}.`, every: 'day', at: '09:00' }, morning - 86_400_000)!;
  const onAThread = (words: string, labels = ['founder']) => {
    const t = work.createWorkItem(dir, { title: 'Tidy the code', body: words, labels }, { source: 'founder', now: morning - 60_000 });
    process.env.ZERO_ITEM = t.id; process.env.ZERO_PRODUCT = product.id;
  };
  const stop = (which: string, askedBecause: string) => core.stopRepeatingTask({ which, askedBecause }, { now: morning });

  it('refuses a stop word from words about something else, in any project', () => {
    const review = rule('Daily security review', other);
    onAThread('Please remove the unused imports.');
    expect(() => stop('Daily security review', 'remove')).toThrow(/name/);
    expect(() => stop('Daily security review', 'Please remove')).toThrow(/name/);
    expect(repeats.get(other, review.id, morning)!.endedAt).toBeUndefined();
  });

  it('stops it when their words name it', () => {
    const review = rule('Daily security review', other);
    onAThread('Stop the security review, the new teammate does it now.');
    expect(stop('Daily security review', 'Stop the security review').ended).toBe(true);
    expect(repeats.get(other, review.id, morning)!.endedAt).toBe(morning);
  });

  it('takes a bare "Switch it off" on a run of that task', () => {
    const review = rule('Daily security review', dir);
    const run = work.createWorkItem(dir, { title: 'Daily security review', body: 'Run it.', labels: ['founder', `repeat:${review.id}`] }, { source: 'system', now: morning - 60_000 });
    work.updateWorkItem(dir, run.id, { answer: 'Switch it off' }, { source: 'founder', now: morning - 30_000 });
    process.env.ZERO_ITEM = run.id; process.env.ZERO_PRODUCT = product.id;
    expect(stop(review.id, 'Switch it off').ended).toBe(true);
  });

  it('but not on a run of another task', () => {
    const review = rule('Daily security review', dir);
    const digest = rule('Weekly digest', dir);
    const run = work.createWorkItem(dir, { title: 'Weekly digest', body: 'Run it.', labels: ['founder', `repeat:${digest.id}`] }, { source: 'system', now: morning - 60_000 });
    work.updateWorkItem(dir, run.id, { answer: 'Switch it off' }, { source: 'founder', now: morning - 30_000 });
    process.env.ZERO_ITEM = run.id; process.env.ZERO_PRODUCT = product.id;
    expect(() => stop(review.id, 'Switch it off')).toThrow(/name/);
    expect(repeats.get(dir, review.id, morning)!.endedAt).toBeUndefined();
  });

  it('does not count the schedule words in a name as naming it', () => {
    const review = rule('Daily security review', other);
    onAThread('Stop the daily standup reminder.');
    expect(() => stop('Daily security review', 'Stop the daily standup reminder')).toThrow(/name/);
    expect(repeats.get(other, review.id, morning)!.endedAt).toBeUndefined();
  });
});
