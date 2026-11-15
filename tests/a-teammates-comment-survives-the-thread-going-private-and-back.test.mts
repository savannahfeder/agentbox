// A TEAMMATE'S COMMENT SURVIVES THE THREAD GOING PRIVATE AND BACK (w-d19fcb9309).
//
// Two copies of the app on one stand-in team, 2026-11-09. Theo commented on
// Maya's shared thread. Maya made it private from the command bar, then shared
// it with the team again. The thread came back on Theo's copy without his
// comment, and 30 seconds later it was still gone; Maya's own thread still had
// it. Taking a card down deletes its comments from the cloud (the foreign keys
// in 20261030120000_shared_threads_carry_their_work.sql), and the owner's copy
// never published the comments it held, so nothing put them back. Turning
// Multiplayer off and on takes every card down the same way.
//
// The owner's copy now carries the comments delivered to its thread in the
// work it publishes, and a reader shows each comment once.
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
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-survives-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, sharing,
  });
  return { personId, store, service, storeRoot };
}

let cloud, maya, theo, jun, macs, multiplayer;
beforeEach(async () => {
  disk._internals.forgetFolds();
  multiplayer = true;
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }), () => multiplayer);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ito' }));
  macs = [maya, theo, jun];
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await maya.service.invite('jun@nw.test');
  for (const m of [theo, jun]) {
    await m.service.signIn();
    await m.service.acceptInvite(maya.service.state().team.id);
  }
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => {
  for (const m of macs) {
    await m.service.signOut();
    fs.rmSync(m.storeRoot, { recursive: true, force: true });
  }
});

const allSync = async () => { for (const m of macs) await m.service.syncNow(); };
const commentsSeen = (mac, id) => mac.service.threadWork(maya.personId, id).lines.filter((l) => l.patch?.comment).map((l) => ({ by: l.by, text: l.patch.comment.text }));
const HERO = "I think it's the hero image, it's 4 MB on mobile.";

async function commented() {
  const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'Checkout is slow', visibility: 'team' });
  maya.store.recordSessionResult('website', item.id, { result: 'Looking.' });
  await allSync();
  await theo.service.commentOnThread(maya.personId, item.id, HERO);
  await allSync();
  return item;
}

describe('a comment on a shared thread', () => {
  it('is shown once while nothing has happened to the thread', async () => {
    const item = await commented();
    for (const m of [theo, jun]) expect(commentsSeen(m, item.id)).toEqual([{ by: theo.personId, text: HERO }]);
  });

  it('comes back, once and under its writer, when the owner makes the thread private and shares it again', async () => {
    const item = await commented();
    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await allSync();
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(false);
    maya.store.threadEdit('website', item.id, { visibility: 'team' });
    await allSync();
    for (const m of [theo, jun]) expect(commentsSeen(m, item.id)).toEqual([{ by: theo.personId, text: HERO }]);
  });

  it('comes back when the owner turns Multiplayer off and on', async () => {
    const item = await commented();
    multiplayer = false;
    await allSync();
    multiplayer = true;
    await allSync();
    expect(commentsSeen(jun, item.id)).toEqual([{ by: theo.personId, text: HERO }]);
  });

  it('can be answered after it came back, and the new one is shown once too', async () => {
    const item = await commented();
    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await allSync();
    maya.store.threadEdit('website', item.id, { visibility: 'team' });
    await allSync();
    await jun.service.commentOnThread(maya.personId, item.id, 'Agreed');
    await allSync();
    expect(commentsSeen(theo, item.id)).toEqual([{ by: theo.personId, text: HERO }, { by: jun.personId, text: 'Agreed' }]);
  });

  it('does not reach someone a Chosen people thread was narrowed away from', async () => {
    const item = await commented();
    maya.store.threadEdit('website', item.id, { visibility: 'people', visibleTo: [theo.personId] });
    await allSync();
    expect(jun.service.threadWork(maya.personId, item.id)).toMatchObject({ shared: false, lines: [] });
    expect(commentsSeen(theo, item.id)).toEqual([{ by: theo.personId, text: HERO }]);
  });
});
