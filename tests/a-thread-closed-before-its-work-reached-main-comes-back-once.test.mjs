// A THREAD CLOSED BEFORE ITS WORK REACHED MAIN COMES BACK, ONCE.
//
// What broke: once a thread was closed, nothing looked at it again, so a
// failed ship or a cloud run set aside on `cloud/<id>` stayed stranded for
// good (w-fbfc05b348 was closed 4 hours after its ship failed; w-21b638d821
// 5 minutes after its cloud work was set aside). And a ship that failed on a
// thread closed while it waited could not even reopen it: her close outranks
// every write of the app's own, so the "open" was dropped. Measured here on a
// real store on disk.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { failureNote } from '../main/ship-queue.mjs';
import { CLOSED_UNSHIPPED, closedAnywayNote } from '../shared/not-shipped.mjs';

let tmp; let store; let sup;
beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comes-back-'));
  const root = path.join(tmp, 'store');
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team' }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, store, tmp);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const disk = () => store.modules.workItemsDisk;
const dir = () => store.productDir('team');
const conflict = failureNote('CONFLICT (content): Merge conflict in cloud/sandbox/server.mjs');

// The agent says it ships; then the app says it did not; then she closes it.
// A second between writes, as in life, so no two land in the same millisecond;
// started an hour back so the writes the code makes itself come after.
let clock = Date.now() - 3_600_000;
const tick = () => (clock += 1000);
function closedAfterAFailedShip() {
  const made = store.fileItem('team', { title: 'Fix the race', kind: 'task', body: 'Fix it.' });
  disk().updateWorkItem(dir(), made.id, { result: '**Shipped, it is queued.**\n\n## Options\n1. Close this task' }, { source: 'agent', now: tick() });
  disk().updateWorkItem(dir(), made.id, { note: conflict }, { source: 'system', now: tick() });
  disk().updateWorkItem(dir(), made.id, { status: 'done' }, { source: 'founder', now: tick() });
  return made.id;
}

describe('the sweep', () => {
  it('puts a closed thread whose ship failed back in front of her, waiting on her', () => {
    const id = closedAfterAFailedShip();
    sup.bringBackWhatNeverShipped(store.listItems());
    const row = store.readItem('team', id);
    expect(row.status).toBe('blocked');
    expect(row.note).toBe(`${CLOSED_UNSHIPPED}${conflict}`);
  });

  it('brings it back once: closed again unasked, it stays closed', () => {
    const id = closedAfterAFailedShip();
    sup.bringBackWhatNeverShipped(store.listItems());
    disk().updateWorkItem(dir(), id, { status: 'done' }, { source: 'founder' });
    sup.bringBackWhatNeverShipped(store.listItems());
    expect(store.readItem('team', id).status).toBe('done');
  });

  it('leaves alone a thread she closed after being asked', () => {
    const id = closedAfterAFailedShip();
    disk().updateWorkItem(dir(), id, { note: closedAnywayNote(store.readItem('team', id)) }, { source: 'system' });
    sup.bringBackWhatNeverShipped(store.listItems());
    expect(store.readItem('team', id).status).toBe('done');
  });

  it('leaves alone a closed thread whose agent spoke after the failure, or that shipped', () => {
    const spoke = closedAfterAFailedShip();
    disk().updateWorkItem(dir(), spoke, { result: 'Fixed the conflict; it shipped as abc123.' }, { source: 'agent', now: tick() });
    const shipped = store.fileItem('team', { title: 'Shipped one', kind: 'task', body: 'x' }).id;
    disk().updateWorkItem(dir(), shipped, { note: 'Shipped to main as d202b199.' }, { source: 'system' });
    disk().updateWorkItem(dir(), shipped, { status: 'done' }, { source: 'founder' });
    sup.bringBackWhatNeverShipped(store.listItems());
    expect(store.readItem('team', spoke).status).toBe('done');
    expect(store.readItem('team', shipped).status).toBe('done');
  });

  it('runs on the supervisor\'s tick, over the rows it already read', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/const items = this\.store\.listItems\(now\);\n\s*this\.bringBackWhatNeverShipped\(items\);/);
  });
});

describe('a failed ship on a thread she closed while it waited', () => {
  it('reopens it, so its agent can fix it in the open', () => {
    const made = store.fileItem('team', { title: 'Waiting to ship', kind: 'task', body: 'x' });
    disk().updateWorkItem(dir(), made.id, { labels: ['ship'] }, { source: 'agent' });
    disk().updateWorkItem(dir(), made.id, { status: 'done' }, { source: 'founder' });
    store.shipFailed('team', made.id, { note: conflict, labels: [] });
    const row = store.readItem('team', made.id);
    expect(row.status).toBe('open');
    expect(row.labels).toEqual([]);
  });

  it('on a thread still open, opens it as it always did, with no word of hers', () => {
    const made = store.fileItem('team', { title: 'Open one', kind: 'task', body: 'x' });
    disk().updateWorkItem(dir(), made.id, { status: 'blocked' }, { source: 'agent' });
    store.shipFailed('team', made.id, { note: conflict, labels: [] });
    const row = store.readItem('team', made.id);
    expect(row.status).toBe('open');
    expect(row.wrote.status.source).toBe('system');
  });
});
