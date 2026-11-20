// A REVIEW SENT BACK ENDS THE WAIT AND SAYS WHAT CAME BACK (2026-11-20).
//
// Synthetic team run: Lena sent "Empty state mockups" to Priya to review and
// send back. Priya approved empty-state-a.png and sent a note on it, and Lena's
// thread still said "Waits on Priya": a note or an approval on a file is not a
// comment on the thread, and nothing else ended the wait. In the run before,
// Priya answered in their chat and the thread said only "Priya wrote to you".
// The reviewer now sends a verdict, as a comment on the thread; the owner's
// copy ends the wait on it and says "Priya approved" or "Priya sent it back
// with 2 notes", quoting the note. Measured on the rules and on two copies of
// the app over the in-memory cloud.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askedPatch } from '../shared/thread-ask.mts';
import { endedWaits, personWait } from '../shared/thread-waits.mts';
import { cameBack, sentBackWords, verdictOf } from '../shared/review-sent-back.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

describe('the verdict, as a comment', () => {
  it('approved, with and without a note', () => {
    expect(sentBackWords({ verdict: 'approved', notes: 0, note: '' })).toBe('Approved');
    expect(sentBackWords({ verdict: 'approved', notes: 2, note: ' Round the Book button. ' })).toBe('Approved: Round the Book button.');
  });
  it('sent back, counting the notes on its files', () => {
    expect(sentBackWords({ verdict: 'changes', notes: 2, note: 'See the pins' })).toBe('Sent back with 2 notes: See the pins');
    expect(sentBackWords({ verdict: 'changes', notes: 1, note: '' })).toBe('Sent back with 1 note');
    expect(sentBackWords({ verdict: 'changes', notes: 0, note: 'Too busy' })).toBe('Sent back: Too busy');
  });
  it('reads back what it wrote', () => {
    expect(verdictOf('Sent back with 2 notes: See the pins')).toEqual({ verdict: 'changes', notes: 2, note: 'See the pins' });
    expect(verdictOf('Approved')).toEqual({ verdict: 'approved', notes: 0, note: '' });
  });
  it('must NOT read an ordinary comment as a verdict', () => {
    expect(verdictOf('Approved by whom?')).toBeNull();
    expect(verdictOf('Looks right')).toBeNull();
    expect(cameBack('Priya', 'Sent backwards')).toBeNull();
  });
});

const at = 1_000_000;
const waiting = (comments: { by: string; ts: number; text: string }[]) => ({
  id: 'w-1', status: 'blocked', ...askedPatch(['p-priya'], 'Sent to Priya to review and send back', at, 'review'),
  wrote: { blockedBy: { source: 'founder', ts: at }, asked: { source: 'founder', ts: at } }, waitingComments: comments,
});
const ctx = { items: [], cards: [], nameOf: () => 'Priya Shah', now: at + 100, lastWordFrom: () => 0 };
const said = (comments: { by: string; ts: number; text: string }[], o = {}) => endedWaits([waiting(comments)], { ...ctx, ...o })[0]?.said ?? null;

describe('what the owner\'s thread says came back', () => {
  it('Priya approved, quoting her note: the reported case', () => {
    expect(said([{ by: 'p-priya', ts: at + 1, text: 'Approved: Round the top Book button.' }])).toBe('Priya approved: “Round the top Book button.”');
  });
  it('Priya sent it back with 2 notes', () => {
    expect(said([{ by: 'p-priya', ts: at + 1, text: 'Sent back with 2 notes' }])).toBe('Priya sent it back with 2 notes');
  });
  it('says the verdict even when she also wrote to you after the ask', () => {
    expect(said([{ by: 'p-priya', ts: at + 2, text: 'Approved' }], { lastWordFrom: () => at + 3, lastWordsFrom: () => 'hi' })).toBe('Priya approved');
  });
  it('a plain comment still says she commented', () => {
    expect(said([{ by: 'p-priya', ts: at + 1, text: 'Looks right' }])).toBe('Priya commented');
  });
  it('must NOT end on a verdict from before the ask, or from someone else', () => {
    expect(said([{ by: 'p-priya', ts: at - 1, text: 'Approved' }])).toBeNull();
    expect(said([{ by: 'p-theo', ts: at + 1, text: 'Approved' }])).toBeNull();
  });
});

describe('on two copies of the app', () => {
  async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'review-back-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'web'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'web', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'web', name: 'Web app', seenBy: 'team' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
    return { personId, store, service };
  }
  let lena: Awaited<ReturnType<typeof aMac>>;
  let priya: Awaited<ReturnType<typeof aMac>>;
  let thread: { id: string };
  const both = async () => { for (let k = 0; k < 2; k += 1) { await lena.service.syncNow(); await priya.service.syncNow(); } };
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
    priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@nw.test', name: 'Priya Shah' }));
    await lena.service.signIn();
    await lena.service.createTeam('Northwind');
    await lena.service.invite('priya@nw.test');
    await priya.service.signIn();
    await priya.service.acceptInvite(lena.service.state().team.id);
    disk.setLineAuthor(lena.personId);
    thread = lena.store.composeItem('web', { title: 'Empty state mockups', body: 'Two options.', visibility: 'team' });
    lena.store.threadEdit('web', thread.id, askedPatch([priya.personId], 'Sent to Priya to review and send back', Date.now() - 1000, 'review'));
  });
  afterEach(async () => { disk.setLineAuthor(null); await lena.service.signOut(); await priya.service.signOut(); });

  it('the reviewer\'s copy knows the review is hers', async () => {
    await both();
    const card = priya.service.state().cards.find((c: { threadId: string }) => c.threadId === thread.id);
    expect(card.blockedBy).toContainEqual(expect.objectContaining({ id: personWait(priya.personId), want: 'review' }));
  });

  it('a verdict ends the owner\'s wait and says what came back', async () => {
    await both();
    await priya.service.commentOnThread(lena.personId, thread.id, sentBackWords({ verdict: 'changes', notes: 2, note: 'Round the top Book button.' }));
    await both();
    const row = lena.store.readItem('web', thread.id);
    expect(row.blockedBy).toEqual([]);
    expect(row.waitEnded?.said).toBe('Priya sent it back with 2 notes: “Round the top Book button.”');
    expect(row.createdBy).toBe(lena.personId);
    const card = priya.service.state().cards.find((c: { threadId: string }) => c.threadId === thread.id);
    expect(card.blockedBy.some((b: { id: string }) => b.id === personWait(priya.personId))).toBe(false);
  });
});
