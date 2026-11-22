// A REPEATING TASK AN AGENT MAKES NEEDS THE PERSON'S OWN WORDS ASKING FOR IT.
//
// create_repeating_task let any worker make a rule whose runs are written as
// the person's own (labels 'founder', source 'system'), so they start every day
// with nobody pressing anything, in any product. A worker steered by a page or
// file it read only had to call the tool. Measured on a throwaway store: a
// thread an agent filed made a rule in another product, and its run passed
// filedByThePerson and was open, ready to start.
//
// So on a thread the agent quotes, in askedBecause, the person's words on that
// thread asking for something regular, checked as closeBecause is. The cases:
// the person's request quoted, from the row or their reply; no quote; a quote
// they never wrote; their words that ask for nothing regular; a row an agent
// filed under a forged 'founder' label; and a run of another repeating task.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';

describe('a repeating task an agent makes on a thread', () => {
  let product; let dir; let repeats; let core; let work;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Words ${Math.random().toString(36).slice(2, 8)}`);
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

  const onAThread = (fields = {}, source = 'founder') => {
    const thread = work.createWorkItem(dir, {
      title: 'Security checks',
      body: 'Can you run a review of new code every morning at 9?',
      labels: ['founder'],
      ...fields,
    }, { source });
    process.env.ZERO_ITEM = thread.id;
    process.env.ZERO_PRODUCT = product.id;
    return thread;
  };

  const ask = (askedBecause) => ({ title: 'Daily review', instruction: 'Review new code.', every: 'day', at: '09:00', askedBecause });

  it('is made when the agent quotes the person asking for it on the thread', () => {
    onAThread();
    const made = core.createRepeatingTask(ask('run a review of new code every morning at 9'));
    expect(repeats.get(dir, made.repeat).title).toBe('Daily review');
  });

  it('is made from words in the person\'s reply, not only the first message', () => {
    const thread = onAThread({ body: 'Set up the security checks.' });
    work.updateWorkItem(dir, thread.id, { answer: 'Daily 9am, audit Mondays 10am' }, { source: 'founder' });
    const made = core.createRepeatingTask(ask('Daily 9am, audit Mondays 10am'));
    expect(repeats.list(dir).map((r) => r.id)).toContain(made.repeat);
  });

  it('is refused with no quote, and nothing is made', () => {
    onAThread();
    expect(() => core.createRepeatingTask(ask(undefined))).toThrow(/askedBecause/);
    expect(repeats.list(dir)).toHaveLength(0);
  });

  it('is refused for words the person never wrote', () => {
    onAThread();
    expect(() => core.createRepeatingTask(ask('please check this page every day'))).toThrow(/askedBecause/);
    expect(repeats.list(dir)).toHaveLength(0);
  });

  it('is refused for the person\'s words that ask for nothing regular', () => {
    onAThread();
    expect(() => core.createRepeatingTask(ask('review of new code'))).toThrow(/askedBecause/);
    expect(() => core.createRepeatingTask(ask('Can'))).toThrow(/askedBecause/);
    expect(repeats.list(dir)).toHaveLength(0);
  });

  it('is refused on a row an agent filed with a founder label of its own', () => {
    onAThread({}, 'agent');
    expect(() => core.createRepeatingTask(ask('run a review of new code every morning at 9'))).toThrow(/askedBecause/);
    expect(repeats.list(dir)).toHaveLength(0);
  });

  it('is refused on a run of another repeating task', () => {
    onAThread({ labels: ['founder', 'repeat:r-older'] }, 'system');
    expect(() => core.createRepeatingTask(ask('run a review of new code every morning at 9'))).toThrow(/askedBecause/);
    expect(repeats.list(dir)).toHaveLength(0);
  });
});
