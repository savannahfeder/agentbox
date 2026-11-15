// A SHARED THREAD LEAVES OUT WHAT THE APP TOLD THE AGENT ABOUT YOUR NOTES (2026-11-12).
//
// Two testers, four times in one round, opened a teammate's thread and read,
// after each note, "Notes on /tmp/.../store/accounts/.../empty-state-b.png: -
// Whole file: ... Make these changes and save the result as ... The app gives
// every version its number", drawn as if the teammate had written it. Sending
// notes to an agent writes that reply for the agent (main/notes-wake.mts) and
// marks it `fromNotes`; your own window leaves it out and draws the notes
// themselves (renderer/src/thread-history.ts). The shared copy kept it, path
// and all. Measured on the in-memory cloud. It now goes up as your window
// draws it: not at all, or as the words you typed with the notes.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'from-notes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

let cloud, theo, lena;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('lena@nw.test');
  await lena.service.signIn();
  await lena.service.acceptInvite(theo.service.state().team.id);
  disk.setLineAuthor(theo.personId);
});
afterEach(async () => { await theo.service.signOut(); await lena.service.signOut(); });

const FOR_THE_AGENT = 'Notes on /tmp/store/accounts/a/api/designs/w-1/auth-gaps.csv:\n- Whole file: Theo: add a column for the fix\n\nMake these changes and save the result as auth-gaps-v2.csv. The app gives every version its number.';
const asLenaReadsIt = async (reply) => {
  const item = theo.store.composeItem('api', { title: 'Payments API auth gaps', body: 'List the auth gaps.', visibility: 'team' });
  theo.store.recordSessionResult('api', item.id, { result: 'Listed four gaps.' });
  theo.store.answerItem('api', item.id, reply);
  await theo.service.syncNow();
  await lena.service.syncNow();
  return lena.service.threadWork(theo.personId, item.id).lines.map((l) => l.patch?.answer).filter(Boolean);
};

describe("the reply the app wrote from your notes, on a teammate's copy of the thread", () => {
  it('is not there: no instructions to the agent, no path on your computer', async () => {
    expect(await asLenaReadsIt({ answer: FOR_THE_AGENT, fromNotes: ['n1'] })).toEqual([]);
  });
  it('is the words you typed with the notes, when you typed some', async () => {
    expect(await asLenaReadsIt({ answer: `${FOR_THE_AGENT}\n\nAnd keep it to one page.`, fromNotes: ['n1'], typed: 'And keep it to one page.' })).toEqual(['And keep it to one page.']);
  });
  it('an ordinary reply still goes up whole', async () => {
    expect(await asLenaReadsIt({ answer: 'Add a column for the fix.' })).toEqual(['Add a column for the fix.']);
  });
});
