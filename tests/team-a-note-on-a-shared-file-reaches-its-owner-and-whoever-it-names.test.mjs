// A NOTE ON A SHARED FILE REACHES ITS OWNER AND WHOEVER IT NAMES.
//
// Every review fell back to typing into a chat and
// copying the file about. "Jordan cannot see the pictures my agent posted", "no
// approval is recorded on the video itself". Measured: a shared thread could carry
// one kind of comment, plain words to its owner, with no file, no place and no way
// back to the person who wrote it.
//
// Three people over the in-memory cloud, through the real team service: Maya owns
// the thread, Theo reads it, Jun is on the team and sometimes not on the list.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { fileNewsFor, marksOf, cleanMark } from '../shared/artifact-marks.mjs';

async function aMac(cloud, personId, storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-note-'))) {
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const backend = memoryBackend(cloud, personId);
  const service = createTeamService({
    session: memorySession(() => backend),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, accountRoot, storeRoot, backend, dir: path.join(accountRoot, 'website') };
}

const pin = (id, text, over = {}) => ({ do: 'note', id, file: 'a.png', place: { kind: 'pin', x: 0.5, y: 0.5 }, text, ...over });
const marksIn = (work) => marksOf(work.lines.filter((l) => l.patch?.artifact).map((l) => ({ ...l.patch.artifact, by: l.by, ts: l.ts, uid: l.uid })));

let cloud, maya, theo, jun, macs, thread;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ito' }));
  macs = [maya, theo, jun];
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await maya.service.invite('jun@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  await jun.service.signIn();
  await jun.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
  thread = maya.store.composeItem('website', { title: 'Onboarding', body: 'Look at designs/a.png', visibility: 'team' });
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });
const allSync = async () => { for (const m of macs) await m.service.syncNow(); };
const mine = () => maya.store.readItem('website', thread.id);

describe('a teammate on the owner\'s shared thread', () => {
  it('reaches the owner\'s ledger with its place, and into her Needs you', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Lower'));
    await allSync();
    expect(mine().artifacts.notes).toMatchObject([{ id: 'n1', by: theo.personId, text: 'Lower', place: { kind: 'pin', x: 0.5, y: 0.5 } }]);
    expect(fileNewsFor(mine(), maya.personId).map((n) => n.id)).toEqual(['n1']);
  });
  it('shows on the writer\'s own screen at once, once', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Lower'));
    expect(marksIn(theo.service.threadWork(maya.personId, thread.id)).notes.map((n) => n.id)).toEqual(['n1']);
    await allSync(); await allSync();
    expect(marksIn(theo.service.threadWork(maya.personId, thread.id)).notes.map((n) => n.id)).toEqual(['n1']);
    expect(mine().artifacts.notes).toHaveLength(1);
  });
  it('starts no agent and changes nothing else on the row', async () => {
    const before = mine();
    await theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Lower'));
    await allSync();
    expect(mine().status).toBe(before.status);
    expect(mine().answer).toBeUndefined();
  });
  it('an approval reaches the owner and holds for that version only', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'approve', file: 'a-v2.png' });
    await allSync();
    expect(fileNewsFor(mine(), maya.personId).map((n) => [n.kind, n.by, n.file])).toEqual([['approved', theo.personId, 'a-v2.png']]);
    expect(mine().artifacts.approvals.some((a) => a.file === 'a-v3.png')).toBe(false);
  });
  it('a forged owner does not take the news off the real one', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'approve', file: 'a.png', owner: jun.personId });
    await allSync();
    expect(fileNewsFor(mine(), maya.personId)).toHaveLength(1);
  });
  it('another reader sees it too', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Lower'));
    await allSync();
    expect(marksIn(jun.service.threadWork(maya.personId, thread.id)).notes.map((n) => n.text)).toEqual(['Lower']);
  });
});

describe('the owner\'s own note', () => {
  it('reaches whoever reads the thread, under her name', async () => {
    maya.store.fileMark('website', thread.id, pin('n1', 'From Maya'));
    await allSync();
    expect(marksIn(theo.service.threadWork(maya.personId, thread.id)).notes).toMatchObject([{ id: 'n1', by: maya.personId, text: 'From Maya' }]);
  });
  it('a resolve from either side folds it on both', async () => {
    maya.store.fileMark('website', thread.id, pin('n1', 'From Maya'));
    await allSync();
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'resolve', on: 'n1' });
    await allSync(); await allSync();
    expect(mine().artifacts.notes[0].resolved).toBe(true);
    expect(marksIn(jun.service.threadWork(maya.personId, thread.id)).notes[0].resolved).toBe(true);
  });
});

describe('a note that names someone', () => {
  const named = () => pin('n1', 'Look @Theo', { mentions: [theo.personId] });
  const newsOn = (mac) => mac.service.state().sharedFileNews ?? [];
  it('is a row for them and for nobody else', async () => {
    maya.store.fileMark('website', thread.id, named());
    await allSync();
    expect(newsOn(theo).map((n) => [n.id, n.threadId, n.by])).toEqual([['n1', thread.id, maya.personId]]);
    expect(newsOn(jun)).toEqual([]);
    expect(newsOn(maya)).toEqual([]);
  });
  it('goes away once they open it', async () => {
    maya.store.fileMark('website', thread.id, named());
    await allSync();
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'seen', on: ['n1'] });
    expect(newsOn(theo)).toEqual([]);
    await allSync();
    expect(newsOn(theo)).toEqual([]);
  });
  it('goes away once resolved', async () => {
    maya.store.fileMark('website', thread.id, named());
    await allSync();
    maya.store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    await allSync(); await allSync();
    expect(newsOn(theo)).toEqual([]);
  });
  it('a teammate naming someone on the owner\'s thread reaches them and the owner', async () => {
    await jun.service.markSharedFile(maya.personId, thread.id, named());
    await allSync(); await allSync();
    expect(newsOn(theo).map((n) => n.id)).toEqual(['n1']);
    expect(fileNewsFor(mine(), maya.personId).map((n) => n.id)).toEqual(['n1']);
  });
});

describe('who may read it', () => {
  it('a thread shared with chosen people: the rest cannot mark it or see the marks', async () => {
    const chosen = maya.store.composeItem('website', { title: 'Pay review', body: 'Secret designs/pay.png', visibility: 'people', visibleTo: [theo.personId] });
    await allSync();
    await theo.service.markSharedFile(maya.personId, chosen.id, pin('n9', 'Words for Maya'));
    await allSync();
    expect(jun.service.threadWork(maya.personId, chosen.id).shared).toBe(false);
    expect(await jun.backend.fileMarks()).toEqual([]);
    await expect(jun.backend.addFileMark(maya.personId, chosen.id, { id: 'x', mark: pin('x', 'Nosy') })).rejects.toThrow();
  });
  it('naming someone who cannot read the thread reaches nobody', async () => {
    const chosen = maya.store.composeItem('website', { title: 'Pay review', body: 'Secret', visibility: 'people', visibleTo: [theo.personId] });
    await allSync();
    maya.store.fileMark('website', chosen.id, pin('n9', 'Look @Jun', { mentions: [jun.personId] }));
    await allSync(); await allSync();
    expect(jun.service.state().sharedFileNews ?? []).toEqual([]);
  });
  it('a thread made private takes its marks and its rows with it', async () => {
    maya.store.fileMark('website', thread.id, pin('n1', 'Look @Theo', { mentions: [theo.personId] }));
    await theo.service.markSharedFile(maya.personId, thread.id, pin('n2', 'Theo says'));
    await allSync();
    expect(theo.service.state().sharedFileNews).toHaveLength(1);
    maya.store.threadEdit('website', thread.id, { visibility: 'private' });
    await allSync(); await allSync();
    expect(theo.service.threadWork(maya.personId, thread.id).lines).toEqual([]);
    expect(theo.service.state().sharedFileNews).toEqual([]);
    expect(await theo.backend.fileMarks()).toEqual([]);
  });
  it('a mark from a teammate\'s copy is cleaned before it lands', async () => {
    await theo.backend.addFileMark(maya.personId, thread.id, { id: 'bad', mark: { do: 'note', id: 'n1', file: '../../etc', place: { kind: 'whole' }, text: 'x' } });
    await allSync();
    expect(mine().artifacts).toBeUndefined();
    expect(cleanMark({ do: 'note', id: 'n1', file: '../../etc', place: { kind: 'whole' }, text: 'x' })).toBeUndefined();
  });
});

describe('with the cloud away', () => {
  const offline = (mac, fn) => async (...args) => {
    const was = mac.backend.addFileMark;
    mac.backend.addFileMark = async () => { throw new Error('offline'); };
    try { return await fn(...args); } finally { mac.backend.addFileMark = was; }
  };
  it('a comment is kept, shown, and sent once the cloud is back', async () => {
    await offline(theo, () => theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Typed on a train')))();
    expect(marksIn(theo.service.threadWork(maya.personId, thread.id)).notes.map((n) => n.text)).toEqual(['Typed on a train']);
    expect(await theo.backend.fileMarks()).toEqual([]);
    await allSync(); await allSync();
    expect(mine().artifacts.notes.map((n) => n.text)).toEqual(['Typed on a train']);
    expect((await theo.backend.fileMarks())).toHaveLength(1);
  });
  it('a kept comment survives the app starting again', async () => {
    await offline(theo, () => theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Typed on a train')))();
    const waiting = fs.readFileSync(path.join(theo.accountRoot, '_team-threads', `${theo.personId}.marks-waiting.json`), 'utf8');
    expect(waiting).toContain('Typed on a train');
  });
  it('a comment sent twice because the answer was lost lands once', async () => {
    await theo.backend.addFileMark(maya.personId, thread.id, { id: 'same', mark: pin('n1', 'Once') });
    await theo.backend.addFileMark(maya.personId, thread.id, { id: 'same', mark: pin('n1', 'Once') });
    expect(await theo.backend.fileMarks()).toHaveLength(1);
  });
  it('a comment on a thread that has since gone is dropped rather than retried for ever', async () => {
    await offline(theo, () => theo.service.markSharedFile(maya.personId, thread.id, pin('n1', 'Too late')))();
    maya.store.threadEdit('website', thread.id, { visibility: 'private' });
    await allSync(); await allSync();
    const file = path.join(theo.accountRoot, '_team-threads', `${theo.personId}.marks-waiting.json`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});

describe('in a conversation', () => {
  it('crosses on the conversation\'s own ledger and stays between the people on it', async () => {
    await maya.service.message(theo.personId, 'See it', 0, [{ name: 'a.png', dataBase64: Buffer.from('x').toString('base64') }]);
    await allSync();
    const projectOf = (mac) => mac.store.listProducts().find((p) => p.team?.direct);
    const convo = () => maya.store.listItems(projectOf(maya).slug)[0];
    maya.store.fileMark(projectOf(maya).slug, convo().id, { do: 'note', id: 'n1', file: 'a.png', place: { kind: 'whole' }, text: 'Hm' });
    await allSync(); await allSync();
    const theirs = theo.store.listItems(projectOf(theo).slug)[0];
    expect(theirs.artifacts.notes.map((n) => n.text)).toEqual(['Hm']);
    expect(projectOf(jun)).toBeUndefined();
  });
});
