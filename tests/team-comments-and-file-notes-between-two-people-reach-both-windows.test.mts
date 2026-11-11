// COMMENTS AND FILE NOTES BETWEEN TWO PEOPLE REACH BOTH WINDOWS (2026-11-11).
//
// The person's page draws everything that passed between two people
// (tests/a-persons-page-holds-everything-that-passed-between-the-two-of-you).
// Comments on threads and notes on their files were read by the main process
// and never sent to the window: it saw only the notes that named you, as Needs
// you rows. Measured: after Theo commented on Maya's thread and left a note on
// its file, neither window's team state carried either. The state now has
// `threadTalk`, the same entries on both Macs.
//
// Three people over the in-memory cloud, through the real team service.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

type Talk = { kind: string; owner: string; threadId: string; by: string; text: string; file?: string; note?: string };

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-talk-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const backend = memoryBackend(cloud, personId);
  const service = createTeamService({
    session: memorySession(() => backend),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service };
}

let cloud: ReturnType<typeof createMemoryCloud>;
let maya: Awaited<ReturnType<typeof aMac>>, theo: Awaited<ReturnType<typeof aMac>>, jun: Awaited<ReturnType<typeof aMac>>;
let open: { id: string }, closed: { id: string };
const allSync = async () => { for (const m of [maya, theo, jun]) await m.service.syncNow(); };
const talkOn = (m: typeof maya) => ((m.service.state() as { threadTalk?: Talk[] }).threadTalk ?? [])
  .map(({ kind, owner, threadId, by, text, file, note }) => ({ kind, owner, threadId, by, text, ...(file ? { file } : {}), ...(note ? { note } : {}) }));

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ito' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await maya.service.invite('jun@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  await jun.service.signIn();
  await jun.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
  open = maya.store.composeItem('website', { title: 'Onboarding', body: 'Look at designs/a.png', visibility: 'team' });
  closed = maya.store.composeItem('website', { title: 'Pricing', body: 'Only Theo', visibility: 'people', visibleTo: [theo.personId] });
  await allSync();
});
afterEach(async () => { for (const m of [maya, theo, jun]) await m.service.signOut(); });

describe('what the window is told passed on threads', () => {
  it('carries a comment and a file note to the owner and the writer alike', async () => {
    await theo.service.commentOnThread(maya.personId, open.id, 'Lower the hero');
    await theo.service.markSharedFile(maya.personId, open.id, { do: 'note', id: 'n1', file: 'a.png', place: { kind: 'whole' }, text: 'Too dark' });
    await allSync();
    const want = [
      { kind: 'comment', owner: maya.personId, threadId: open.id, by: theo.personId, text: 'Lower the hero' },
      { kind: 'note', owner: maya.personId, threadId: open.id, by: theo.personId, text: 'Too dark', file: 'a.png', note: 'n1' },
    ];
    expect(talkOn(maya)).toEqual(want);
    expect(talkOn(theo)).toEqual(want);
  });

  it('carries a comment on a thread open to only the two of them, to the two of them', async () => {
    await theo.service.commentOnThread(maya.personId, closed.id, 'Ship it');
    await allSync();
    const want = [{ kind: 'comment', owner: maya.personId, threadId: closed.id, by: theo.personId, text: 'Ship it' }];
    expect(talkOn(maya)).toEqual(want);
    expect(talkOn(theo)).toEqual(want);
    expect(talkOn(jun)).toEqual([]);
  });

  it('carries no approval, seen or resolve: only words', async () => {
    await theo.service.markSharedFile(maya.personId, open.id, { do: 'approve', file: 'a.png' });
    await allSync();
    expect(talkOn(maya)).toEqual([]);
  });
});
