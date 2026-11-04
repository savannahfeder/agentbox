// A teammate on a shared thread had no way to change a document, and the file
// lives on the owner's computer. Now their edit travels as a mark under the card's
// read rule, and the owner's copy turns it into the next version, which reaches
// everyone as a message linking the file. Three people over the in-memory cloud,
// through the real team service, which keeps the same rule the real cloud does.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { filesInLines, threadFiles } from '../shared/artifact-marks.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-edit-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const backend = memoryBackend(cloud, personId);
  const service = createTeamService({
    session: memorySession(() => backend),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, backend, dir: path.join(accountRoot, 'website') };
}

let cloud, maya, theo, macs, thread, rel;
const allSync = async () => { for (const m of macs) await m.service.syncNow(); };
const mine = () => disk.readItemHistory(maya.dir, thread.id);
const onDisk = (name) => path.join(maya.dir, 'designs', thread.id, name);

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  macs = [maya, theo];
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
  thread = maya.store.composeItem('website', { title: 'Plan', visibility: 'team' });
  rel = `designs/${thread.id}/plan.md`;
  fs.mkdirSync(path.dirname(onDisk('plan.md')), { recursive: true });
  fs.writeFileSync(onDisk('plan.md'), '# Plan\n\nOriginal.\n');
  disk.updateWorkItem(maya.dir, thread.id, { result: `I wrote [plan.md](${rel}).` }, { source: 'agent' });
  await allSync();
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });

describe('someone who can read the thread', () => {
  it('saves the next version on the owner\'s disk, as an edit by them', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: '# Plan\n\nTheo changed this.\n' });
    await allSync();
    expect(fs.readFileSync(onDisk('plan-v2.md'), 'utf8')).toBe('# Plan\n\nTheo changed this.\n');
    expect(fs.readFileSync(onDisk('plan.md'), 'utf8')).toBe('# Plan\n\nOriginal.\n');
    const [family] = threadFiles(filesInLines(mine()));
    expect(family.versions.map((v) => [v.name, v.by, !!v.edited])).toEqual([['plan.md', maya.personId, false], ['plan-v2.md', theo.personId, true]]);
  });

  it('applies once, however many times the copies sync', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: 'one' });
    await allSync(); await allSync(); await allSync();
    expect(fs.existsSync(onDisk('plan-v3.md'))).toBe(false);
    expect(threadFiles(filesInLines(mine()))[0].versions).toHaveLength(2);
  });

  it('sees the new version on their own copy as the same file\'s next version', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: 'theirs' });
    await allSync(); await allSync();
    const work = theo.service.threadWork(maya.personId, thread.id);
    const [family] = threadFiles(filesInLines(work.lines));
    expect(family.versions.map((v) => v.name)).toEqual(['plan.md', 'plan-v2.md']);
    expect(family.versions[1].edited).toBe(true);
    expect(family.versions[1].path).toMatch(/^attachments\/[0-9a-f]{12}-plan-v2\.md$/);
  });

  it('a second edit from the same version is kept beside the first, and marked as such', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: 'first' });
    await allSync();
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: 'second' });
    await allSync();
    expect(fs.readFileSync(onDisk('plan-v2.md'), 'utf8')).toBe('first');
    expect(fs.readFileSync(onDisk('plan-v3.md'), 'utf8')).toBe('second');
    const edits = mine().map((l) => l.patch?.artifact).filter((m) => m?.do === 'edit');
    expect(edits.at(-1)).toMatchObject({ over: 'plan-v2.md' });
  });
});

describe('what is refused', () => {
  it('someone the thread is not shared with cannot edit: the cloud says no and the disk is untouched', async () => {
    disk.updateWorkItem(maya.dir, thread.id, { visibility: 'private' }, { source: 'founder' });
    await allSync();
    await expect(theo.backend.addFileMark(maya.personId, thread.id, { id: 'e1', mark: { do: 'edit', file: 'plan.md', text: 'not theirs' } })).rejects.toThrow(/not allowed/);
    await allSync();
    expect(fs.existsSync(onDisk('plan-v2.md'))).toBe(false);
  });

  it('a mark naming a path of its own is not believed: only words become a file', async () => {
    await theo.backend.addFileMark(maya.personId, thread.id, { id: 'e2', mark: { do: 'edit', file: 'plan.md', path: 'designs/secret/x.md' } });
    await allSync();
    expect(mine().some((l) => l.patch?.artifact?.do === 'edit')).toBe(false);
  });

  it('an edit naming a file not on the thread writes nothing', async () => {
    await theo.backend.addFileMark(maya.personId, thread.id, { id: 'e3', mark: { do: 'edit', file: 'other.md', text: 'words' } });
    await allSync();
    expect(fs.readdirSync(path.dirname(onDisk('plan.md')))).toEqual(['plan.md']);
  });
});

describe('the words the view reads', () => {
  it('a comment still reaches the owner next to all this', async () => {
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'note', id: 'n1', file: 'plan.md', place: { kind: 'whole' }, text: 'Good' });
    await theo.service.markSharedFile(maya.personId, thread.id, { do: 'edit', file: 'plan.md', text: 'edit' });
    await allSync();
    expect(maya.store.readItem('website', thread.id).artifacts.notes.map((n) => n.id)).toEqual(['n1']);
  });
});
