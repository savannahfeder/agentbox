// THE LAST LABEL ON A THREAD CAN COME OFF.
//
// What broke: the store read an empty label list as "no change", so taking
// `ship` off a thread whose only label it was did nothing. A cloud run set
// aside on `cloud/<id>` is meant to lose `ship` so the folder never ships
// without that run's work; on such a thread it kept it, and the queue shipped
// the folder as it was. Measured here on a real store: the label stayed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { pickFields } from '../shared/work-items.mjs';

let tmp; let store;
beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'last-label-'));
  const root = path.join(tmp, 'store');
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team' }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const labelled = (labels) => {
  const made = store.fileItem('team', { title: 'Main went red', kind: 'task', body: 'x' });
  store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), made.id, { labels }, { source: 'agent' });
  return made.id;
};

describe('taking the last label off', () => {
  it('leaves a thread set aside with nothing marking it to ship', () => {
    const id = labelled(['ship']);
    store.cloudWorkKeptAside('team', id, 'kept on cloud/w-1');
    expect(store.readItem('team', id).labels).toEqual([]);
  });

  it('works for a failed ship and a shipped one alike', () => {
    const failed = labelled(['ship']);
    store.shipFailed('team', failed, { note: 'It did not ship, and it went back to its agent: x', labels: [] });
    expect(store.readItem('team', failed).labels).toEqual([]);
    const shipped = labelled(['ship']);
    store.shipped('team', shipped, { sha: 'abc1234', labels: [] });
    expect(store.readItem('team', shipped).labels).toEqual([]);
  });

  it('still keeps the others when only one of several comes off', () => {
    const id = labelled(['ship', 'ui']);
    store.cloudWorkKeptAside('team', id, 'kept on cloud/w-1');
    expect(store.readItem('team', id).labels).toEqual(['ui']);
  });

  it('is not what a write without labels does', () => {
    const id = labelled(['ship']);
    store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), id, { note: 'unrelated' }, { source: 'system' });
    expect(store.readItem('team', id).labels).toEqual(['ship']);
    expect(pickFields({ labels: 'ship' })).toBe(null);
  });
});
