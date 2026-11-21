// A NOTE YOU OPENED STAYS OPENED WHEN ITS THREAD IS SHARED AGAIN (2026-11-21).
//
// Maya's note on a file named Theo; Theo opened it and the row left his Needs
// you. Maya made the thread private and shared it again (or turned
// Multiplayer off and on), and the note was back in Theo's Needs you, with
// every other note he had opened on it: his "seen" lived only in the cloud,
// and taking the card down deleted it. Found by a code review of the team
// features; reproduced on the in-memory cloud with two computers. Your own
// computer now keeps the notes you opened as well.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud: any, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-seen-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const backend = memoryBackend(cloud, personId);
  const service = createTeamService({ session: memorySession(() => backend), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 } as any);
  return { personId, store, service, backend };
}
const pin = (id: string, text: string, over = {}) => ({ do: 'note', id, file: 'a.png', place: { kind: 'pin', x: 0.5, y: 0.5 }, text, ...over });
let cloud: any, maya: any, theo: any, macs: any[], thread: any;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  macs = [maya, theo];
  await maya.service.signIn(); await maya.service.createTeam('Northwind'); await maya.service.invite('theo@nw.test');
  await theo.service.signIn(); await theo.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
  thread = maya.store.composeItem('website', { title: 'Onboarding', body: 'Look at designs/a.png', visibility: 'team' });
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });
const allSync = async () => { for (const m of macs) await m.service.syncNow(); };
const newsOn = (mac: any) => mac.service.state().sharedFileNews ?? [];

it('a note Theo already opened stays out of his Needs you after the thread goes private and back', async () => {
  maya.store.fileMark('website', thread.id, pin('n1', 'Look @Theo', { mentions: [theo.personId] }));
  await allSync();
  expect(newsOn(theo).map((n: any) => n.id)).toEqual(['n1']);
  await theo.service.markSharedFile(maya.personId, thread.id, { do: 'seen', on: ['n1'] });
  await allSync(); await allSync();
  expect(newsOn(theo)).toEqual([]);
  maya.store.threadEdit('website', thread.id, { visibility: 'private' });
  await allSync(); await allSync();
  maya.store.threadEdit('website', thread.id, { visibility: 'team' });
  await allSync(); await allSync();
  expect(theo.service.threadWork(maya.personId, thread.id).shared).toBe(true);
  expect(newsOn(theo)).toEqual([]);
});
