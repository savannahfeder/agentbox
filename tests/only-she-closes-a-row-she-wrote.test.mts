// ONLY THE USER CLOSES A ROW THEY WROTE, UNLESS THEY ASKED FOR IT (w-e372d22a99).
//
// When the user asks for something, the agent's job is to hand the answer back.
// It closes the row only when the user explicitly says the row is done.
//
// The row that raised it was w-3384aa9e5c: a request for help, which a worker
// answered and closed 49 seconds after claiming, so the user found their own
// ask in Closed, and it was not the only one. The rule lives where every worker's write
// goes through, the store tool, so no brief has to be remembered for it to hold.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';

describe('closing a row', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Closing ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mjs');
    store = await import('../main/store/work-items.mjs');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const hers = (fields = {}) => work.createItem(product.id, {
    title: 'Help me word a short note to Sam', body: 'I need your help with this.', labels: ['founder'], ...fields,
  }, { source: 'founder' });

  const sheSays = (id, answer) => store.updateWorkItem(dir, id, { answer }, { source: 'founder' });

  it('answers her ask and leaves it open, and says so', async () => {
    const row = hers();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'done', result: '**Here is the message.**' });
    expect(after.status).toBe('open');
    expect(after.result).toBe('**Here is the message.**');
    expect(after.leftOpen).toMatch(/left OPEN/);
    // The claim went back, so her reply finds the row free.
    expect(store.readWorkItem(dir, row.id).claim ?? null).toBeFalsy();
  });

  it('closes it when she asked, quoting her', async () => {
    const row = hers();
    sheSays(row.id, "Perfect, thanks. All right, I'm done with this.");
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, {
      status: 'done', result: 'Closed, as you asked.', closeBecause: "All right, I’m done with this",
    });
    expect(after.status).toBe('done');
    expect(after.leftOpen).toBeUndefined();
  });

  it('does not take words she never wrote', async () => {
    const row = hers();
    sheSays(row.id, 'Can you make it shorter?');
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'done', result: 'Shorter now.', closeBecause: 'close it' });
    expect(after.status).toBe('open');
  });

  it('still lets an agent close a row an agent filed', async () => {
    const row = work.createItem(product.id, { title: 'Rename the settings tab' });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'done', result: 'Renamed.' });
    expect(after.status).toBe('done');
  });

  it('still lets a clean run of her repeating task close quietly', async () => {
    const row = hers({ labels: ['founder', 'repeat:r-1'] });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'done', labels: ['founder', 'repeat:r-1', 'clean'] });
    expect(after.status).toBe('done');
  });

  it('leaves blocked alone, which is not closing', async () => {
    const row = hers();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'blocked', result: 'Waiting on your login.' });
    expect(after.status).toBe('blocked');
  });
});
