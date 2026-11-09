// A NOTE TO A DONE THREAD REOPENS IT, RATHER THAN BEING REFUSED.
//
// Dev: an agent took a fresh screenshot for Sofia's "Cancel booking
// confirmation flow" thread and came back with "That thread is closed and
// refuses new notes. My note is parked in the product folder." Sofia had marked
// it Done an hour before, so the picture never reached her. Measured: a write
// to a done row tries to claim it, the claim answers "already done", and the
// write is parked where nobody reads it.
//
// Now the row opens again with the note on it. What still parks: a write to a
// row another session is working, and a write that only says "done".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { readPendingWrites } from '../main/store/pending-writes.mts';
import { belongsInInbox, hiddenUntil } from '../renderer/src/list-rules.ts';

describe('a write to a thread that was marked done', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Reopen ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
    store = await import('../main/store/work-items.mts');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'other-thread', heartbeatMs: 60_000 });
  });
  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const doneRow = () => {
    const row = work.createItem(product.id, { title: 'Cancel booking confirmation flow' }, { source: 'founder' });
    store.updateWorkItem(dir, row.id, { status: 'done' }, { source: 'founder' });
    return row;
  };
  const parked = (id) => readPendingWrites(dir, id).length;

  it('opens it again with the note on it', async () => {
    const row = doneRow();
    const after = await claims.update(row.id, { note: 'The new cancel dialog: ![cancel](designs/cancel-dialog-v2.png)' });
    expect(after.status).not.toBe('done');
    expect(after.note).toContain('cancel-dialog-v2.png');
    claims.release(row.id);
    const now = store.readWorkItem(dir, row.id);
    expect(now.status).not.toBe('done');
    expect(belongsInInbox(now, { hiddenUntil: hiddenUntil(now), now: Date.now() })).toBe(true);
    expect(parked(row.id)).toBe(0);
  });

  it('opens it for a result too, and says so to the agent', async () => {
    const row = doneRow();
    const after = await claims.update(row.id, { result: 'Here is the screenshot.' });
    expect(after.result).toBe('Here is the screenshot.');
    expect(after.reopened).toMatch(/was marked done.*opened it again/i);
  });

  it('a write that only says done leaves it as it was', async () => {
    const row = doneRow();
    await expect(claims.update(row.id, { status: 'done' })).rejects.toThrow(/already done/);
    expect(store.readWorkItem(dir, row.id).status).toBe('done');
  });

  it('a row another session is working is still refused', async () => {
    const row = work.createItem(product.id, { title: 'Busy' }, { source: 'founder' });
    const other = work.createClaimRegistry({ holder: 'busy-thread', heartbeatMs: 60_000 });
    await other.claim({ id: row.id });
    await expect(claims.update(row.id, { note: 'hello' })).rejects.toThrow(/held by busy-thread/);
    other._stop();
  });
});
