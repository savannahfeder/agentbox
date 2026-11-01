// A THREAD THAT SHIPS ON ITS OWN CLOSES ITSELF (w-e4d49a1539).
//
// A project set to ship without asking (shared/ship-mode.mjs) still left every
// shipped thread open, so it reached Needs you and waited for a keypress from
// the person the setting was meant to leave out. Measured on the queue and the
// store: before the change `shipped` wrote only the note and the labels, and
// the row stayed open whatever the project's setting.
//
// What must not change: a project that asks first keeps its rows open after a
// ship, as it always has, and a ship that fails never closes anything.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHIP_LABEL, ShipQueue } from '../main/ship-queue.mjs';

let tmp; let repo; let userDir; let folders;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ships-closes-'));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }];
const folderFor = (item) => path.join(folders, item.id);
const row = { id: 'w-a', product: 'team', status: 'open', labels: [SHIP_LABEL, 'founder'], updatedAt: 1000 };

function queue({ closes, code = 0 }) {
  const calls = [];
  const store = { shipped: (...a) => calls.push(['shipped', ...a]), shipFailed: (...a) => calls.push(['shipFailed', ...a]) };
  const q = new ShipQueue({
    store, userDir, folderFor, isLive: () => false, handBack: () => {},
    closesWhenShipped: (product) => closes.includes(product.slug),
    run: async () => ({ code, out: code ? 'FAIL tests/x.test.mjs' : 'ship: shipped abc1234.' }),
  });
  return { q, calls };
}

describe('the queue', () => {
  it('closes the row when the project ships on its own', async () => {
    const { q, calls } = queue({ closes: ['team'] });
    await q.tick([row], products());
    expect(calls).toEqual([['shipped', 'team', 'w-a', { sha: 'abc1234', labels: ['founder'], close: true }]]);
  });

  it('leaves it open when the project asks first', async () => {
    const { q, calls } = queue({ closes: [] });
    await q.tick([row], products());
    expect(calls).toEqual([['shipped', 'team', 'w-a', { sha: 'abc1234', labels: ['founder'], close: false }]]);
  });

  it('never closes a row whose ship failed', async () => {
    const { q, calls } = queue({ closes: ['team'], code: 1 });
    await q.tick([row], products());
    expect(calls.map((c) => c[0])).toEqual(['shipFailed']);
  });
});

describe('the store', async () => {
  const { Store } = await import('../main/store.mjs');
  async function shipped(close) {
    const root = path.join(tmp, 'store');
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody' }).init();
    const made = store.fileItem('team', { title: 'Fix it', kind: 'task', body: 'Fix it.', labels: ['founder', SHIP_LABEL] }, { source: 'founder' });
    store.shipped('team', made.id, { sha: 'abc1234', labels: ['founder'], close });
    return store.readItem('team', made.id, Date.now());
  }

  it('closes a row the person wrote, when told to', async () => {
    const item = await shipped(true);
    expect(item.status).toBe('done');
    expect(item.labels).toEqual(['founder']);
  });

  // Four synthetic users asked the same thing of the Done list: which of
  // these did the app close, rather than me?
  it('says on the row that it closed itself', async () => {
    expect((await shipped(true)).note).toBe('Shipped to main as abc1234, and closed itself.');
    expect((await shipped(false)).note).toBe('Shipped to main as abc1234.');
  });

  it('leaves it open otherwise, as it always did', async () => {
    expect((await shipped(false)).status).not.toBe('done');
    expect((await shipped(undefined)).status).not.toBe('done');
  });
});

describe('the note', async () => {
  const { isShippedNote, shippedNote } = await import('../shared/shipped-note.mjs');
  it('is still read as the app\'s own, either way', () => {
    expect(isShippedNote(shippedNote('abc1234', true))).toBe(true);
    expect(isShippedNote(shippedNote(null, true))).toBe(true);
    expect(isShippedNote(shippedNote('abc1234'))).toBe(true);
    expect(isShippedNote('Shipped to main, and closed itself, I think.')).toBe(false);
  });
});
