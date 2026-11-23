// The team sync reads every thread without copying it.
//
// 2026-11-23: the app's CPU record put copying thread rows (`aged`) at 4 to 5%
// of the main thread's busy time with nothing else in it. The sync with the
// team runs every five seconds, and each pass read every thread of every
// project five times over, a fresh copy of each one each time: twice for the
// cards, once for the shared threads, twice for the waits that ended. 441
// cards on that Mac. The whole-inbox read already hands out the same frozen
// rows until a thread changes (readWorkItemRows); the sync did not use it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

let copied = 0;
// The store's own module, counting each thread the copying read hands out.
const counting = { ...disk, readWorkItems: (...args: Parameters<typeof disk.readWorkItems>) => { const rows = disk.readWorkItems(...args); copied += rows.length; return rows; } };

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rows-')));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk: counting, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, dir: path.join(accountRoot, 'website') };
}
type Mac = Awaited<ReturnType<typeof aMac>>;

let maya: Mac;
let theo: Mac;
const cardOn = (mac: Mac, id: string) => (mac.service.state().cards ?? []).find((c) => c.threadId === id);
const bothSync = async () => { await maya.service.syncNow(); await theo.service.syncNow(); };

beforeEach(async () => {
  disk._internals.forgetFolds();
  const cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team!.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => {
  vi.useRealTimers();
  for (const m of [maya, theo]) await m.service.signOut();
});

describe('a pass of the team sync', () => {
  it('copies none of the threads it reads', async () => {
    for (let n = 0; n < 12; n += 1) maya.store.composeItem('website', { title: `Thread ${n}`, body: 'An ask.', visibility: 'team' });
    await maya.service.syncNow();
    copied = 0;
    await maya.service.syncNow();
    expect(copied).toBe(0);
  });

  it('still shows a teammate a thread renamed since the last pass', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'An ask.', visibility: 'team' });
    await bothSync();
    expect(cardOn(theo, item.id)?.title).toBe('Checkout is slow');
    maya.store.threadEdit('website', item.id, { label: 'Checkout takes nine seconds' });
    await bothSync();
    expect(cardOn(theo, item.id)?.title).toBe('Checkout takes nine seconds');
  });

  it('still shows a teammate a thread that finished since the last pass', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'An ask.', visibility: 'team' });
    await bothSync();
    expect(cardOn(theo, item.id)?.state).toBe('running');
    maya.store.recordSessionResult('website', item.id, { result: 'The cart query has no index.' });
    maya.store.answerItem('website', item.id, { answer: 'Thanks', status: 'done' });
    await bothSync();
    expect(cardOn(theo, item.id)?.state).toBe('done');
  });
});

describe('the rows the sync reads', () => {
  it('still see an agent\'s hold run out, with no new line written', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'An ask.', visibility: 'team' });
    await disk.claimWorkItem(maya.dir, { id: item.id, holder: 'worker-a', leaseMs: 60_000 });
    const at = Date.now();
    const row = (now: number) => disk.readWorkItemRows(maya.dir, now).find((i) => i.id === item.id)!;
    expect(row(at)).toMatchObject({ status: 'claimed', claimExpired: false });
    expect(row(at + 61_000)).toMatchObject({ status: 'open', claimExpired: true });
    expect(row(at)).toMatchObject({ status: 'claimed', claimExpired: false });
  });
});

describe('a caller that takes a thread to change it', () => {
  it('still gets a copy of its own, and what it writes there reaches no later read', () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'An ask.', visibility: 'team' });
    const mine = disk.readWorkItems(maya.dir).find((i) => i.id === item.id)!;
    mine.title = 'Scribbled on';
    expect(disk.readWorkItems(maya.dir).find((i) => i.id === item.id)!.title).toBe('Checkout is slow');
    expect(disk.readWorkItemRows(maya.dir).find((i) => i.id === item.id)!.title).toBe('Checkout is slow');
  });
});
