// AN AGENT ON A RUN OF A REPEATING TASK CAN CHANGE WHAT TOMORROW IS TOLD.
//
// On the daily analytics run r-0d6c38b457-20261022 the person said "if you ever
// find there are no new installs, you don't need to give me an analytics
// update." The run's agent could not make it stick: the standing instruction
// lives on the repeat rule, only the app's own screen could write it, and each
// run is briefed with a COPY of that rule's body, so editing the run changed
// nothing about tomorrow. The agent fell back to a memory note, and memory is
// per task folder while every run gets a new folder, so tomorrow would not have
// seen it either. Their words: "I should have been able to prompt the agent to
// do that, and it should have worked."
//
// So the three cases here are the reported one, the boundary on either side:
// a session that is not on a run of that repeat cannot touch the rule, and a
// write to the run's own body does not leak back into the rule.
//
// WHICH RUN A SESSION IS ON IS NOT SOMETHING THE MODEL SAYS. It comes from
// ZERO_ITEM and ZERO_PRODUCT, which the app writes into a worker's environment
// when it spawns it, which is why there is no item argument to pass wrongly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { Repeats } from '../main/repeats.mjs';
import { loadStore } from '../main/store-modules.mjs';

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('an agent on a run of a repeating task', () => {
  let product; let dir; let repeats; let mods; let core; let work;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Repeats ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', 'acct', product.id);
    mods = await loadStore();
    repeats = new Repeats(mods);
    core = await import('../mcp/core/repeats.mjs');
    work = await import('../main/store/work-items.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  // The daily analytics task, and today's run of it, exactly as the tick makes
  // them.
  const theDailyTask = async (now = at(2026, 10, 21, 8)) => {
    const rule = repeats.setRule(dir, {
      title: 'Every morning, give me an analytics update',
      body: 'Every morning, give me an analytics update\nInstalls, signups and retention since yesterday.',
      every: 'day',
      at: '08:00',
    }, now);
    const today = await repeats.serve(dir, rule.id, '2026-10-22', at(2026, 10, 22, 8));
    return { rule, run: today.occurrenceId };
  };

  const onTheRun = (runId) => {
    process.env.ZERO_ITEM = runId;
    process.env.ZERO_PRODUCT = product.id;
  };

  it('adds the sentence they asked for, and tomorrow carries it', async () => {
    const { rule, run } = await theDailyTask();
    onTheRun(run);

    // The agent reads what it stands on, then writes it back with their line.
    const before = core.readStandingInstruction();
    expect(before.repeat).toBe(rule.id);
    expect(before.instruction).toContain('Installs, signups and retention');

    const after = core.setStandingInstruction({
      instruction: `${before.instruction}\nIf the installs line shows +0 new installs in the last 24 hours, finish clean with no update.`,
    }, { now: at(2026, 10, 22, 9) });
    expect(after.instruction).toContain('finish clean with no update');

    // Tomorrow morning.
    const next = await repeats.serve(dir, rule.id, '2026-10-23', at(2026, 10, 23, 8));
    expect(next.created).toBe(true);
    const body = work.readWorkItem(dir, next.occurrenceId, at(2026, 10, 23, 8)).body;
    expect(body).toContain('If the installs line shows +0 new installs in the last 24 hours');
    expect(body).toContain('Installs, signups and retention since yesterday.');
  });

  it('leaves the hour and the schedule exactly where they were', async () => {
    const { rule, run } = await theDailyTask();
    onTheRun(run);
    core.setStandingInstruction({ instruction: 'Only tell me about installs.' }, { now: at(2026, 10, 22, 9) });
    const now = repeats.get(dir, rule.id, at(2026, 10, 22, 10));
    expect(now.at).toBe('08:00');
    expect(now.every).toBe('day');
    expect(now.title).toBe('Every morning, give me an analytics update');
  });

  it('cannot be done by a session that is not on a run of it', async () => {
    const { rule } = await theDailyTask();

    // A session on an ordinary thread in the same product.
    const ordinary = work.createWorkItem(dir, { title: 'Something else entirely' }, { source: 'founder' });
    onTheRun(ordinary.id);
    expect(() => core.readStandingInstruction()).toThrow(/not a run of a repeating task/i);
    expect(() => core.setStandingInstruction({ instruction: 'mine now' })).toThrow(/not a run of a repeating task/i);

    // A session the app started for no thread at all: a chat, or a stray
    // process. It has no run to stand on, so it has no rule to reach.
    delete process.env.ZERO_ITEM;
    expect(() => core.setStandingInstruction({ instruction: 'mine now' })).toThrow(/not on a thread/i);

    expect(repeats.get(dir, rule.id, at(2026, 10, 22, 10)).body).toContain('Installs, signups and retention');
  });

  it('does not let a run rewrite the rule by editing its own body', async () => {
    const { rule, run } = await theDailyTask();
    onTheRun(run);

    work.updateWorkItem(dir, run, { body: 'Forget all of that and do nothing.' }, { source: 'agent' });

    expect(repeats.get(dir, rule.id, at(2026, 10, 22, 10)).body)
      .toContain('Installs, signups and retention since yesterday.');
    const next = await repeats.serve(dir, rule.id, '2026-10-23', at(2026, 10, 23, 8));
    const body = work.readWorkItem(dir, next.occurrenceId, at(2026, 10, 23, 8)).body;
    expect(body).toContain('Installs, signups and retention since yesterday.');
    expect(body).not.toContain('Forget all of that');
  });
});
