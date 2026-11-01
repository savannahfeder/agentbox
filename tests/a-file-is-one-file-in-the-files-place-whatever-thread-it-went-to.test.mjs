// A FILE IS ONE FILE IN THE FILES PLACE, WHATEVER THREAD IT WENT TO.
//
// Sofia: "a comment belongs to a copy of a file in a thread, so my
// agent read 'no comments' on a file that had one", and a team "will go back to
// Drive" for want of one place that lists the team's files. There was no such
// place: a file existed only as copies inside threads and chats, each with its
// own comments. Measured with three copies of the app over the memory cloud:
// Maya's agent makes a picture and its second version, Maya sends it to Dev,
// Dev comments and approves on his copy, and the Files place is read on Maya's.
//
// What must NOT appear: a teammate's private thread's file, and a file in a
// project that is shown to someone else only.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { appFilesPlace } from '../main/files-place.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
// Its second version has bytes of its own: the same bytes are the same version.
const PNG2 = Buffer.concat([PNG, Buffer.from('v2')]);

async function aMac(cloud, personId, projects) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-place-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const [id, json] of Object.entries(projects)) {
    fs.mkdirSync(path.join(accountRoot, id, 'designs'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, ...json }));
  }
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  const dir = (id) => path.join(accountRoot, id);
  const picture = (id, name, bytes = PNG) => fs.writeFileSync(path.join(dir(id), 'designs', name), bytes);
  return { personId, store, service, on, place, dir, picture };
}

const note = (id, file, text) => ({ do: 'note', id, file, place: { kind: 'whole' }, text });

let cloud, maya, dev, sofia, macs, thread, sent;
const allSync = async () => { for (let i = 0; i < 2; i += 1) for (const m of macs) await m.service.syncNow(); };

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  const mayaId = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
  const devId = signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Patel' });
  const sofiaId = signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Reyes' });
  maya = await aMac(cloud, mayaId, { website: { name: 'Website', seenBy: 'team' } });
  dev = await aMac(cloud, devId, {
    website: { name: 'Website', seenBy: 'team' },
    billing: { name: 'Billing', seenBy: 'people', seenByPeople: [sofiaId] },
  });
  sofia = await aMac(cloud, sofiaId, {});
  macs = [maya, dev, sofia];
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  for (const c of [dev, sofia]) {
    await maya.service.invite(cloud.people.get(c.personId).email);
    await c.service.signIn();
    await c.service.acceptInvite(maya.service.state().team.id);
  }

  // Maya's agent makes the picture, then its second version, in her thread.
  maya.picture('website', 'onboarding.png');
  maya.picture('website', 'onboarding-v2.png', PNG2);
  thread = await maya.on(() => maya.store.composeItem('website', { title: 'Onboarding picture', body: 'Make the onboarding picture.', visibility: 'team' }));
  await maya.on(() => disk.updateWorkItem(maya.dir('website'), thread.id, { note: 'Here it is: [onboarding.png](designs/onboarding.png)' }, { source: 'agent' }));
  await maya.on(() => maya.store.fileMark('website', thread.id, note('n-maya', 'onboarding.png', 'Lower the headline')));
  await maya.on(() => disk.updateWorkItem(maya.dir('website'), thread.id, { note: 'Lowered: [onboarding-v2.png](designs/onboarding-v2.png)' }, { source: 'agent' }));
  await maya.on(() => maya.store.fileMark('website', thread.id, { do: 'resolve', on: 'n-maya' }));
  await maya.on(() => maya.store.fileMark('website', thread.id, note('n-maya2', 'onboarding-v2.png', 'Still too pale')));

  // She sends it to Dev, and he comments and approves on his copy in their chat.
  sent = await maya.on(() => maya.service.message(dev.personId, 'Is this right?', undefined, [{ name: 'onboarding-v2.png', dataBase64: PNG2.toString('base64') }]));
  await allSync();
  const devChat = dev.store.listProducts().find((p) => p.team?.direct).slug;
  await dev.on(() => dev.store.fileMark(devChat, sent.id, note('n-dev', 'onboarding-v2.png', 'Make the button darker')));
  await dev.on(() => dev.store.fileMark(devChat, sent.id, { do: 'approve', file: 'onboarding-v2.png' }));

  // Dev's own threads: one for the team, one private, one in a project only Sofia sees.
  dev.picture('website', 'hero.png');
  dev.picture('website', 'secret.png');
  dev.picture('billing', 'invoice.png');
  const open = await dev.on(() => dev.store.composeItem('website', { title: 'Hero', body: 'x', visibility: 'team' }));
  await dev.on(() => disk.updateWorkItem(dev.dir('website'), open.id, { note: '[hero.png](designs/hero.png)' }, { source: 'agent' }));
  const hidden = await dev.on(() => dev.store.composeItem('website', { title: 'Mine', body: 'x', visibility: 'private' }));
  await dev.on(() => disk.updateWorkItem(dev.dir('website'), hidden.id, { note: '[secret.png](designs/secret.png)' }, { source: 'agent' }));
  const bill = await dev.on(() => dev.store.composeItem('billing', { title: 'Invoice', body: 'x' }));
  await dev.on(() => disk.updateWorkItem(dev.dir('billing'), bill.id, { note: '[invoice.png](designs/invoice.png)' }, { source: 'agent' }));
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

const named = (list, name) => list.files.find((f) => f.name === name);

describe('the picture Maya\'s agent made, sent to Dev', () => {
  it('is one file, at its newest version, in its project', async () => {
    const list = await maya.place.list();
    const pics = list.files.filter((f) => f.name.startsWith('onboarding'));
    expect(pics).toHaveLength(1);
    expect(pics[0]).toMatchObject({ name: 'onboarding.png', kind: 'image', versions: 2, project: 'Website' });
  });

  it('counts the open comments from both places, not the resolved one', async () => {
    expect(named(await maya.place.list(), 'onboarding.png').open).toBe(2);
  });

  it('is approved by Dev, from his copy', async () => {
    expect(named(await maya.place.list(), 'onboarding.png').approvedBy).toEqual([dev.personId]);
  });

  // Today lists an approval as a decision, so it needs who and when.
  it('says when each person approved it', async () => {
    const [a] = named(await maya.place.list(), 'onboarding.png').approved;
    expect(a.by).toBe(dev.personId);
    expect(a.at).toBeGreaterThan(0);
  });

  it('says each place it was sent in', async () => {
    const file = named(await maya.place.list(), 'onboarding.png');
    expect(file.sentIn.map((s) => s.kind).sort()).toEqual(['chat', 'thread']);
    expect(file.sentIn.find((s) => s.kind === 'thread')).toMatchObject({ product: 'website', id: thread.id, title: 'Onboarding picture' });
  });

  it('on Dev\'s copy, the chat is named for Maya, who started it', async () => {
    const file = named(await dev.place.list(), 'onboarding.png');
    expect(file.sentIn.map((s) => s.title)).toContain('Chat with Maya');
  });

  it('opens with every comment on it, each saying where it was made', async () => {
    const file = named(await maya.place.list(), 'onboarding.png');
    const view = await maya.place.open(file.key);
    const texts = view.marks.notes.map((n) => [n.text, n.in]);
    expect(texts).toEqual(expect.arrayContaining([
      ['Lower the headline', 'Onboarding picture'], ['Still too pale', 'Onboarding picture'], ['Make the button darker', 'Chat with Dev'],
    ]));
    expect(view.versions.map((v) => v.name)).toEqual(['onboarding.png', 'onboarding-v2.png']);
  });

  it('a comment written there goes to the thread the file was made in', async () => {
    const file = named(await maya.place.list(), 'onboarding.png');
    const out = await maya.place.mark(file.key, note('n-here', 'onboarding-v2.png', 'From the Files place'));
    expect(out.ok).toBe(true);
    expect(maya.store.readItem('website', thread.id).artifacts.notes.map((n) => n.id)).toContain('n-here');
  });

  it('resolving Dev\'s comment there resolves it in the chat', async () => {
    const file = named(await maya.place.list(), 'onboarding.png');
    expect((await maya.place.mark(file.key, { do: 'resolve', on: 'n-dev' })).ok).toBe(true);
    const chat = maya.store.listProducts().find((p) => p.team?.direct).slug;
    expect(maya.store.readItem(chat, sent.id).artifacts.notes.find((n) => n.id === 'n-dev').resolved).toBe(true);
    expect(named(await maya.place.list(), 'onboarding.png').open).toBe(1);
  });
});

describe('only what the person may read', () => {
  it('a teammate\'s thread the team can read is there, in its project, as made by their agent', async () => {
    expect(named(await maya.place.list(), 'hero.png')).toMatchObject({
      project: 'Website', by: dev.personId, agent: '', sentIn: [{ kind: 'shared', ownerId: dev.personId, title: 'Hero' }],
    });
  });
  it('a teammate\'s private thread\'s file is not', async () => {
    expect(named(await maya.place.list(), 'secret.png')).toBeUndefined();
    expect(named(await sofia.place.list(), 'secret.png')).toBeUndefined();
  });
  it('a file in a project shown to someone else only is not, and is for them', async () => {
    expect(named(await maya.place.list(), 'invoice.png')).toBeUndefined();
    expect(named(await sofia.place.list(), 'invoice.png')).toMatchObject({ project: 'Billing' });
  });
  it('a key that is not on the list opens nothing', async () => {
    await expect(maya.place.open('billing\u0000invoice\u0000image')).resolves.toBeNull();
  });
});

describe('the projects', () => {
  it('lists each project with files, newest file first', async () => {
    const list = await maya.place.list();
    expect(list.projects).toEqual(['Website']);
    const at = list.files.map((f) => f.at);
    expect([...at].sort((a, b) => b - a)).toEqual(at);
  });
});
