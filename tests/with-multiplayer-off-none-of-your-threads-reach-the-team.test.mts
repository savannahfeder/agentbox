// WITH MULTIPLAYER OFF, NONE OF YOUR THREADS REACH THE TEAM (w-d19fcb9309).
//
// Two copies of the app on one stand-in team, 2026-11-09. Maya turned
// Settings › Alpha features › Multiplayer off. Her window dropped the Team page,
// the composer's Team / Private choice and the lock on private rows, so nothing
// on her screen said a thread was shared. She sent "Draft the Q4 layoffs list,
// keep it quiet", and it showed on Theo's copy under Maya, In progress, within
// 15 seconds: the switch only hid the team from her window
// (main/team/index.mts teamForWindow) while the sync kept publishing her cards.
//
// The switch now says what it does on both sides: off, her copy publishes no
// card, which takes back what was shared the way Make private does; on again,
// her Team threads go back up.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud, personId, sharing = () => true) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multiplayer-off-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, sharing,
  });
  return { personId, store, service, storeRoot, backend: memoryBackend(cloud, personId) };
}

let cloud, maya, theo, multiplayer;
beforeEach(async () => {
  disk._internals.forgetFolds();
  multiplayer = true;
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }), () => multiplayer);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => {
  for (const m of [maya, theo]) {
    await m.service.signOut();
    fs.rmSync(m.storeRoot, { recursive: true, force: true });
  }
});

const bothSync = async () => { await maya.service.syncNow(); await theo.service.syncNow(); };
const theoSees = (id) => theo.service.threadWork(maya.personId, id).shared;
const cardsOf = (personId) => [...cloud.cards.values()].filter((c) => c.personId === personId);

describe('Multiplayer on', () => {
  it('shares a thread the team can see, as before', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', visibility: 'team' });
    await bothSync();
    expect(theoSees(item.id)).toBe(true);
  });
});

describe('Multiplayer off', () => {
  it('sends a new thread nowhere, though the project shares with the team', async () => {
    multiplayer = false;
    const item = maya.store.composeItem('website', { title: 'Draft the Q4 layoffs list, keep it quiet' });
    await bothSync();
    expect(cardsOf(maya.personId)).toEqual([]);
    expect(cloud.threadWork.size).toBe(0);
    expect(theoSees(item.id)).toBe(false);
    expect(await theo.backend.threadWorkHeads()).toEqual([]);
  });

  it('takes back a thread that was shared before it went off', async () => {
    const item = maya.store.composeItem('website', { title: 'Checkout is slow', visibility: 'team' });
    await bothSync();
    expect(theoSees(item.id)).toBe(true);
    multiplayer = false;
    await bothSync();
    expect(cardsOf(maya.personId)).toEqual([]);
    expect(theoSees(item.id)).toBe(false);
  });

  it('still shows Maya her teammate\'s threads once she turns it back on', async () => {
    multiplayer = false;
    const theirs = theo.store.composeItem('website', { title: 'Theo\'s thread', visibility: 'team' });
    disk.setLineAuthor(theo.personId);
    await bothSync();
    multiplayer = true;
    await bothSync();
    expect(maya.service.threadWork(theo.personId, theirs.id).shared).toBe(true);
  });
});

describe('Multiplayer on again', () => {
  it('shares her Team threads again and keeps a Private one hers', async () => {
    multiplayer = false;
    const team = maya.store.composeItem('website', { title: 'For the team', visibility: 'team' });
    const mine = maya.store.composeItem('website', { title: 'Mine alone', visibility: 'private' });
    await bothSync();
    multiplayer = true;
    await bothSync();
    expect(theoSees(team.id)).toBe(true);
    expect(theoSees(mine.id)).toBe(false);
  });
});
