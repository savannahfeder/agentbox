// AN EDIT FROM FILES LANDS AS THE NEXT VERSION OF THE ONE FILE, FOR EVERYONE.
//
// Maya edited october-investor-update.md in Files and the words were
// gone 17 minutes later. Measured on her store: no edit line for the 17:47 Done, and
// the Done at 18:06 answered "That file is not on this thread". The big view in
// Files hands the editor a resolved path on disk; the save looked for that path among
// the thread's own relative ones and could never match. From the thread it worked,
// and Dev read it as a stranger, october-investor-update-v2.md, because a tile and
// its message are named after the newest file on disk.
//
// Measured here with three copies over the memory cloud: an edit by version id
// from any door, read back on the other copies.
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
import { saveNextVersion } from '../main/file-version.mjs';
import { approvalSince, filesInLines, familyName, threadFiles } from '../shared/artifact-marks.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-files-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'company', 'updates'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'company', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  const dir = path.join(accountRoot, 'company');
  return { personId, store, service, on, place, dir };
}

let cloud, maya, dev, macs, thread;
const allSync = async () => { for (let i = 0; i < 3; i += 1) for (const m of macs) await m.service.syncNow(); };
const doc = async (mac) => (await mac.place.list()).files.filter((f) => f.kind === 'markdown' && /investor/.test(f.name));
const newestWords = async (mac, key) => {
  const view = await mac.place.open(key);
  const at = view.lines.at(-1).patch;
  const src = at.artifact?.path ?? /\]\(([^)]+)\)/.exec(at.note)[1];
  return { view, words: fs.readFileSync(src, 'utf8') };
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  const mayaId = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
  const devId = signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Patel' });
  maya = await aMac(cloud, mayaId);
  dev = await aMac(cloud, devId);
  macs = [maya, dev];
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  await maya.service.invite('dev@lumen.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  fs.writeFileSync(path.join(maya.dir, 'updates', 'october-investor-update.md'), '# Update\n\n- Waitlist: 40 clinics\n');
  thread = await maya.on(() => maya.store.composeItem('company', { title: 'Investor update', body: 'Draft it.', visibility: 'team' }));
  await maya.on(() => disk.updateWorkItem(maya.dir, thread.id, { result: 'Saved [october-investor-update.md](updates/october-investor-update.md).' }, { source: 'agent' }));
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

describe('Done in Files, on the copy that owns the thread', () => {
  it('is the next version of the same file, with the same name, for her and for Dev', async () => {
    const [before] = await doc(maya);
    const out = await maya.on(() => maya.place.edit(before.key, '# Update\n\n- Waitlist: 42 clinics\n'));
    expect(out).toMatchObject({ ok: true });

    const mine = await doc(maya);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'october-investor-update.md', versions: 2 });
    expect((await newestWords(maya, mine[0].key)).words).toContain('42 clinics');

    await allSync();
    const his = await doc(dev);
    expect(his).toHaveLength(1);
    expect(his[0]).toMatchObject({ name: 'october-investor-update.md', versions: 2 });
    expect((await newestWords(dev, his[0].key)).words).toContain('42 clinics');
  });

  it('never touches the older version', async () => {
    const [before] = await doc(maya);
    await maya.on(() => maya.place.edit(before.key, '# Update\n\n- Waitlist: 42 clinics\n'));
    expect(fs.readFileSync(path.join(maya.dir, 'updates', 'october-investor-update.md'), 'utf8')).toContain('40 clinics');
  });

  it('a second edit is v3 of the one file, not a new one', async () => {
    const [before] = await doc(maya);
    await maya.on(() => maya.place.edit(before.key, 'two'));
    await maya.on(() => maya.place.edit(before.key, 'three'));
    const mine = await doc(maya);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'october-investor-update.md', versions: 3 });
    expect((await newestWords(maya, mine[0].key)).words).toBe('three');
  });

  it('the view says the new version is an edit, and by whom', async () => {
    const [before] = await doc(maya);
    await maya.on(() => maya.place.edit(before.key, 'two'));
    const { view } = await newestWords(maya, before.key);
    const [family] = threadFiles(filesInLines(view.lines));
    expect(family.versions).toHaveLength(2);
    expect(family.versions[1]).toMatchObject({ edited: true, by: maya.personId });
  });

  it('keeps a version name no other copy holds', async () => {
    const [before] = await doc(maya);
    // Another of her threads already says v2 of this file; this thread only knows v1.
    fs.writeFileSync(path.join(maya.dir, 'updates', 'october-investor-update-v2.md'), 'the other thread');
    const other = await maya.on(() => maya.store.composeItem('company', { title: 'Other', body: 'x', visibility: 'team' }));
    await maya.on(() => disk.updateWorkItem(maya.dir, other.id, { result: 'See [october-investor-update-v2.md](updates/october-investor-update-v2.md).' }, { source: 'agent' }));
    await maya.on(() => maya.place.edit(before.key, 'mine'));
    const [after] = await doc(maya);
    expect(after.versions).toBe(3);
    expect((await newestWords(maya, after.key)).words).toBe('mine');
  });
});

describe('Done in Files, on a teammate\'s copy', () => {
  it('reaches the owner as the next version, and comes back to him', async () => {
    const [his] = await doc(dev);
    const out = await dev.on(() => dev.place.edit(his.key, 'from dev'));
    expect(out).toMatchObject({ ok: true, goes: 'sent', to: maya.personId });
    await allSync();
    const [mine] = await doc(maya);
    expect(mine).toMatchObject({ name: 'october-investor-update.md', versions: 2 });
    expect((await newestWords(maya, mine.key)).words).toBe('from dev');
    const [back] = await doc(dev);
    expect(back.versions).toBe(2);
    expect((await newestWords(dev, back.key)).words).toBe('from dev');
  });

  it('asks about a version the owner\'s thread names, whatever copy the file came by', async () => {
    const [his] = await doc(dev);
    await dev.on(() => dev.place.edit(his.key, 'first'));
    await allSync();
    const [again] = await doc(dev);
    await dev.on(() => dev.place.edit(again.key, 'second'));
    await allSync();
    const [mine] = await doc(maya);
    expect(mine.versions).toBe(3);
    expect((await newestWords(maya, mine.key)).words).toBe('second');
  });
});

describe('what must not save, and says so', () => {
  it('a file that is gone', async () => {
    const out = await maya.place.edit('company\0nothing\0markdown', 'x');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Nothing was saved/);
  });

  it('empty words, and writes no file', async () => {
    const [before] = await doc(maya);
    const out = await maya.on(() => maya.place.edit(before.key, '   '));
    expect(out.ok).toBe(false);
    expect((await doc(maya))[0].versions).toBe(1);
  });

  it('a picture', async () => {
    fs.writeFileSync(path.join(maya.dir, 'updates', 'shot.png'), 'x');
    await maya.on(() => disk.updateWorkItem(maya.dir, thread.id, { note: '[shot.png](updates/shot.png)' }, { source: 'agent' }));
    const pic = (await maya.place.list()).files.find((f) => f.kind === 'image');
    const out = await maya.on(() => maya.place.edit(pic.key, 'words'));
    expect(out.ok).toBe(false);
    expect(fs.readdirSync(path.join(maya.dir, 'updates'))).not.toContain('shot-v2.png');
  });
});

describe('saving by a base that drifted', () => {
  const lines = [{ id: 'w', ts: 1, source: 'agent', patch: { result: '[plan.md](designs/plan.md)' } }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-base-'));

  it('finds the family when the id is another version of the same file', () => {
    const out = saveNextVersion({ dir, threadId: 'w', lines, baseId: 'plan-v4.md', text: 'x' });
    expect(out).toMatchObject({ ok: true, file: 'plan.md' });
  });

  it('still refuses a file of another family', () => {
    expect(saveNextVersion({ dir, threadId: 'w', lines, baseId: 'report.md', text: 'x' }).ok).toBe(false);
  });

  it('still refuses a resolved path that is not the thread\'s, rather than guess', () => {
    expect(saveNextVersion({ dir, threadId: 'w', lines, basePath: '/elsewhere/report.md', text: 'x' }).ok).toBe(false);
  });

  it('skips names another copy holds', () => {
    const out = saveNextVersion({ dir, threadId: 'x', lines, baseId: 'plan.md', text: 'x', taken: ['plan.md', 'plan-v2.md', 'plan-v3.md'] });
    expect(out.name).toBe('plan-v4.md');
  });
});

describe('the name a person reads', () => {
  const family = { versions: [{ name: 'a.md', n: 1 }, { name: 'a-v2.md', n: 2, edited: true }, { name: 'a-v3.md', n: 3, edited: true }] };
  it('an edit keeps the name of what was edited', () => {
    expect(familyName(family, family.versions[2])).toBe('a.md');
  });
  // A file read "group-seat-picker-v2.png" over "v5 of 5"; one file has one name.
  it('an agent\'s own next go is still the file\'s name', () => {
    const made = { versions: [{ name: 'a.md', n: 1 }, { name: 'a-v2.md', n: 2 }] };
    expect(familyName(made, made.versions[1])).toBe('a.md');
  });
  it('an edit after an agent\'s go is still the file\'s name', () => {
    const mixed = { versions: [{ name: 'a.md', n: 1 }, { name: 'a-v2.md', n: 2 }, { name: 'a-v3.md', n: 3, edited: true }] };
    expect(familyName(mixed, mixed.versions[2])).toBe('a.md');
  });
});

describe('an approval and a later edit', () => {
  const versions = [{ id: 'a.md', n: 1, by: 'maya' }, { id: 'a-v2.md', n: 2, by: 'dev', edited: true }];
  const family = { versions };
  const nameOf = (id) => ({ maya: 'Maya', dev: 'Dev' }[id] ?? 'A teammate');

  it('says who approved which version and who changed it since', () => {
    expect(approvalSince(family, 1, [{ file: 'a.md', by: 'maya', ts: 1 }], nameOf)).toBe('Maya approved v1. Dev changed it since, so this version is not approved.');
  });
  it('says nothing on the version that was approved', () => {
    expect(approvalSince(family, 0, [{ file: 'a.md', by: 'maya', ts: 1 }], nameOf)).toBeNull();
  });
  it('says nothing when the new version was approved too', () => {
    expect(approvalSince(family, 1, [{ file: 'a.md', by: 'maya', ts: 1 }, { file: 'a-v2.md', by: 'maya', ts: 2 }], nameOf)).toBeNull();
  });
  it('says nothing when nobody approved anything', () => {
    expect(approvalSince(family, 1, [], nameOf)).toBeNull();
  });

  it('a tile stops saying Approved once the words change', async () => {
    const [before] = await doc(maya);
    await maya.on(() => maya.place.mark(before.key, { do: 'approve', file: before.name }));
    expect((await doc(maya))[0].approvedBy).toEqual([maya.personId]);
    await maya.on(() => maya.place.edit(before.key, 'changed'));
    const [after] = await doc(maya);
    expect(after.approvedBy).toEqual([]);
    expect(after.changedSinceApproval).toEqual({ by: maya.personId, approvedBy: maya.personId });
  });
});
