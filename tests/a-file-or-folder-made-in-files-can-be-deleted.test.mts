// A FILE OR FOLDER MADE IN FILES CAN BE DELETED.
//
// A tester made a folder and a document in My Workspace and found no way to
// remove either (w-4de073ca3b). Measured before this: a new document is empty,
// so its `movable` came back as 0 bytes and the menu hid Move to the Trash; and
// appFilesPlace had no way to remove a folder at all.
//
// What must hold: an empty document can go to the Trash and another empty one
// stays listed; a file in a code folder still cannot; a removed folder and its
// subfolders are gone, their files back at the top of the project, and putting
// it back returns them; a removed shared folder leaves the cloud for teammates.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

let store; let place; let dir; let storeRoot;

beforeEach(async () => {
  disk._internals.forgetFolds();
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-in-files-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'company');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  let n = 0;
  place = appFilesPlace({ store, accountRoot, storeRoot, trashItem: async (p: string) => { n += 1; fs.renameSync(p, path.join(storeRoot, `bin-${n}`)); } });
});

const listed = async () => (await place.list()).files;
const named = async (name: string) => (await listed()).find((f) => f.name === name);

describe('a new, empty document', () => {
  it('can be moved to the Trash', async () => {
    await place.newDocument({ project: 'Company', name: 'qa doc' });
    expect(await named('qa-doc.md')).toMatchObject({ trashable: true });
  });

  it('is gone once it is, and another empty one stays', async () => {
    const one = await place.newDocument({ project: 'Company', name: 'One' });
    await place.newDocument({ project: 'Company', name: 'Two' });
    expect(await place.trash({ keys: [one.key] })).toMatchObject({ ok: true, moved: 1 });
    expect((await listed()).map((f) => f.name)).toEqual(['two.md']);
  });
});

// Two power testers typed "ideas.md" and got ideas-md.md.
describe('a new document named with its own ending', () => {
  it('keeps the name as typed', async () => {
    await place.newDocument({ project: 'Company', name: 'ideas.md' });
    await place.newDocument({ project: 'Company', name: 'Leads.CSV', kind: 'table' });
    expect((await listed()).map((f) => f.name).sort()).toEqual(['ideas.md', 'leads.csv']);
  });

  it('but not an ending of another kind', async () => {
    await place.newDocument({ project: 'Company', name: 'notes.csv' });
    expect((await listed()).map((f) => f.name)).toEqual(['notes-csv.md']);
  });
});

it('a file whose only copy is in a code folder cannot be moved to the Trash', async () => {
  const repo = path.join(storeRoot, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes.md'), 'kept by the code\n');
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company', repoPath: repo }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot: path.dirname(dir), products: [] }).init();
  place = appFilesPlace({ store, accountRoot: path.dirname(dir), storeRoot, trashItem: async () => {} });
  const item = store.composeItem('company', { title: 'Notes', body: 'x' });
  await disk.updateWorkItem(dir, item.id, { note: `[notes.md](${path.join(repo, 'notes.md')})` }, { source: 'agent' });
  const file = await named('notes.md');
  expect(file).toBeTruthy();
  expect(file.trashable).toBeFalsy();
});

describe('a folder', () => {
  it('is gone once removed, with its files at the top of the project', async () => {
    const f = await place.makeFolder({ project: 'Company', name: 'qa46renamed' });
    await place.newDocument({ project: 'Company', name: 'Inside', folder: f.id });
    expect(await place.removeFolder({ id: f.id })).toMatchObject({ ok: true });
    const list = await place.list();
    expect(list.folders).toEqual([]);
    expect(list.files.find((x) => x.name === 'inside.md')).toMatchObject({ folder: null });
  });

  it('takes its subfolders with it', async () => {
    const top = await place.makeFolder({ project: 'Company', name: 'Top' });
    const sub = await place.makeFolder({ project: 'Company', name: 'Sub', parent: top.id });
    await place.newDocument({ project: 'Company', name: 'Deep', folder: sub.id });
    await place.makeFolder({ project: 'Company', name: 'Other' });
    expect(await place.removeFolder({ id: top.id })).toMatchObject({ ok: true });
    const list = await place.list();
    expect(list.folders.map((x) => x.name)).toEqual(['Other']);
    expect(list.files.find((x) => x.name === 'deep.md')).toMatchObject({ folder: null });
  });

  it('comes back, with its files in it, when put back', async () => {
    const top = await place.makeFolder({ project: 'Company', name: 'Top' });
    const sub = await place.makeFolder({ project: 'Company', name: 'Sub', parent: top.id });
    await place.newDocument({ project: 'Company', name: 'Deep', folder: sub.id });
    const gone = await place.removeFolder({ id: top.id });
    await place.restoreFolders({ ids: gone.ids });
    const list = await place.list();
    expect(list.folders.map((x) => x.name).sort()).toEqual(['Sub', 'Top']);
    expect(list.files.find((x) => x.name === 'deep.md')).toMatchObject({ folder: sub.id });
  });

  it('that is not there cannot be removed', async () => {
    await expect(place.removeFolder({ id: 'nope' })).rejects.toThrow(/gone/);
  });
});

describe('a folder in a project the team sees', () => {
  let cloud; let macs;
  async function aMac(personId: string, projects: Record<string, object>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-folder-'));
    const accountRoot = path.join(root, 'accounts', 'a');
    for (const [id, json] of Object.entries(projects)) {
      fs.mkdirSync(path.join(accountRoot, id), { recursive: true });
      fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, ...json }));
    }
    const s = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({
      session: memorySession(() => memoryBackend(cloud, personId)),
      store: s, disk, accountRoot, stateFile: path.join(root, '.team-sync.json'), intervalMs: 3_600_000,
    });
    return { service, place: appFilesPlace({ store: s, team: service, accountRoot, storeRoot: root }) };
  }
  const allSync = async () => { for (let i = 0; i < 2; i += 1) for (const m of macs) { await m.service.syncNow(); await m.place.crossing(); } };

  beforeEach(async () => {
    cloud = createMemoryCloud();
    const ids = ['Maya Chen', 'Sofia Reyes'].map((name) => signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@lumen.test`, name }));
    macs = [await aMac(ids[0], { app: { name: 'Lumen app', seenBy: 'team' } }), await aMac(ids[1], {})];
    await macs[0].service.signIn();
    await macs[0].service.createTeam('Lumen');
    await macs[0].service.invite(cloud.people.get(ids[1]).email);
    await macs[1].service.signIn();
    await macs[1].service.acceptInvite(macs[0].service.state().team.id);
  });
  afterEach(async () => { for (const m of macs) await m.service.signOut(); });

  it('is gone for a teammate once removed, and back when put back', async () => {
    const [maya, sofia] = macs;
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await allSync();
    expect((await sofia.place.list()).folders.map((f) => f.name)).toEqual(['Launch']);
    const gone = await maya.place.removeFolder({ id: made.id });
    await allSync();
    expect((await sofia.place.list()).folders).toEqual([]);
    expect((await maya.place.list()).folders).toEqual([]);
    await maya.place.restoreFolders({ ids: gone.ids });
    await allSync();
    expect((await sofia.place.list()).folders.map((f) => f.name)).toEqual(['Launch']);
  });

  it('a teammate removed stays gone here, though this copy made it', async () => {
    const [maya, sofia] = macs;
    const made = await maya.place.makeFolder({ project: 'Lumen app', name: 'Launch' });
    await allSync();
    await sofia.place.removeFolder({ id: made.id });
    await allSync();
    expect((await maya.place.list()).folders).toEqual([]);
  });
});
