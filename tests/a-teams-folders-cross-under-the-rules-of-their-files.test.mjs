// A TEAM'S FOLDERS CROSS TO TEAMMATES UNDER THE RULES OF THE FILES IN THEM.
//
// "I don't see a good organizational system." Files was one flat page per
// project: measured on the list main/files-place.mjs hands the page, a file had
// no place at all, so nobody could file anything for anybody.
//
// What must NOT cross: a folder made in a project only its owner sees, and the
// place of a file whose only copy is in a private thread (a place names the file).
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

async function aMac(cloud, personId, projects) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-folders-'));
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
  const say = async (id, thread, name) => {
    fs.writeFileSync(path.join(dir(id), 'designs', name), Buffer.concat([PNG, Buffer.from(name)]));
    await on(() => disk.updateWorkItem(dir(id), thread, { note: `[${name}](designs/${name})` }, { source: 'agent' }));
  };
  return { personId, store, service, on, place, dir, say };
}

let cloud, maya, sofia, jun, macs, open, hidden;
const allSync = async () => { for (let i = 0; i < 2; i += 1) for (const m of macs) { await m.service.syncNow(); await m.place.crossing(); } };
const named = (list, name) => list.files.find((f) => f.name === name);
const folder = (list, name) => list.folders.find((f) => f.name === name);

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  const ids = ['Maya Chen', 'Sofia Reyes', 'Jun Park'].map((name) => signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@lumen.test`, name }));
  maya = await aMac(cloud, ids[0], {
    app: { name: 'Lumen app', seenBy: 'team' },
    plans: { name: 'Plans', seenBy: 'private' },
    board: { name: 'Board', seenBy: 'people', seenByPeople: [ids[1]] },
  });
  sofia = await aMac(cloud, ids[1], {});
  jun = await aMac(cloud, ids[2], {});
  macs = [maya, sofia, jun];
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  for (const c of [sofia, jun]) {
    await maya.service.invite(cloud.people.get(c.personId).email);
    await c.service.signIn();
    await c.service.acceptInvite(maya.service.state().team.id);
  }
  open = await maya.on(() => maya.store.composeItem('app', { title: 'Launch page', body: 'x', visibility: 'team' }));
  hidden = await maya.on(() => maya.store.composeItem('app', { title: 'Mine', body: 'x', visibility: 'private' }));
  await maya.say('app', open.id, 'launch.png');
  await maya.say('app', hidden.id, 'salaries.png');
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

describe('a folder and a file in it, in a project the team sees', () => {
  it('reach a teammate, with the file inside the folder', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await maya.place.moveFile({ key: named(await maya.place.list(), 'launch.png').key, folder: made.id });
    await allSync();
    const seen = await sofia.place.list();
    expect(folder(seen, 'Launch')).toMatchObject({ project: 'Lumen app', parent: null });
    expect(named(seen, 'launch.png').folder).toBe(folder(seen, 'Launch').id);
  });

  it('stay together when a teammate renames the folder, and that rename comes back', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Lanch' });
    await allSync();
    await sofia.place.renameFolder({ id: made.id, name: 'Launch' });
    await allSync();
    expect(folder(await maya.place.list(), 'Launch').id).toBe(made.id);
    expect(folder(await maya.place.list(), 'Lanch')).toBeUndefined();
  });

  it('keeps a new version in its folder, because a place is the file and not one of its names', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await maya.place.moveFile({ key: named(await maya.place.list(), 'launch.png').key, folder: made.id });
    await maya.say('app', open.id, 'launch-v2.png');
    await allSync();
    for (const m of [maya, sofia]) expect(named(await m.place.list(), 'launch.png')).toMatchObject({ versions: 2, folder: made.id });
  });

  it('lets a teammate move a file back to the top', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    const key = named(await maya.place.list(), 'launch.png').key;
    await maya.place.moveFile({ key, folder: made.id });
    await allSync();
    await sofia.place.moveFile({ key, folder: null });
    await allSync();
    expect(named(await maya.place.list(), 'launch.png').folder).toBeNull();
  });

  it('nests one level and no deeper', async () => {
    const top = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    const sub = await maya.place.makeFolder({ project: 'Lumen app', name: 'Assets', parent: top.id });
    expect(sub.parent).toBe(top.id);
    await expect(maya.place.makeFolder({ project: 'Lumen app', name: 'Deep', parent: sub.id })).rejects.toThrow();
  });

  it('is one folder when two people make the same name apart', async () => {
    const a = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await sofia.place.makeFolder({ project: 'Lumen app', name: 'launch' });
    await maya.place.moveFile({ key: named(await maya.place.list(), 'launch.png').key, folder: a.id });
    await allSync();
    const seen = await sofia.place.list();
    const same = seen.folders.filter((f) => f.name.toLowerCase() === 'launch');
    expect(same).toHaveLength(1);
    expect(named(seen, 'launch.png').folder).toBe(same[0].id);
  });

  it('goes on the next pass when the cloud refused it the first time', async () => {
    const was = cloud.fileFolders;
    const down = () => { throw new Error('down'); };
    cloud.fileFolders = { find: down, filter: down, some: down };
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    expect(folder(await maya.place.list(), 'Launch').id).toBe(made.id);
    cloud.fileFolders = was;
    await allSync();
    expect(folder(await sofia.place.list(), 'Launch')).toBeTruthy();
  });
});

describe('what must not cross', () => {
  it('a folder in a project only its owner sees stays on her computer', async () => {
    await maya.place.makeFolder({ project: 'Plans', name: 'Layoffs' });
    await allSync();
    expect(folder(await maya.place.list(), 'Layoffs')).toBeTruthy();
    expect(folder(await sofia.place.list(), 'Layoffs')).toBeUndefined();
    expect(cloud.fileFolders.map((f) => f.name)).toEqual([]);
  });

  it('a folder in a project shared with chosen people reaches only them', async () => {
    await maya.place.makeFolder({ project: 'Board', name: 'Q3' });
    await allSync();
    expect(folder(await sofia.place.list(), 'Q3')).toBeTruthy();
    expect(folder(await jun.place.list(), 'Q3')).toBeUndefined();
  });

  it('the place of a file in a private thread stays here, and its name never reaches the cloud', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await maya.place.moveFile({ key: named(await maya.place.list(), 'salaries.png').key, folder: made.id });
    await allSync();
    expect(named(await maya.place.list(), 'salaries.png').folder).toBe(made.id);
    expect(named(await sofia.place.list(), 'salaries.png')).toBeUndefined();
    expect(JSON.stringify(cloud.filePlaces)).not.toContain('salaries');
  });

  it('someone outside the team reads no folder and can write none', async () => {
    const outsider = memoryBackend(cloud, signUpMemory(cloud, { email: 'x@elsewhere.test', name: 'X' }));
    await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await allSync();
    expect(await outsider.fileFolders()).toEqual([]);
    expect(await outsider.filePlaces()).toEqual([]);
    await expect(outsider.putFileFolder(maya.service.state().team.id, { id: 'x', project: 'Lumen app', name: 'Mine', parent: null, people: null, at: 1 })).rejects.toThrow();
  });

  it('a thread taken private takes its files\' places with it', async () => {
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await maya.place.moveFile({ key: named(await maya.place.list(), 'launch.png').key, folder: made.id });
    await allSync();
    expect(cloud.filePlaces).toHaveLength(1);
    await maya.on(() => maya.store.threadEdit('app', open.id, { visibility: 'private' }));
    await allSync();
    expect(cloud.filePlaces).toEqual([]);
  });
});
