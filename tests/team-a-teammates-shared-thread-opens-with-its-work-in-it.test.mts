// A TEAMMATE'S SHARED THREAD OPENS WITH ITS WORK IN IT.
//
// Everyone using it said a teammate's thread opened as a bare
// summary card. A build fixed that for lines written after it landed, and later
// every shared thread was still empty ("messages and files show here once
// their app has shared them"), finished ones included: four of four opened by
// one person. So what is measured here is the state they were in: threads
// that already exist, some finished, on a copy that has only just started.
//
// Two and three people over the in-memory cloud, through the real team service.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { MAX_THREAD_FILE_BYTES } from '../main/team/thread-share.mts';
import { mayRunHere } from '../shared/team-rules.mts';
import { resolveArtifact } from '../main/artifact-path.mts';

async function aMac(cloud, personId, storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-thread-'))) {
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  const projectFile = path.join(accountRoot, 'website', 'project.json');
  if (!fs.existsSync(projectFile)) fs.writeFileSync(projectFile, JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, accountRoot, storeRoot, backend: memoryBackend(cloud, personId), dir: path.join(accountRoot, 'website') };
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const lead = (mac, words, over = {}) => mac.store.composeItem('website', { title: words, body: words, visibility: 'team', ...over });
const answered = (mac, id, result) => mac.store.recordSessionResult('website', id, { result });
const wordsIn = (work) => work.lines.flatMap((l) => [l.patch?.body, l.patch?.answer, l.patch?.result, l.patch?.note, l.patch?.comment?.text]).filter(Boolean);

let cloud, maya, theo, jun, macs;
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
  // One process, three people: what the store writes in these tests is Maya's.
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

const allSync = async () => { for (const m of macs) await m.service.syncNow(); };

describe('threads that were already there', () => {
  it('opens a thread finished before this existed, with the owner\'s words and the agent\'s answer', async () => {
    const item = lead(maya, 'Why is checkout slow?');
    answered(maya, item.id, 'The cart query has no index.');
    maya.store.answerItem('website', item.id, { answer: 'Thanks', status: 'done' });
    await allSync();

    const work = theo.service.threadWork(maya.personId, item.id);
    expect(work.shared).toBe(true);
    expect(wordsIn(work)).toEqual(['Why is checkout slow?', 'The cart query has no index.', 'Thanks']);
  });

  // Seen on screen: a thread typed as one line opened on the agent's answer.
  it('opens a thread typed as one line on the owner\'s words, once, and leaves a later rename out', async () => {
    const item = maya.store.composeItem('website', { title: 'One line ask', visibility: 'team' });
    answered(maya, item.id, 'An answer.');
    maya.store.threadEdit('website', item.id, { label: 'Renamed' });
    await allSync();
    const work = theo.service.threadWork(maya.personId, item.id);
    expect(wordsIn(work)).toEqual(['One line ask', 'An answer.']);
    expect(work.lines[0].by).toBe(maya.personId);
  });

  it('marks the owner\'s words as theirs and leaves the agent\'s answer with nobody\'s name on it', async () => {
    const item = lead(maya, 'Why is checkout slow?');
    answered(maya, item.id, 'The cart query has no index.');
    await allSync();
    const { lines } = theo.service.threadWork(maya.personId, item.id);
    expect(lines.find((l) => l.patch.body).by).toBe(maya.personId);
    expect(lines.find((l) => l.patch.body).source).toBe('founder');
    expect(lines.find((l) => l.patch.result).by).toBeUndefined();
  });

  // The state they were in: nothing in the cloud, no new line written, a copy just started.
  it('publishes a thread nobody has touched when its copy starts, and again if the cloud has lost it', async () => {
    const item = lead(maya, 'Old thread');
    answered(maya, item.id, 'Old answer.');
    await maya.service.signOut();

    const restarted = createTeamService({
      session: memorySession(() => memoryBackend(cloud, maya.personId)),
      store: maya.store, disk, accountRoot: maya.accountRoot, stateFile: path.join(maya.storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    });
    macs[0] = { ...maya, service: restarted };
    await restarted.signIn();
    await theo.service.syncNow();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toContain('Old answer.');

    cloud.threadWork.clear();
    await restarted.syncNow();
    await theo.service.syncNow();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toContain('Old answer.');
  });

  it('says plainly when the owner\'s copy has not shared the work, rather than drawing an empty conversation', async () => {
    const item = lead(maya, 'Not published yet');
    await maya.service.syncNow();
    cloud.threadWork.clear();
    const work = theo.service.threadWork(maya.personId, item.id);
    expect(work).toMatchObject({ shared: false, lines: [], earlier: 0 });
  });
});

describe('the conversation', () => {
  it('reaches viewers on the next sync when the owner\'s agent answers again', async () => {
    const item = lead(maya, 'First ask');
    await allSync();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toEqual(['First ask']);
    answered(maya, item.id, 'Second answer.');
    await allSync();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toEqual(['First ask', 'Second answer.']);
  });

  it('keeps the newest 40 messages and says how many earlier ones stayed behind', async () => {
    const item = lead(maya, 'message 1');
    for (let n = 2; n <= 45; n += 1) maya.store.answerItem('website', item.id, { answer: `message ${n}` });
    await allSync();
    const work = theo.service.threadWork(maya.personId, item.id);
    expect(wordsIn(work)).toHaveLength(40);
    expect(wordsIn(work)[0]).toBe('message 6');
    expect(wordsIn(work).at(-1)).toBe('message 45');
    expect(work.earlier).toBe(5);
  });

  it('counts exactly 40 as nothing left behind', async () => {
    const item = lead(maya, 'message 1');
    for (let n = 2; n <= 40; n += 1) maya.store.answerItem('website', item.id, { answer: `message ${n}` });
    await allSync();
    const work = theo.service.threadWork(maya.personId, item.id);
    expect(wordsIn(work)).toHaveLength(40);
    expect(work.earlier).toBe(0);
  });

  it('hides a key an agent quoted, and carries no tool lines, claims or the owner\'s home folder', async () => {
    const item = lead(maya, 'Show me the config');
    answered(maya, item.id, `The key is sk-ant-abcdefghijklmnopqrstuvwxyz1234 in ${os.homedir()}/notes`);
    await allSync();
    const text = JSON.stringify(theo.service.threadWork(maya.personId, item.id));
    expect(text).not.toContain('sk-ant-abcdefghij');
    expect(text).not.toContain(os.homedir());
    expect(text).not.toContain('"claim"');
  });

  it('never publishes a thread with no card: another person\'s row in a conversation between two people', async () => {
    await maya.service.message(theo.personId, 'A private word');
    await allSync();
    expect(await theo.backend.threadWorkHeads()).toEqual([]);
  });
});

describe('the files its messages link to', () => {
  const write = (mac, rel, bytes = 'x') => {
    const file = path.join(mac.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  const local = (mac, owner, id, work) => work.lines.flatMap((l) => [...JSON.stringify(l.patch).matchAll(/attachments\/([\w.-]+)/g)].map((m) => m[1]))
    .map((name) => path.join(mac.service.threadWork(owner, id).dir, 'attachments', name));

  it('copies pictures, documents, pages, film and decks to the viewer\'s computer and links to the copies', async () => {
    write(maya, 'designs/a.png', PNG);
    write(maya, 'docs/plan.md', '# Plan');
    write(maya, 'designs/page.html', '<h1>Page</h1>');
    write(maya, 'cuts/launch.mp4', 'film');
    write(maya, 'decks/board.pptx', 'deck');
    const item = lead(maya, 'Make them');
    answered(maya, item.id, '![a](designs/a.png)\n\nThe plan is `docs/plan.md`, the page is [here](designs/page.html).\n\ncuts/launch.mp4\n\nDeck: decks/board.pptx');
    await allSync();

    const work = theo.service.threadWork(maya.personId, item.id);
    const files = local(theo, maya.personId, item.id, work);
    expect(files).toHaveLength(5);
    for (const file of files) expect(fs.existsSync(file), file).toBe(true);
    expect(fs.readFileSync(files[0])).toEqual(PNG);
    const said = wordsIn(work).at(-1);
    expect(said).toMatch(/!\[a\]\(attachments\/[\w.-]+-a\.png\)/);
    expect(said).toMatch(/\[plan\.md\]\(attachments\/[\w.-]+-plan\.md\)/);
    expect(said).toMatch(/\[here\]\(attachments\/[\w.-]+-page\.html\)/);
    expect(said).not.toContain('designs/');
  });

  it('brings a new file on the next sync, and the new version of one changed on disk', async () => {
    write(maya, 'docs/plan.md', 'one');
    const item = lead(maya, 'Plan');
    answered(maya, item.id, 'See docs/plan.md');
    await allSync();
    const first = local(theo, maya.personId, item.id, theo.service.threadWork(maya.personId, item.id));
    expect(fs.readFileSync(first[0], 'utf8')).toBe('one');

    write(maya, 'docs/plan.md', 'two');
    answered(maya, item.id, 'Changed docs/plan.md');
    await allSync();
    const again = local(theo, maya.personId, item.id, theo.service.threadWork(maya.personId, item.id));
    expect(again.map((f) => fs.readFileSync(f, 'utf8'))).toContain('two');
  });

  // Over one call's 10 MB a file goes in parts (tests/team-a-shared-thread-file-over-10-mb-...);
  // only past 200 MB does it stay on the owner's computer, and the words say so.
  it('copies a file exactly at the limit whole, and one over 200 MB says the file stayed on the owner\'s computer', async () => {
    write(maya, 'cuts/fits.mp4', Buffer.alloc(MAX_THREAD_FILE_BYTES));
    const huge = path.join(maya.dir, 'cuts', 'huge.mp4');
    fs.writeFileSync(huge, '');
    fs.truncateSync(huge, 200 * 1024 * 1024 + 1);
    const item = lead(maya, 'Cuts');
    answered(maya, item.id, 'cuts/fits.mp4\n\ncuts/huge.mp4');
    await allSync();
    const work = theo.service.threadWork(maya.personId, item.id);
    const said = wordsIn(work).at(-1);
    expect(said).toMatch(/attachments\/[\w.-]+-fits\.mp4/);
    expect(said).toContain('huge.mp4 (over 200 MB, so it stays on the owner\'s computer)');
    expect(local(theo, maya.personId, item.id, work)).toHaveLength(1);
    expect(work.big ?? []).toEqual([]);
  });

  it('never sends a file outside the project, or a kind it does not carry, whatever a message names', async () => {
    const outside = path.join(os.tmpdir(), `secret-${process.pid}.md`);
    fs.writeFileSync(outside, 'secret notes');
    write(maya, 'server.key.txt', 'x');
    write(maya, 'src/app.mjs', 'code');
    const item = lead(maya, 'Files');
    answered(maya, item.id, `Look at ${outside} and src/app.mjs and ~/.ssh/id_rsa.md`);
    await allSync();
    expect([...cloud.threadFiles.values()].filter((f) => f.owner === maya.personId)).toEqual([]);
    fs.rmSync(outside);
  });

  it('leaves a bare mention inside a code block alone', async () => {
    write(maya, 'docs/plan.md', 'one');
    const item = lead(maya, 'Plan');
    answered(maya, item.id, '```\ncat docs/plan.md\n```');
    await allSync();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id)).at(-1)).toContain('cat docs/plan.md');
  });

  it('opens from its own folder, which the window reads as a project nobody can write to', async () => {
    write(maya, 'docs/plan.md', 'one');
    const item = lead(maya, 'Plan');
    answered(maya, item.id, 'docs/plan.md');
    await allSync();
    const work = theo.service.threadWork(maya.personId, item.id);
    const found = theo.service.sharedThreadProducts().find((p) => p.slug === work.product);
    expect(found.dir).toBe(work.dir);
    expect(theo.store.listProducts().map((p) => p.slug)).not.toContain(work.product);
    const name = [...JSON.stringify(work.lines).matchAll(/attachments\/([\w.-]+)/g)][0][0];
    const resolved = await resolveArtifact({ src: name, product: work.product, products: theo.service.sharedThreadProducts(), accountRoot: theo.accountRoot, storeRoot: theo.storeRoot });
    expect(resolved).toMatchObject({ ok: true, path: path.join(work.dir, name) });
  });
});

describe('who it reaches', () => {
  it('takes a thread made private back out of the cloud and off the viewer\'s computer', async () => {
    fs.mkdirSync(path.join(maya.dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(maya.dir, 'docs/plan.md'), 'plan');
    const item = lead(maya, 'Going private');
    answered(maya, item.id, 'docs/plan.md');
    await allSync();
    const { dir } = theo.service.threadWork(maya.personId, item.id);
    expect(fs.existsSync(dir)).toBe(true);
    expect(cloud.threadFiles.size).toBe(1);

    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await allSync();
    expect(cloud.threadWork.size).toBe(0);
    expect(cloud.threadFiles.size).toBe(0);
    expect(await theo.backend.threadWorkHeads()).toEqual([]);
    expect(theo.service.threadWork(maya.personId, item.id)).toMatchObject({ shared: false, lines: [] });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('never sends a private thread anywhere', async () => {
    const item = lead(maya, 'Mine alone', { visibility: 'private' });
    answered(maya, item.id, 'Only mine.');
    await allSync();
    expect(cloud.threadWork.size).toBe(0);
    expect(JSON.stringify(theo.service.threadWork(maya.personId, item.id))).not.toContain('Only mine');
  });

  it('reaches only the people a thread is shared with', async () => {
    const item = lead(maya, 'For Theo', { visibility: 'people', visibleTo: [theo.personId] });
    answered(maya, item.id, 'Theo only.');
    await allSync();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toContain('Theo only.');
    expect(jun.service.threadWork(maya.personId, item.id)).toMatchObject({ shared: false, lines: [] });
    expect(await jun.backend.threadWorkHeads()).toEqual([]);
    expect(await jun.backend.getThreadWork(maya.personId, item.id)).toBeNull();
    await expect(jun.backend.addThreadComment(maya.personId, item.id, 'hi')).rejects.toThrow();
    expect(await jun.backend.threadComments()).toEqual([]);
  });

  it('takes it away from someone taken off the list', async () => {
    const item = lead(maya, 'For both', { visibility: 'people', visibleTo: [theo.personId, jun.personId] });
    await allSync();
    expect(jun.service.threadWork(maya.personId, item.id).shared).toBe(true);
    maya.store.threadEdit('website', item.id, { visibleTo: [theo.personId] });
    await allSync();
    expect(jun.service.threadWork(maya.personId, item.id).shared).toBe(false);
    expect(theo.service.threadWork(maya.personId, item.id).shared).toBe(true);
  });

  it('refuses work for a thread with no card, and a stranger on another team', async () => {
    await expect(maya.backend.putThreadWork(maya.service.state().team.id, { threadId: 'w-1234567890', hash: 'x', work: { lines: [], earlier: 0, files: [] } })).rejects.toThrow();
    const stranger = memoryBackend(cloud, signUpMemory(cloud, { email: 'x@else.test', name: 'X' }));
    const item = lead(maya, 'Team thread');
    await allSync();
    expect(await stranger.threadWorkHeads()).toEqual([]);
    expect(await stranger.getThreadWork(maya.personId, item.id)).toBeNull();
    await expect(stranger.addThreadComment(maya.personId, item.id, 'hi')).rejects.toThrow();
  });
});

describe('a comment', () => {
  const posted = async (from, owner, id, text) => { await from.service.commentOnThread(owner.personId, id, text); await allSync(); };

  it('lands on the owner\'s thread under the commenter\'s name and everyone who can read it sees it', async () => {
    const item = lead(maya, 'Copy for launch');
    await allSync();
    await posted(theo, maya, item.id, 'The second headline is better');

    expect(maya.store.readItem('website', item.id).waitingComments).toMatchObject([{ by: theo.personId, text: 'The second headline is better' }]);
    for (const m of [theo, jun]) expect(wordsIn(m.service.threadWork(maya.personId, item.id))).toContain('The second headline is better');
    const line = jun.service.threadWork(maya.personId, item.id).lines.find((l) => l.patch.comment);
    expect(line.by).toBe(theo.personId);
  });

  it('starts no agent and changes nothing about a running thread', async () => {
    const item = lead(maya, 'Long job');
    expect(await disk.claimWorkItem(maya.dir, { holder: 'test', id: item.id, leaseMs: 60_000 })).toMatchObject({ claimed: true });
    const before = maya.store.readItem('website', item.id);
    await allSync();
    await posted(theo, maya, item.id, 'How is it going?');
    const after = maya.store.readItem('website', item.id);
    expect(after.status).toBe(before.status);
    expect(disk.readWorkItem(maya.dir, item.id).claim?.holder).toBe('test');
    expect(after.answer).toBe(before.answer);
    expect(after.body).toBe(before.body);
    expect(after.wrote.answer).toEqual(before.wrote.answer);
    expect(after.wrote.status).toEqual(before.wrote.status);
    const product = maya.store.listProducts().find((p) => p.slug === 'website');
    expect(mayRunHere(after, product, maya.personId)).toBe(mayRunHere(before, product, maya.personId));
  });

  it('is delivered once, however many passes run', async () => {
    const item = lead(maya, 'Once');
    await allSync();
    await posted(theo, maya, item.id, 'One comment');
    await allSync();
    await allSync();
    expect(maya.store.readItem('website', item.id).waitingComments).toHaveLength(1);
  });

  it.each([
    ['replies', (id) => maya.store.answerItem('website', id, { answer: 'Agreed' })],
    ['closes the thread', (id) => disk.updateWorkItem(maya.dir, id, { status: 'done' }, { source: 'founder' })],
    ['snoozes it', (id) => maya.store.snoozeItem('website', id, Date.now() + 3_600_000)],
  ])('clears from Needs you when the owner %s, and stays readable', async (_what, act) => {
    const item = lead(maya, 'Clears');
    await allSync();
    await posted(theo, maya, item.id, 'A thought');
    act(item.id);
    expect(maya.store.readItem('website', item.id).waitingComments ?? []).toEqual([]);
    await allSync();
    expect(wordsIn(theo.service.threadWork(maya.personId, item.id))).toContain('A thought');
  });

  it('comes back for a new comment after the owner dealt with the last one', async () => {
    const item = lead(maya, 'Twice');
    await allSync();
    await posted(theo, maya, item.id, 'First');
    maya.store.answerItem('website', item.id, { answer: 'Seen' });
    await posted(jun, maya, item.id, 'Second');
    expect(maya.store.readItem('website', item.id).waitingComments).toMatchObject([{ by: jun.personId, text: 'Second' }]);
  });

  it('is refused when the thread is private, and an empty one is refused everywhere', async () => {
    const item = lead(maya, 'Going private');
    await allSync();
    await expect(theo.service.commentOnThread(maya.personId, item.id, '   ')).rejects.toThrow();
    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await allSync();
    await expect(theo.service.commentOnThread(maya.personId, item.id, 'still there?')).rejects.toThrow();
    expect(maya.store.readItem('website', item.id).waitingComments ?? []).toEqual([]);
  });

  it('cannot be forged by a teammate pushing a line into a shared project', async () => {
    const { whatATeammateMaySet } = await import('../shared/team-rules.mts');
    const line = { id: 'w-1234567890', ts: 1, source: 'founder', by: theo.personId, uid: 'u', patch: { comment: { text: 'forged' } } };
    expect(whatATeammateMaySet(line)).toBeNull();
    expect(whatATeammateMaySet(line, { direct: true })).toBeNull();
  });
});
