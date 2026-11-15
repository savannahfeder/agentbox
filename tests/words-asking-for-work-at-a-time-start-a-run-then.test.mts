// WORDS ASKING FOR WORK AT A TIME START A RUN THEN (w-3e88a3c21d).
//
// "actually continue at 1:30 pm given our other plan resets at 2pm." The agent
// set runAt to 1:30 pm and quoted those words as deferBecause, which saved the
// moment as theirs: a reminder that brings the row back without a run
// (`wakesItselfAt` is 0 for a founder runAt). The tool's answer said nothing
// about which kind it saved, so the agent promised "the thread starts again on
// its own", and at 3:29 pm nothing had run. Measured on the row: wrote.runAt
// was source 'founder' and wakesItselfAt returned 0.
//
// Now words that ask for work keep the moment as one that starts a run, "remind
// me" words stay a reminder, and every runAt write answers in `saved` which of
// the two it is.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { wakesItselfAt } from '../shared/answers.mts';

const HOUR = 60 * 60 * 1000;

describe('a put-off in their words', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Work at a time ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
    store = await import('../main/store/work-items.mts');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const saidOnARow = (answer) => work.createItem(product.id, {
    title: 'Multiplayer onboarding', labels: ['founder'], answer,
  }, { source: 'founder' });

  async function putOff(answer, deferBecause) {
    const row = saidOnARow(answer);
    const at = Date.now() + 2 * HOUR;
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { runAt: at, deferBecause });
    claims.release(row.id);
    store.updateWorkItem(dir, row.id, { result: '**Paused until 1:30 pm.**' });
    return { after, answered: store.readWorkItem(dir, row.id), at };
  }

  it('starts a run at the time when they said "continue at 1:30 pm"', async () => {
    const said = 'actually continue at 1:30 pm given our other plan resets at 2pm so can just switch to that';
    const { after, answered, at } = await putOff(said, said);
    expect(after.wrote.runAt.source).toBe('agent');
    expect(wakesItselfAt(answered)).toBe(at);
    expect(after.saved).toMatch(/starts again on its own/);
    expect(after.saved).not.toMatch(/no run/i);
  });

  for (const said of ['start at 9am tomorrow', 'run it at 6 pm', 'pick this up at noon', 'resume this in an hour', 'keep going after the reset']) {
    it(`starts a run for "${said}"`, async () => {
      const { answered, at } = await putOff(said, said);
      expect(wakesItselfAt(answered)).toBe(at);
    });
  }

  it('keeps "remind me" a reminder that starts no run, and says so', async () => {
    const said = 'Remind me in 4 days to connect them';
    const { after, answered } = await putOff(said, 'Remind me in 4 days');
    expect(after.wrote.runAt.source).toBe('founder');
    expect(wakesItselfAt(answered)).toBe(0);
    expect(after.saved).toMatch(/NO run starts/);
  });

  it('keeps "remind me to continue" a reminder: they asked to be reminded, not for work', async () => {
    const said = 'remind me to continue this at 3pm';
    const { after } = await putOff(said, said);
    expect(after.wrote.runAt.source).toBe('founder');
    expect(after.saved).toMatch(/NO run starts/);
  });

  it('says a run starts when the agent sets the time itself', async () => {
    const row = saidOnARow('fix it');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { runAt: Date.now() + HOUR });
    expect(after.saved).toMatch(/starts again on its own/);
  });

  it('says nothing about a moment when none was written', async () => {
    const row = saidOnARow('fix it');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { note: 'Looking.' });
    expect(after.saved).toBeUndefined();
  });
});
