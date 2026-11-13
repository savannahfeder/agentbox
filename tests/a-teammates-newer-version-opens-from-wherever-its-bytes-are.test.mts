// A TEAMMATE'S NEWER VERSION OPENS FROM WHEREVER ITS BYTES ARE (2026-11-11).
//
// Three testers on one team, four times on two documents: opened from a
// message, the review said "v2 of 2" and then "request-id-review-v2.md: Not on
// this computer yet", while Files on the same computer opened that v2. Measured
// through two copies of the app over the memory cloud: the line a chat's view
// asks for (lineFor) was kept per state of the threads, so a version read while
// its copy was still coming down stayed "not here" after it landed, and lineFor
// never fetched what Files fetches. Now an opened version looks for its bytes in
// every teammate's thread on this computer by their hash, and fetches them from
// the cloud for a thread shared with you.
//
// What must NOT happen: a file of a thread not shared with you is never asked
// of the cloud.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { appFilesPlace } from '../main/files-place.mts';

const V1 = '# Request id review\n';
const V2 = '# Request id review\n\n## Safety review\n';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'newer-version-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website', 'documents'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const asked = [];
  const service = createTeamService({
    session: memorySession(() => {
      const backend = memoryBackend(cloud, personId);
      const get = backend.getThreadFile.bind(backend);
      backend.getThreadFile = (owner, threadId, name) => { asked.push({ owner, threadId, name }); return get(owner, threadId, name); };
      return backend;
    }),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  // A start of the app: what Files remembers of where each version's bytes were is read again from disk.
  const restarted = () => appFilesPlace({ store, team: service, accountRoot, storeRoot });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, place, restarted, on, asked, dir: path.join(accountRoot, 'website') };
}

let cloud, theo, lena, thread;
const sync = async () => {
  for (let i = 0; i < 3; i += 1) for (const m of [theo, lena]) await m.service.syncNow();
  for (const m of [theo, lena]) { await m.place.list(); await m.place.crossing(); }
};
const doc = (name) => path.join(theo.dir, 'documents', name);
const chatOf = (mac) => {
  const chat = mac.store.listProducts().find((p) => p.team?.direct);
  return { product: chat.slug, id: mac.store.listAllWorkItems().find((i) => i.product === chat.slug).id };
};
const textAt = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const v2Copy = () => {
  const dir = path.join(lena.service.threadWork(theo.personId, thread.id).dir, 'attachments');
  return path.join(dir, fs.readdirSync(dir).find((n) => n.endsWith('-request-id-review-v2.md')));
};
// Its copy in the teammate's thread folder, and the bytes Files keeps of every version it has seen.
const v2Leaves = () => {
  fs.rmSync(v2Copy());
  const hash = crypto.createHash('sha256').update(V2).digest('hex');
  fs.rmSync(path.join(lena.store.teammates.dir(), '.file-versions', 'version-bytes', hash), { recursive: true, force: true });
  lenaNow = lena.restarted();
};
let lenaNow;
const versions = async () => (await lenaNow.lineFor(chatOf(lena)))[0].versions;

async function theoWritesV2(visibility = 'team') {
  thread = await theo.on(() => theo.store.composeItem('website', { title: 'Request id review', body: 'Review it', visibility }));
  await theo.on(() => disk.updateWorkItem(theo.dir, thread.id, { note: 'Here: [request-id-review.md](documents/request-id-review.md)' }, { source: 'agent' }));
  await theo.on(() => theo.service.message(lena.personId, 'Can you look?', undefined, [{ name: 'request-id-review.md', srcPath: doc('request-id-review.md') }]));
  await sync();
  fs.writeFileSync(doc('request-id-review-v2.md'), V2);
  await theo.on(() => disk.updateWorkItem(theo.dir, thread.id, { note: 'Added the safety review: [request-id-review-v2.md](documents/request-id-review-v2.md)' }, { source: 'agent' }));
  await sync();
  lenaNow = lena.place;
}

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Ito' }));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('lena@nw.test');
  await lena.service.signIn();
  await lena.service.acceptInvite(theo.service.state().team.id);
  fs.writeFileSync(doc('request-id-review.md'), V1);
});
afterEach(async () => { for (const m of [theo, lena]) await m.service.signOut(); });

describe("v2, made on a teammate's thread, opened from the message that carried v1", () => {
  it("opens with v2's bytes when they are in that thread's copy here", async () => {
    await theoWritesV2();
    const got = await versions();
    expect(got.map((v) => v.n)).toEqual([1, 2]);
    expect(textAt(got[1].path)).toBe(V2);
  });

  it('opens once its copy has landed, though the view asked while it was still coming', async () => {
    await theoWritesV2();
    const copy = v2Copy();
    v2Leaves();
    cloud.threadFiles.clear();
    expect((await versions())[1].path).toBeNull();
    fs.writeFileSync(copy, V2);
    expect(textAt((await versions())[1].path)).toBe(V2);
  });

  it('is fetched from the cloud when its copy is not here yet, and then opens', async () => {
    await theoWritesV2();
    v2Leaves();
    expect(textAt((await versions())[1].path)).toBe(V2);
    const key = (await lenaNow.list()).files[0].key;
    const view = await lenaNow.open(key);
    const shown = /\]\(([^)]+)\)/.exec(String(view.lines[1].patch.note))[1];
    expect(textAt(shown)).toBe(V2);
  });

  it('with its bytes nowhere, is v2 of 2 that opens nothing, and v1 still opens', async () => {
    await theoWritesV2();
    v2Leaves();
    cloud.threadFiles.clear();
    const got = await versions();
    expect(got.map((v) => v.n)).toEqual([1, 2]);
    expect(got[1].path).toBeNull();
    expect(textAt(got[0].path)).toBe(V1);
  });
});

describe('what must not be fetched', () => {
  it('a file of a thread not shared with you is never asked for', async () => {
    await theoWritesV2('private');
    lena.asked.length = 0;
    const got = await versions();
    expect(got.every((v) => textAt(v.path) !== V2)).toBe(true);
    const key = (await lenaNow.list()).files[0].key;
    await lenaNow.open(key);
    expect(lena.asked.filter((a) => a.threadId === thread.id)).toEqual([]);
  });
});
