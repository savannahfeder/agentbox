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
import { pairTimeline } from '../renderer/src/team/pair-timeline.ts';
import type { ThreadTalk } from '../renderer/src/types.ts';

type Talk = { kind: string; owner: string; threadId: string; by: string; text: string; file?: string; note?: string; to?: string[] };

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
  .map(({ kind, owner, threadId, by, text, file, note, to }) => ({ kind, owner, threadId, by, text, ...(file ? { file } : {}), ...(note ? { note } : {}), ...(to ? { to } : {}) }));

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
      { kind: 'note', owner: maya.personId, threadId: open.id, by: theo.personId, text: 'Too dark', file: 'a.png', note: 'n1', to: [maya.personId] },
    ];
    expect(talkOn(maya)).toEqual(want);
    expect(talkOn(theo)).toEqual(want);
  });

  it('carries a note sent to the owner from the review, which waits for their agent but not for them', async () => {
    // "Send to Maya" on her file stores the note with `wait`, for her agent's next turn and naming her.
    await theo.service.markSharedFile(maya.personId, open.id, { do: 'note', id: 'n2', file: 'a.png', place: { kind: 'whole' }, text: 'Add the retry', mentions: [maya.personId], wait: true });
    await allSync();
    const want = [{ kind: 'note', owner: maya.personId, threadId: open.id, by: theo.personId, text: 'Add the retry', file: 'a.png', note: 'n2', to: [maya.personId] }];
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

// ROUND FOUR (2026-11-11), two testers on one team. A note on your own shared
// file sent with "Send to Lena" was missing from both people's pages, and so was
// a reply under a note: both are lines on the owner's own thread, which `talk`
// never read (it read only marks on a teammate's copy). Measured: after the
// morning below, Maya's note to Theo on her own file and her reply under his
// note were in neither window's threadTalk.
describe('the morning between Maya and Theo, from both sides', () => {
  const ownMark = (who: typeof maya, threadId: string, mark: object) => { disk.setLineAuthor(who.personId); who.store.fileMark('website', threadId, mark); };
  const pageOf = (m: typeof maya, other: typeof maya) => pairTimeline({
    me: m.personId, other: other.personId, rooms: [], messages: [], directItems: [],
    talk: (m.service.state() as { threadTalk?: ThreadTalk[] }).threadTalk ?? [], titleOf: () => null,
  }).map((e) => [e.by === maya.personId ? 'Maya' : e.by === theo.personId ? 'Theo' : 'someone', e.text, e.where?.label]);

  it('draws her note on her own file, the replies under notes on both files, each once, on both pages', async () => {
    disk.setLineAuthor(theo.personId);
    const audit = theo.store.composeItem('website', { title: 'Audit', body: 'See report.md', visibility: 'team' });
    disk.setLineAuthor(maya.personId);
    const mine = maya.store.composeItem('website', { title: 'Notes to self', body: 'Look at plan.md', visibility: 'team' });
    await allSync();

    // "Send to Theo" on her own file: a note for Theo that also waits for her agent.
    ownMark(maya, open.id, { do: 'note', id: 'mn1', file: 'a-v2.png', place: { kind: 'whole' }, text: 'Is this the right export?', mentions: [theo.personId], owner: maya.personId, wait: true });
    await theo.service.markSharedFile(maya.personId, open.id, { do: 'note', id: 'tn1', file: 'a.png', place: { kind: 'whole' }, text: 'Too dark' });
    await allSync();
    // Her reply under his note, on her own thread.
    ownMark(maya, open.id, { do: 'reply', id: 'mr1', on: 'tn1', file: 'a.png', text: 'Lighter now' });
    // Her note on his file, and his reply under it on his own thread.
    await maya.service.markSharedFile(theo.personId, audit.id, { do: 'note', id: 'mn2', file: 'report.md', place: { kind: 'whole' }, text: 'This number looks off' });
    await allSync();
    ownMark(theo, audit.id, { do: 'reply', id: 'tr1', on: 'mn2', file: 'report.md', text: 'Fixed the total' });

    // Must not reach either page: her draft for her own agent, a third person's
    // note on her file, and her note on a thread she has since made private.
    ownMark(maya, open.id, { do: 'note', id: 'mn3', file: 'a.png', place: { kind: 'whole' }, text: 'Agent: crop it', wait: true });
    await jun.service.markSharedFile(maya.personId, open.id, { do: 'note', id: 'jn1', file: 'a.png', place: { kind: 'whole' }, text: 'Jun was here' });
    ownMark(maya, mine.id, { do: 'note', id: 'mn4', file: 'plan.md', place: { kind: 'whole' }, text: 'Private to me', mentions: [theo.personId] });
    await allSync();
    maya.store.threadEdit('website', mine.id, { visibility: 'private' });
    // Twice, so each note on a teammate's copy is also in the owner's published thread.
    await allSync();
    await allSync();

    const want = [
      ['Maya', 'Is this the right export?', 'a.png v2'],
      ['Theo', 'Too dark', 'a.png v1'],
      ['Maya', 'Lighter now', 'a.png v1'],
      ['Maya', 'This number looks off', 'report.md v1'],
      ['Theo', 'Fixed the total', 'report.md v1'],
    ];
    // Sorted: two marks can land in the same millisecond here.
    expect(pageOf(maya, theo).sort()).toEqual([...want].sort());
    expect(pageOf(theo, maya).sort()).toEqual([...want].sort());
    const said = [...talkOn(maya), ...talkOn(theo), ...talkOn(jun)].map((t) => t.text);
    for (const w of ['Agent: crop it', 'Private to me']) expect(said).not.toContain(w);
  });
});
