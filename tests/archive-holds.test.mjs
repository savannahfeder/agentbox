// What she archives stays archived, through the app's own store.
//
// 2026-08-06, The Frontier.
//
//   13:33:33  system  status done       <- archived
//   13:33:36  agent   HEARTBEAT         <- back to 'claimed'
//   13:34:05  agent   release           <- and so to 'open', in her inbox
//   13:44:39  system  status done       <- archived again
//   13:45:15  agent   status blocked    <- a worker's write outranked hers
//   13:46:59  system  status done       <- again
//
// Her exact sequence, replayed against a real store through the same the app
// modules the app uses in production.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';


let tmp; let store; let product; let disk; let shared;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-archive-'));
  const accountRoot = path.join(tmp, 'accounts', 'test-account');
  const productDir = path.join(accountRoot, 'testprod');
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({
    schemaVersion: 1, id: 'testprod', name: 'Test Product',
  }));
  const { Store } = await import('../main/store.mjs');
  disk = await import('../main/store/work-items.mjs');
  shared = await import('../shared/work-items.mjs');
  store = await new Store({
    storeRoot: tmp, accountId: 'test-account', accountRoot, products: [],
  }).init();
  [product] = store.listProducts();
});

afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const read = (id) => store.listItems().find((i) => i.id === id);

describe('the archive holds', () => {
  it('survives a heartbeat from the worker still running on it', async () => {
    const item = store.composeItem(product.slug, { title: 'Build the MVP', body: 'the full vision' });
    const claim = await disk.claimWorkItem(product.dir, { id: item.id, holder: 'worker-1' });
    store.recordSessionResult(product.slug, item.id, { result: 'blocked on her ruling' });
    expect(read(item.id).status).toBe('blocked');

    store.answerItem(product.slug, item.id, { status: 'done' });
    expect(read(item.id).status).toBe('done');

    // the timer tick that pulled it back out of her archive
    disk.heartbeatWorkItem(product.dir, item.id, { epoch: claim.epoch, holder: 'worker-1' });
    expect(read(item.id).status).toBe('done');
  });

  it('survives the straggler write and the release that followed it', async () => {
    const item = store.composeItem(product.slug, { title: 'Build the MVP, again', body: 'x' });
    const claim = await disk.claimWorkItem(product.dir, { id: item.id, holder: 'worker-1' });

    store.answerItem(product.slug, item.id, { status: 'done' });
    // a worker finishing up after she archived: its words land, its verdict on
    // the item's state does not
    store.recordSessionResult(product.slug, item.id, { result: 'here is what I did' });
    disk.releaseWorkItem(product.dir, item.id, { epoch: claim.epoch });

    const after = read(item.id);
    expect(after.status).toBe('done');
    expect(after.result).toBe('here is what I did');
  });

  it('still lets her change her mind, and hands the item back when she does', async () => {
    const item = store.composeItem(product.slug, { title: 'Reopen me', body: 'x' });
    store.answerItem(product.slug, item.id, { status: 'done' });
    store.answerItem(product.slug, item.id, { status: 'open' });
    expect(read(item.id).status).toBe('open');

    // and the machinery can move it again: her 'open' is a handback, not a
    // freeze, which is the whole reason status used to be written as machinery
    const claim = await disk.claimWorkItem(product.dir, { id: item.id, holder: 'worker-2' });
    expect(claim.claimed).toBe(true);
    expect(read(item.id).status).toBe('claimed');
    store.recordSessionResult(product.slug, item.id, { result: 'done thinking', status: 'blocked' });
    expect(read(item.id).status).toBe('blocked');
  });

  it('an archived item is not claimable at all', async () => {
    const item = store.composeItem(product.slug, { title: 'Nothing to do here', body: 'x' });
    store.answerItem(product.slug, item.id, { status: 'done' });
    const claim = await disk.claimWorkItem(product.dir, { id: item.id, holder: 'worker-3' });
    expect(claim.claimed).toBe(false);
    expect(claim.reason).toBe('already done');
  });

  it('a heartbeat never rewrites status, archive or not', () => {
    const line = shared.buildHeartbeatLine({ id: 'w-148ddc96dc', epoch: 2, holder: 'w', now: 1000 });
    expect(line.patch).toEqual({});
    expect(line.claim.leaseUntil).toBeGreaterThan(1000);
  });
});
