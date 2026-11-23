// A HAND-BACK NAMES THE FILES YOU APPROVED (w-9767199d02, 2026-11-23).
//
// The founder approved two of Tony's eight pictures on his review and pressed
// Looks good. Tony's thread got "Dana reviewed this and it looks good." and
// his own question quoted back: nothing said which two. Reproduced on two test
// copies on a stand-in team: approvals made on the review's own page never
// reached his thread at all. The reviewer's computer now gathers what it
// approved during the ask, from the review task and from the owner's thread,
// writes the list beside the verdict, and the hand-back says it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { approvedDuring, handBackMessage, handedBackWords, isHandBack, readHandBack } from '../shared/thread-asks.mts';
import { foldWorkItems } from '../shared/work-items.mts';
import { whatATeammateMaySet } from '../shared/team-rules.mts';
import { labelSaidFor } from '../shared/file-label.mts';

describe('the files approved during an ask', () => {
  const a = (file: string, by: string | null, ts: number) => ({ file, by, ts });
  it('are the helper\'s, between the ask and the hand-back, oldest first, once each', () => {
    const list = [a('b.png', 'theo', 30), a('a.png', 'theo', 20), a('b.png', 'theo', 40), a('c.png', 'sam', 25), a('old.png', 'theo', 5), a('late.png', 'theo', 90)];
    expect(approvedDuring(list, { by: 'theo', from: 10, to: 50 })).toEqual(['a.png', 'b.png']);
  });
  it('are named as the file is shown, without a version mark or a copy\'s prefix', () => {
    expect(approvedDuring([a('report.md#2', 'theo', 20), a('designs/w-1/sky.png', 'theo', 21)], { by: 'theo', from: 0 })).toEqual(['report.md', 'sky.png']);
  });
  it('are none when the helper approved nothing', () => {
    expect(approvedDuring([a('a.png', 'sam', 20)], { by: 'theo', from: 0 })).toEqual([]);
  });
});

describe('the stored words', () => {
  const asked = { by: 'Tony', note: 'Approve the words or tell me what to change.' };
  it('say which files were approved, and are still a hand-back', () => {
    const text = handedBackWords({ kind: 'review', name: 'Dana', verdict: 'yes', words: '', asked, approved: ['desk.png', 'phone.png'] });
    expect(text).toBe('Dana reviewed this and it looks good.\n\nTony had asked: “Approve the words or tell me what to change.”\n\nDana approved “desk.png” and “phone.png”.');
    expect(isHandBack(text)).toBe(true);
  });
  it('are unchanged when nothing was approved', () => {
    expect(handedBackWords({ kind: 'review', name: 'Dana', verdict: 'yes', words: 'Ship it.', asked })).toBe('Dana reviewed this and it looks good.\n\nTony had asked: “Approve the words or tell me what to change.”\n\nShip it.');
  });
  it('list three files with commas', () => {
    expect(handedBackWords({ kind: 'review', name: 'Sam', verdict: 'yes', words: '', approved: ['a.png', 'b.png', 'c.md'] })).toContain('Sam approved “a.png”, “b.png” and “c.md”.');
  });
});

describe('reading the stored words back', () => {
  it('finds the verdict, the question, the files and what they said', () => {
    const text = handedBackWords({ kind: 'review', name: 'Theo', verdict: 'changes', words: 'Rename the column.\n\nThen ship.', asked: { by: 'Sam', note: 'Is it safe?\n\nBe honest.' }, approved: ['index.sql'] });
    expect(readHandBack(text)).toEqual({ name: 'Theo', kind: 'review', verdict: 'changes', asked: { by: 'Sam', note: 'Is it safe?\n\nBe honest.' }, approved: ['index.sql'], words: 'Rename the column.\n\nThen ship.' });
  });
  it('as the owner\'s copy shares it, with the files it names carried as pictures, are not words of the helper', () => {
    const shared = `${handedBackWords({ kind: 'review', name: 'Dana', verdict: 'yes', words: '', approved: ['desk.png', 'phone.png'] })}\n\n![desk.png](attachments/ab12-desk.png)\n![phone.png](attachments/cd34-phone.png)`;
    expect(readHandBack(shared)).toMatchObject({ approved: ['desk.png', 'phone.png'], words: '' });
  });
  it('keeps a picture the helper put in their own words', () => {
    const own = handedBackWords({ kind: 'review', name: 'Dana', verdict: 'changes', words: 'Like this:\n\n![sketch.png](attachments/ef56-sketch.png)', approved: ['desk.png'] });
    expect(readHandBack(own)?.words).toBe('Like this:\n\n![sketch.png](attachments/ef56-sketch.png)');
  });
  it('reads a hand-back written before files were named', () => {
    expect(readHandBack('Dana handed this back.\n\nTightened the copy.')).toEqual({ name: 'Dana', kind: 'help', verdict: 'done', asked: null, approved: [], words: 'Tightened the copy.' });
  });
  it('leaves words that are not a hand-back alone', () => {
    expect(readHandBack('Looks good to me.')).toBeNull();
  });
});

describe('the message as a person reads it', () => {
  it('says the verdict, then their words, then the files', () => {
    expect(handBackMessage({ kind: 'review', verdict: 'yes', words: '', approved: ['desk.png', 'phone.png'] })).toBe('Looks good.\n\nApproved desk.png and phone.png.');
    expect(handBackMessage({ kind: 'review', verdict: 'changes', words: 'Rename it.', approved: [] })).toBe('Needs changes.\n\nRename it.');
  });
  it('is only what was said when a reply handed it back', () => {
    expect(handBackMessage({ kind: 'review', verdict: 'done', words: 'Bigger focus ring, please.', approved: [] })).toBe('Bigger focus ring, please.');
  });
  it('still says something when nothing was said', () => {
    expect(handBackMessage({ kind: 'review', verdict: 'done', words: '', approved: [] })).toBe('Reviewed.');
    expect(handBackMessage({ kind: 'help', verdict: 'done', words: '', approved: [] })).toBe('Handed back.');
  });
  it('links each file it names', () => {
    expect(handBackMessage({ kind: 'review', verdict: 'yes', words: '', approved: ['a.png'], link: (n) => `[${n}](attachments/x-${n})` })).toBe('Looks good.\n\nApproved [a.png](attachments/x-a.png).');
  });
});

// Round two of the testers: the picture viewer's header read `Priya approved “”.` beside
// checkout-summary.png, its caption taken from the hand-back that names the file.
describe("a file's caption in the big view", () => {
  const line = (source: string, patch: Record<string, unknown>) => ({ id: 'w-1', ts: 1, source, patch });
  it('is never a hand-back that names it', () => {
    const back = handedBackWords({ kind: 'review', name: 'Priya', verdict: 'yes', words: '', approved: ['checkout-summary.png'] });
    expect(labelSaidFor([line('system', { answer: back, from: { teammate: 'p', name: 'Priya' } })], ['checkout-summary.png'])).toBeNull();
  });
  it('is still what a message called it', () => {
    expect(labelSaidFor([line('agent', { result: 'Option 2: the summary\ncheckout-summary.png' })], ['checkout-summary.png'])).toBe('Option 2: the summary');
  });
});

describe('the list on the record', () => {
  const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
  it('is kept with the verdict', () => {
    const item = foldWorkItems([line(1, 'system', { title: 'Review', kind: 'directive', status: 'open' }), line(2, 'founder', { verdict: 'yes', approvedFiles: ['a.png', '', 7, 'b.png'] })]).get('w-0a1b2c3d4e');
    expect(item?.approvedFiles).toEqual(['a.png', 'b.png']);
  });
  it('crosses to the teammate the review came from', () => {
    const pulled = whatATeammateMaySet({ id: 'w-0a1b2c3d4e', ts: 2, source: 'founder', by: 'theo', uid: 'l-1', patch: { verdict: 'yes', approvedFiles: ['a.png'] } }, { direct: true });
    expect(pulled?.patch.approvedFiles).toEqual(['a.png']);
  });
});

async function aMac(cloud, personId, tellThread) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-back-files-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread });
  return { personId, store, service };
}

describe('on two computers', () => {
  let cloud, sam, theo, told;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud(); told = [];
    sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), (slug, id, o) => { told.push({ slug, id, ...o }); });
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }), vi.fn());
    await sam.service.signIn(); await sam.service.createTeam('Clinicflow');
    await sam.service.invite('theo@cf.test');
    await theo.service.signIn(); await theo.service.acceptInvite(sam.service.state().team.id);
  });
  afterEach(async () => { disk.setLineAuthor(null); for (const m of [sam, theo]) await m.service.signOut(); });
  const both = async (n = 3) => { for (let k = 0; k < n; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
  const theosTask = () => theo.store.listItems().find((i) => i.ask);

  it('the hand-back on the owner\'s thread names the files the reviewer approved on the review', async () => {
    disk.setLineAuthor(sam.personId);
    const t = sam.store.composeItem('api', { title: 'Settings wording', body: 'Fix it.' });
    await both();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'review', note: 'Approve the words?' });
    await both();
    disk.setLineAuthor(theo.personId);
    const task = theosTask();
    for (const file of ['desk.png', 'phone.png', 'before.png']) theo.store.fileMark(task.product, task.id, { do: 'approve', file });
    theo.store.fileMark(task.product, task.id, { do: 'unapprove', file: 'before.png' });
    await theo.service.handBack({ product: task.product, id: task.id, verdict: 'yes' });
    expect(theo.store.readItem(task.product, task.id).approvedFiles).toEqual(['desk.png', 'phone.png']);
    await both(); await both();
    const back = told.find((x) => x.hold);
    expect(back.text).toContain('Theo approved “desk.png” and “phone.png”.');
    expect(back.text).not.toContain('before.png');
  });

  it('names none when the reviewer approved nothing', async () => {
    disk.setLineAuthor(sam.personId);
    const t = sam.store.composeItem('api', { title: 'Settings wording', body: 'Fix it.' });
    await both();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'review', note: 'Approve the words?' });
    await both();
    disk.setLineAuthor(theo.personId);
    await theo.service.handBack({ product: theosTask().product, id: theosTask().id, verdict: 'yes' });
    await both(); await both();
    expect(told.find((x) => x.hold).text).not.toContain('approved');
  });
});
