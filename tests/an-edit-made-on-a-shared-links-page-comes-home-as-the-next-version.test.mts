// AN EDIT MADE ON A SHARED LINK'S PAGE COMES HOME AS THE FILE'S NEXT VERSION.
//
// Asked for 2026-11-12 (w-926a6814a5): a shared document can now be edited by
// the people its owner lets edit, on its page. The edit lived only in the
// cloud: the owner's own file never changed, and their share panel then
// offered "Update link", which would have put their older copy over it.
// Measured on main/team/link-edits.mts against a stand-in cloud and a real
// temporary folder (the version written, an edit run that keeps going, a file
// the owner changed meanwhile, a link whose folder this computer does not
// know), and through the team service on the memory cloud, where the panel
// asking about an edited link brings the edit home before it answers.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bringLinkEditsHome, linkHash, type LinkEdit, type LinkPlace } from '../main/team/link-edits.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const SOURCE = 'proj/w-1/plan/plan.md';

function aFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-edits-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '# Plan');
  fs.writeFileSync(path.join(dir, 'plan-v2.md'), '# Plan two');
  fs.writeFileSync(path.join(dir, 'other.md'), 'not this family');
  return dir;
}

function aCloud(dir: string) {
  let body = 'Theo was here';
  let rev = 5;
  const home: [string, number, number][] = [];
  const notes: [string, string, string][] = [];
  const logs: string[] = [];
  const places = new Map<string, LinkPlace>([[SOURCE, { path: path.join(dir, 'plan-v2.md') }]]);
  const edit = (): LinkEdit => ({ token: 'tok1', source: SOURCE, name: 'plan-v2.md', rev, hash: linkHash(body), version: 2, byName: 'Theo' });
  const run = () => bringLinkEditsHome({
    backend: {
      linksChangedOnWeb: async () => [edit()],
      fileLinkView: async () => ({ stopped: false, file: { kind: 'markdown', body, rev } }),
      fileLinkBroughtHome: async (t, r, v) => { home.push([t, r, v]); },
    },
    placeOf: (s) => places.get(s) ?? null,
    setPlace: (s, p) => { places.set(s, p); },
    note: ({ product, thread }, text) => { notes.push([product, thread, text]); },
    log: (l) => logs.push(l),
  });
  return { run, home, notes, logs, places, set: (b: string, r: number) => { body = b; rev = r; } };
}

describe('bringing an edit home', () => {
  let dir: string;
  beforeEach(() => { dir = aFolder(); });

  it('writes it beside the newest version as the next one, says so on the thread, and tells the cloud', async () => {
    const c = aCloud(dir);
    expect(await c.run()).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'plan-v3.md'), 'utf8')).toBe('Theo was here');
    expect(fs.readFileSync(path.join(dir, 'plan-v2.md'), 'utf8')).toBe('# Plan two');
    expect(c.home).toEqual([['tok1', 5, 3]]);
    expect(c.notes).toEqual([['proj', 'w-1', 'Theo edited plan.md on its page. The edit is plan-v3.md.']]);
  });

  it('keeps one file for a run of saves: the copy it wrote, untouched since, is written over', async () => {
    const c = aCloud(dir);
    await c.run();
    c.set('Theo was here, and kept typing', 6);
    expect(await c.run()).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'plan-v3.md'), 'utf8')).toBe('Theo was here, and kept typing');
    expect(fs.existsSync(path.join(dir, 'plan-v4.md'))).toBe(false);
    expect(c.home).toEqual([['tok1', 5, 3], ['tok1', 6, 3]]);
    expect(c.notes).toHaveLength(1);
  });

  it('does not write over a copy the owner changed since: the edit is a version of its own', async () => {
    const c = aCloud(dir);
    await c.run();
    fs.writeFileSync(path.join(dir, 'plan-v3.md'), 'Maya changed it here');
    c.set('Theo again', 7);
    await c.run();
    expect(fs.readFileSync(path.join(dir, 'plan-v3.md'), 'utf8')).toBe('Maya changed it here');
    expect(fs.readFileSync(path.join(dir, 'plan-v4.md'), 'utf8')).toBe('Theo again');
    expect(c.home.at(-1)).toEqual(['tok1', 7, 4]);
  });

  it('writes nothing when the newest version already holds those words, and still tells the cloud', async () => {
    const c = aCloud(dir);
    c.set('# Plan two', 8);
    expect(await c.run()).toBe(0);
    expect(fs.readdirSync(dir).sort()).toEqual(['other.md', 'plan-v2.md', 'plan.md']);
    expect(c.home).toEqual([['tok1', 8, 2]]);
    expect(c.notes).toEqual([]);
  });

  it('leaves a link whose folder this computer does not know marked, and says why in the log', async () => {
    const c = aCloud(dir);
    c.places.clear();
    expect(await c.run()).toBe(0);
    expect(c.home).toEqual([]);
    expect(c.logs.join('\n')).toMatch(/does not know where/);
  });

  it('brings home nothing for a picture, which nobody edits on its page', async () => {
    const home: unknown[] = [];
    const wrote = await bringLinkEditsHome({
      backend: {
        linksChangedOnWeb: async () => [{ token: 't', source: SOURCE, name: 'a.png', rev: 2, hash: 'x', version: 1, byName: 'Theo' }],
        fileLinkView: async () => ({ stopped: false, file: { kind: 'image', body: 'AAAA', rev: 2 } }),
        fileLinkBroughtHome: async (...a) => { home.push(a); },
      },
      placeOf: () => ({ path: path.join(dir, 'a.png') }), setPlace: () => {}, note: () => {},
    });
    expect(wrote).toBe(0);
    expect(home).toEqual([]);
  });
});

describe('through the team service', () => {
  it('the share panel asking about an edited link brings the edit home first, and then the link is current', async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    const mayaId = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
    const theoId = signUpMemory(cloud, { email: 'theo@lumen.test', name: 'Theo' });
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-edits-mac-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const maya = createTeamService({
      session: memorySession(() => memoryBackend(cloud, mayaId)),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      shareSite: 'https://app.agentbox.ac',
    });
    await maya.signIn();
    const dir = aFolder();
    const first = path.join(dir, 'plan-v2.md');
    maya.rememberLinkPlace(SOURCE, first);
    const shared = (await maya.shareFile({ source: SOURCE, name: 'plan-v2.md', kind: 'markdown', type: 'text/markdown', body: '# Plan two', version: 2, hash: linkHash('# Plan two') })).link!;
    expect(shared).toMatchObject({ access: 'anyone', can: 'comment', changedOnWeb: false });

    await maya.setFileLinkAccess(shared.token, 'anyone', 'edit');
    await memoryBackend(cloud, theoId).editFileLink!(shared.token, '# Plan two\n\nTheo adds a line', shared.rev);

    const seen = (await maya.fileLink(SOURCE, linkHash('# Plan two'), 2)).link!;
    expect(fs.readFileSync(path.join(dir, 'plan-v3.md'), 'utf8')).toBe('# Plan two\n\nTheo adds a line');
    expect(seen).toMatchObject({ changedOnWeb: false, version: 3 });
  });

  it('an edit the computer cannot bring home is never offered as behind, so Update link cannot go over it', async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    const mayaId = signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' });
    const theoId = signUpMemory(cloud, { email: 'theo@lumen.test', name: 'Theo' });
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-edits-mac-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const maya = createTeamService({
      session: memorySession(() => memoryBackend(cloud, mayaId)),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      shareSite: 'https://app.agentbox.ac',
    });
    await maya.signIn();
    const shared = (await maya.shareFile({ source: SOURCE, name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 1, hash: linkHash('# Plan') })).link!;
    await maya.setFileLinkAccess(shared.token, 'anyone', 'edit');
    await memoryBackend(cloud, theoId).editFileLink!(shared.token, 'Theo', shared.rev);
    const seen = (await maya.fileLink(SOURCE, linkHash('# Plan'), 1)).link!;
    expect(seen).toMatchObject({ changedOnWeb: true, changedByName: 'Theo', current: false, ahead: true });
  });
});
