// A PUT-OFF THEY ASKED FOR TAKES THE ROW OUT OF THEIR INBOX (w-d6ea290028).
//
// "Remind me in 4 days to connect Benji with Nick." The worker put the row off
// until Sunday 9 AM, exactly as asked, and the row stayed in Needs you wearing
// "Scheduled" and two options, so the user could not tell whether closing it
// would lose the reminder. Measured on the row itself: its runAt was stamped
// source 'agent', and `parkedByAgent` (list-rules.ts) deliberately shows a row
// an agent parked, so an agent cannot hide its own question.
//
// That rule stays. What changes is that a worker can now show the put-off was
// THEIRS: `deferBecause` carries their own words asking for it, checked against
// what they wrote on the row the same way `closeBecause` is, and then the
// moment is written as theirs, which is what hides a row until it comes due.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { belongsInInbox, hiddenUntil, parkedByAgent } from '../renderer/src/list-rules.ts';

const DAY = 24 * 60 * 60 * 1000;

describe('putting a row off', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Putting off ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mjs');
    store = await import('../main/store/work-items.mjs');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const hers = (fields = {}) => work.createItem(product.id, {
    title: 'Remind me in 4 days to connect Benji with Nick', labels: ['founder'], ...fields,
  }, { source: 'founder' });

  const inInbox = (item, now = Date.now()) => belongsInInbox(item, { hiddenUntil: hiddenUntil(item), now });

  it('leaves the inbox until then when the worker quotes their ask', async () => {
    const row = hers();
    const sunday = Date.now() + 4 * DAY;
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { runAt: sunday, deferBecause: 'Remind me in 4 days' });
    expect(after.runAt).toBe(sunday);
    expect(after.wrote.runAt.source).toBe('founder');
    expect(after.deferredAsAgent).toBeUndefined();

    // The worker exits: its claim goes back and its answer lands.
    claims.release(row.id);
    store.updateWorkItem(dir, row.id, { result: "**I've set the reminder for Sunday at 9 AM.**" });
    const answered = store.readWorkItem(dir, row.id);
    expect(parkedByAgent(answered)).toBe(false);
    expect(hiddenUntil(answered)).toBe(sunday);
    expect(inInbox(answered)).toBe(false);
  });

  it('comes back with its answer the moment it is due', async () => {
    const row = hers();
    const sunday = Date.now() + 4 * DAY;
    await claims.claim({ id: row.id });
    await claims.update(row.id, { runAt: sunday, deferBecause: 'remind me in 4 days' });
    // The worker exits: its claim goes back and its answer lands.
    claims.release(row.id);
    store.updateWorkItem(dir, row.id, { result: "**I've set the reminder for Sunday at 9 AM.**" });
    const answered = store.readWorkItem(dir, row.id);
    expect(inInbox(answered, sunday - 1)).toBe(false);
    expect(inInbox(answered, sunday + 1)).toBe(true);
  });

  it('keeps a put-off nobody asked for in the inbox, as before', async () => {
    const row = hers();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { runAt: Date.now() + DAY });
    expect(after.wrote.runAt.source).toBe('agent');
    expect(parkedByAgent(after)).toBe(true);
    expect(hiddenUntil(after)).toBe(0);
  });

  it('does not take words they never wrote, and says so', async () => {
    const row = hers();
    await claims.claim({ id: row.id });
    const later = Date.now() + DAY;
    const after = await claims.update(row.id, { runAt: later, deferBecause: 'put this off until Friday' });
    // The schedule still lands, as the brake it always was, but as the agent's.
    expect(after.runAt).toBe(later);
    expect(after.wrote.runAt.source).toBe('agent');
    expect(after.deferredAsAgent).toMatch(/stays in their inbox/);
  });

  it('does not let a row an agent filed quote the agent', async () => {
    const row = work.createItem(product.id, { title: 'Remind me in 4 days to check the build' });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { runAt: Date.now() + DAY, deferBecause: 'Remind me in 4 days' });
    expect(after.wrote.runAt.source).toBe('agent');
  });

  it('does nothing with the words when there is no moment to put it off to', async () => {
    const row = hers();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { note: 'Looking at it.', deferBecause: 'Remind me in 4 days' });
    expect(after.runAt ?? 0).toBe(0);
    expect(after.wrote.runAt).toBeUndefined();
  });
});
