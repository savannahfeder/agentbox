// A SHARED THREAD'S FILE OVER 10 MB OPENS WHOLE, AND A FILE ITS AGENT LINKS COMES
// FROM ANY PROJECT OF THE OWNER'S.
//
// A thread's agent made launch-cut-v2.mp4 and "the viewer says
// 'could not be found', no player" for the two people on the thread; and a cut of
// 10.6 MB stayed on its owner's computer with a grey line "too big to copy" in the
// message's own words. Measured: a thread's file was copied only from the
// thread's own project and only up to 10 MB.
//
// Now a file linked in a thread's message goes from any project the owner has
// (a bare word still only from the thread's own), and a file up to 200 MB goes in
// parts through the same thread file calls, is put back together on the reader's
// computer and checked, and says how far it has come while it does.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { resolveArtifact } from '../main/artifact-path.mts';

const MB = 1024 * 1024;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function aMac(cloud, personId, { wrap = (b) => b } = {}) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-files-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const [id, name] of [['website', 'Website'], ['private', 'Private']]) {
    fs.mkdirSync(path.join(accountRoot, id), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, name, ...(id === 'website' ? { seenBy: 'team' } : {}) }));
  }
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => wrap(memoryBackend(cloud, personId))),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, accountRoot, storeRoot, dir: path.join(accountRoot, 'website'), privateDir: path.join(accountRoot, 'private') };
}

let cloud, maya, theo, gate;
beforeEach(async () => {
  disk._internals.forgetFolds();
  gate = { after: Infinity, open: null, gets: 0 };
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }), {
    wrap: (b) => ({ ...b, personId: b.personId, getThreadFile: async (...a) => { if (gate.gets >= gate.after) await gate.open; gate.gets += 1; return b.getThreadFile(...a); } }),
  });
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => { for (const m of [maya, theo]) await m.service.signOut(); });

const write = (dir, rel, bytes) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
const lead = (words) => maya.store.composeItem('website', { title: words, body: words, visibility: 'team' });
const answered = (id, result) => maya.store.recordSessionResult('website', id, { result });
const sync = async (n = 1) => { for (let i = 0; i < n; i += 1) { await maya.service.syncNow(); await theo.service.syncNow(); } };
const readerOpens = (item, name) => resolveArtifact({
  src: `attachments/${name}`, product: theo.service.threadWork(maya.personId, item.id).product,
  products: [...theo.store.listProducts(), ...theo.service.sharedThreadProducts()], accountRoot: theo.accountRoot, storeRoot: theo.storeRoot,
});
const linkedName = (item) => {
  const said = theo.service.threadWork(maya.personId, item.id).lines.map((l) => l.patch.result ?? '').join('\n');
  return said.match(/attachments\/([\w.-]+)/)?.[1];
};
const until = async (ok, tries = 40) => { for (let i = 0; i < tries; i += 1) { await sync(); if (await ok()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

describe('a file linked from any project of the owner', () => {
  it('goes to the thread when a link names it, wherever it is kept', async () => {
    write(maya.privateDir, 'cuts/launch-cut-v2.mp4', 'film');
    const item = lead('Cut 2');
    answered(item.id, 'Cut 2: [launch-cut-v2.mp4](cuts/launch-cut-v2.mp4)');
    await sync(2);
    const name = linkedName(item);
    expect(name).toMatch(/-launch-cut-v2\.mp4$/);
    expect((await readerOpens(item, name)).ok).toBe(true);
  });

  it('does not guess a bare word into another project', async () => {
    write(maya.privateDir, 'cuts/salaries.md', 'pay');
    const item = lead('Pay');
    answered(item.id, 'see salaries.md');
    await sync(2);
    expect([...cloud.threadFiles.values()]).toEqual([]);
  });

  it('never sends a secret-looking name, even when linked', async () => {
    write(maya.privateDir, 'notes/api-keys.md', 'k');
    write(maya.privateDir, 'secrets/plan.md', 'p');
    const item = lead('Keys');
    answered(item.id, '[k](notes/api-keys.md) [p](secrets/plan.md)');
    await sync(2);
    expect([...cloud.threadFiles.values()]).toEqual([]);
  });

  it('never sends a file from outside every project, or through a link out', async () => {
    const outside = path.join(os.tmpdir(), `thread-outside-${process.pid}.md`);
    fs.writeFileSync(outside, 'outside');
    fs.mkdirSync(path.join(maya.privateDir, 'docs'), { recursive: true });
    fs.symlinkSync(outside, path.join(maya.privateDir, 'docs', 'looks-fine.md'));
    const item = lead('Outside');
    answered(item.id, `[o](${outside}) [l](docs/looks-fine.md)`);
    await sync(2);
    expect([...cloud.threadFiles.values()]).toEqual([]);
    fs.rmSync(outside);
  });
});

describe('a file over 10 MB', () => {
  it('opens whole for the reader, byte for byte, with every part under the 10 MB check', async () => {
    const film = crypto.randomBytes(20 * MB + 77);
    write(maya.dir, 'cuts/launch-cut-v2.mp4', film);
    const item = lead('Cut 2');
    answered(item.id, 'Cut 2: [launch-cut-v2.mp4](cuts/launch-cut-v2.mp4)');
    expect(await until(async () => { const n = linkedName(item); return !!n && (await readerOpens(item, n)).ok; })).toBe(true);
    const there = await readerOpens(item, linkedName(item));
    expect(sha(fs.readFileSync(there.path))).toBe(sha(film));
    const parts = [...cloud.threadFiles.values()];
    expect(parts.length).toBe(3);
    for (const f of parts) {
      expect(f.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
      expect(f.data.length).toBeLessThanOrEqual(14_000_000);
    }
    expect(fs.existsSync(path.join(path.dirname(path.dirname(there.path)), '.parts', linkedName(item)))).toBe(false);
  });

  it('says on its way, and how far, until the last part is here', async () => {
    write(maya.dir, 'cuts/c.mp4', crypto.randomBytes(34 * MB));
    const item = lead('Cut');
    answered(item.id, '[c](cuts/c.mp4)');
    let release;
    gate.open = new Promise((r) => { release = r; });
    gate.after = 2;
    await maya.service.syncNow();
    await maya.service.syncNow();
    // The reader's pass is held at the third part, as a slow connection holds it.
    const holding = theo.service.syncNow();
    await new Promise((r) => setTimeout(r, 300));
    const name = linkedName(item);
    const waiting = await readerOpens(item, name);
    expect(waiting.ok).toBe(false);
    expect(waiting.coming).toBe(true);
    expect(waiting.carry).toMatchObject({ state: 'coming', done: 2, total: 5 });
    gate.after = Infinity;
    release();
    await holding;
    expect(await until(async () => (await readerOpens(item, name)).ok)).toBe(true);
  });

  it('says it did not arrive whole, and keeps nothing, when the parts do not make the file named', async () => {
    write(maya.dir, 'cuts/c.mp4', crypto.randomBytes(12 * MB));
    const item = lead('Cut');
    answered(item.id, '[c](cuts/c.mp4)');
    gate.after = 0;
    gate.open = new Promise(() => {});
    await maya.service.syncNow();
    await new Promise((r) => setTimeout(r, 100));
    for (const f of cloud.threadFiles.values()) if (/p2of2$/.test(f.name)) f.data = Buffer.from('not the film').toString('base64');
    gate.after = Infinity;
    await sync(8);
    const name = linkedName(item);
    expect((await readerOpens(item, name)).ok).toBe(false);
    expect(fs.existsSync(path.join(theo.service.threadWork(maya.personId, item.id).dir, 'attachments', name))).toBe(false);
  });

  it('never lets a forged list name more than 200 MB, or a part that leaves the folder', async () => {
    const item = lead('Forged');
    answered(item.id, 'nothing');
    await sync(2);
    const asMaya = memoryBackend(cloud, maya.personId);
    const work = (big) => ({ lines: [], earlier: 0, files: ['abcabcabcabc-x.mp4'], big });
    const folder = theo.service.threadWork(maya.personId, item.id).dir;
    const kept = () => JSON.parse(fs.readFileSync(path.join(folder, 'thread.json'), 'utf8'));
    const forged = [
      [{ name: 'abcabcabcabc-x.mp4', size: 300 * MB, parts: ['abcabcabcabc-x.mp4.p1of1'] }],
      [{ name: 'abcabcabcabc-x.mp4', size: 12 * MB, parts: ['../../evil', 'abcabcabcabc-x.mp4.p2of2'] }],
      [{ name: 'other-name.mp4', size: 12 * MB, parts: ['a.p1of2', 'a.p2of2'] }],
    ];
    for (const [i, big] of forged.entries()) {
      await asMaya.putThreadWork(maya.service.state().team.id, { threadId: item.id, hash: `forged-${i}`, work: work(big) });
      await theo.service.syncNow();
      expect(kept().big ?? []).toEqual([]);
    }
    expect(fs.existsSync(path.join(folder, '..', '..', 'evil'))).toBe(false);
  });
});
