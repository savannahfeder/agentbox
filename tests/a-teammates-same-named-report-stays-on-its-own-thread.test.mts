// A TEAMMATE'S SAME-NAMED REPORT STAYS ON ITS OWN THREAD (2026-11-22).
//
// In a teammate's thread, the Files list's report.md opened a different
// thread's report.md in full view ("v22 of 4", "Show v23"), and Exit Focus put
// a third one beside the chat. Measured through three copies of the app over
// the memory cloud, each thread in one team project writing its own report.md:
// Files folds every report.md of a project into one file, and two threads that
// both call their first version `report.md` share one version there, which
// holds the bytes of whichever copy is found first. While the second thread's
// copy was still coming down, lineFor tied its path to that version, so the
// view numbered it as the other thread's report and the other thread's notes
// sat on it. A copy that is not here is now that version only when the hash in
// its copied name agrees with the version's bytes.
//
// What must still match: a copy sent on purpose keeps its version and notes, a
// later version of the thread's own report is numbered by its bytes, and a
// project file whose own name starts with twelve hex characters is not read as
// a copy. A private thread's bytes are never what opens.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { appFilesPlace, versionOfMissingCopy } from '../main/files-place.mts';
import { resolveArtifact } from '../main/artifact-path.mts';
import { filesInLines, lineAsThread, threadFiles, whereAPressLands, withFilesAsked } from '../shared/artifact-marks.mts';
import { filesOnThread } from '../renderer/src/threads/teammate-thread.ts';

const ONBOARDING = '# Onboarding ONB-7f3\n';
const COLLAB = '# Collaboration COL-2a9\n';
const PHONE = '# Phone loop PHN-5c1\n';
const PHONE2 = '# Phone loop PHN-5c1\n\nRound two.\n';
const PRIVATE = '# Private PRV-9e4\n';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'same-named-report-'));
  roots.push(storeRoot);
  made.push(storeRoot);
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, place, on, accountRoot, storeRoot, dir: path.join(accountRoot, 'website') };
}

let cloud, theo, maya, lena, onboarding, collab, phone;
const roots: string[] = [];
const made: string[] = [];
const sync = async () => {
  for (let i = 0; i < 3; i += 1) for (const m of [theo, maya, lena]) await m.service.syncNow();
  for (const m of [theo, maya, lena]) { await m.place.list(); await m.place.crossing(); }
};

async function writes(mac, title, folder, bytes, { name = 'report.md', thread = null, visibility = 'team' } = {}) {
  fs.mkdirSync(path.join(mac.dir, 'reports', folder), { recursive: true });
  fs.writeFileSync(path.join(mac.dir, 'reports', folder, name), bytes);
  const t = thread ?? await mac.on(() => mac.store.composeItem('website', { title, body: title, visibility }));
  await mac.on(() => disk.updateWorkItem(mac.dir, t.id, { note: `Here: [${name}](reports/${folder}/${name})` }, { source: 'agent' }));
  return t;
}

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Ito' }));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  for (const m of [maya, lena]) {
    await theo.service.invite(cloud.people.get(m.personId).email);
    await m.service.signIn();
    await m.service.acceptInvite(theo.service.state().team.id);
  }
  // Two of Theo's threads and one of Maya's, all report.md in Website.
  onboarding = await writes(theo, 'Desktop onboarding', 'onboarding', ONBOARDING);
  await theo.on(() => theo.store.fileMark('website', onboarding.id, { do: 'note', id: 'n-onb', file: 'report.md', place: { kind: 'whole' }, text: 'Onboarding only' }));
  await sync();
  collab = await writes(maya, 'Desktop collaboration', 'collab', COLLAB);
  await sync();
  phone = await writes(theo, 'Phone loop', 'phone', PHONE);
  await sync();
}, 60_000);
afterEach(async () => {
  const out = await Promise.allSettled([theo, maya, lena].filter(Boolean).map((m) => m.service.signOut()));
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  theo = maya = lena = undefined;
  const failed = out.find((o): o is PromiseRejectedResult => o.status === 'rejected');
  if (failed) throw failed.reason;
});
// The version line saves its fingerprints 2 s after the last one (main/version-line.mts), which makes the root again.
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  for (const r of made.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

const workOf = (t) => lena.service.threadWork(t === collab ? maya.personId : theo.personId, t.id);
// Its copy here, and what Files keeps of its bytes, are gone: still coming down.
const notHereYet = (t) => {
  const dir = path.join(workOf(t).dir, 'attachments');
  for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n));
  fs.rmSync(path.join(lena.store.teammates.dir(), '.file-versions', 'version-bytes'), { recursive: true, force: true });
  cloud.threadFiles.clear();
  lena.place = appFilesPlace({ store: lena.store, team: lena.service, accountRoot: lena.accountRoot, storeRoot: lena.storeRoot });
};
const text = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const readable = () => [...lena.store.listProducts(), ...lena.service.sharedThreadProducts()];
// What the full view reads for a path, as zero:read-doc finds it.
const bytesAt = async (t, p) => {
  if (path.isAbsolute(p)) return text(p);
  const found = await resolveArtifact({ src: p, product: workOf(t).product, products: readable(), accountRoot: lena.accountRoot, storeRoot: lena.storeRoot });
  return found.ok ? text(found.path) : null;
};

/** The Files-list press on a teammate's thread, as TeammateThread hands it to ArtifactView once the line has come. */
async function pressFilesList(t) {
  const work = workOf(t);
  const src = filesOnThread(work.lines, [])[0].src;
  const line = await lena.place.lineFor({ product: work.product, id: t.id });
  const numbered = lineAsThread(line);
  const lines = [...work.lines, ...numbered.lines];
  const families = threadFiles(withFilesAsked(filesInLines(lines), [src]), numbered.numbers, { keep: [src] });
  const hit = whereAPressLands(families, { path: src });
  const family = families[hit.fi];
  const version = family.versions[hit.vi];
  const tied = line.flatMap((f) => f.versions).filter((v) => v.here.includes(src));
  const elsewhere = await lena.place.sameFile({ product: work.product, id: t.id, path: src, file: version.id });
  // Notes on other versions come too, each on its own version; only these sit on the one opened.
  return { src, version, family, tied, besidePath: family.versions.at(-1).path, notes: elsewhere.notes.filter((n) => n.file === version.id).map((n) => n.text) };
}

describe("the Files list's report.md on a teammate's second thread", () => {
  it('while its bytes are still coming, is tied to no other thread\'s version, bytes or notes', async () => {
    notHereYet(phone);
    const got = await pressFilesList(phone);
    expect(got.version.path).toBe(got.src);
    for (const v of got.tied) expect([null, PHONE]).toContain(text(v.path));
    expect(got.besidePath).toBe(got.src);
    expect(got.notes).not.toContain('Onboarding only');
  });

  it('with its bytes here, opens them and hands the same copy beside the chat', async () => {
    const got = await pressFilesList(phone);
    expect(await bytesAt(phone, got.version.path)).toBe(PHONE);
    expect(got.besidePath).toBe(got.src);
    expect(got.notes).not.toContain('Onboarding only');
  });

  it('is the same after the other threads are opened and it is opened again', async () => {
    notHereYet(phone);
    const first = await pressFilesList(phone);
    await pressFilesList(onboarding);
    await pressFilesList(collab);
    const again = await pressFilesList(phone);
    expect(again.version.path).toBe(first.src);
    for (const v of again.tied) expect([null, PHONE]).toContain(text(v.path));
    expect(again.notes).not.toContain('Onboarding only');
  });
});

describe('what must still match', () => {
  it("the first thread's own report keeps its version and its note", async () => {
    notHereYet(onboarding);
    const got = await pressFilesList(onboarding);
    expect(got.tied.map((v) => v.n)).toEqual([1]);
    const first = (await lena.place.lineFor({ product: workOf(onboarding).product, id: onboarding.id }))[0].versions[0];
    expect(first.here).toEqual([got.src]);
  });

  it('a later version of the thread\'s own report is numbered by its bytes, before and after they arrive', async () => {
    await writes(theo, '', 'phone', PHONE2, { name: 'report-v2.md', thread: phone });
    await sync();
    const here = await pressFilesList(phone);
    expect(await bytesAt(phone, here.version.path)).toBe(PHONE2);
    expect(here.tied).toHaveLength(1);
    notHereYet(phone);
    const coming = await pressFilesList(phone);
    expect(coming.tied.map((v) => v.n)).toEqual(here.tied.map((v) => v.n));
    expect(coming.version.n).toBe(here.version.n);
  });

  it('a copy Theo sent Lena of the onboarding report keeps its version and note', async () => {
    await theo.on(() => theo.service.message(lena.personId, 'Can you look?', undefined, [{ name: 'report.md', srcPath: path.join(theo.dir, 'reports', 'onboarding', 'report.md') }]));
    await sync();
    const chat = lena.store.listProducts().find((p) => p.team?.direct);
    const id = lena.store.listAllWorkItems().find((i) => i.product === chat.slug).id;
    const line = await lena.place.lineFor({ product: chat.slug, id });
    const sent = line[0].versions.filter((v) => v.here.length);
    expect(sent.map((v) => text(v.path))).toEqual([ONBOARDING]);
    const notes = (await lena.place.sameFile({ product: chat.slug, id, path: sent[0].here[0], file: 'report.md' })).notes.filter((n) => n.file === 'report.md').map((n) => n.text);
    expect(notes).toContain('Onboarding only');
  });

  it('a project file whose own name starts with twelve hex characters keeps its version once its bytes are gone', async () => {
    const own = await writes(theo, 'Hex-named notes', 'hex', '# HEX-1d2\n', { name: 'deadbeefcafe-notes.md' });
    const tiedOf = async () => (await theo.place.lineFor({ product: 'website', id: own.id }))[0].versions.filter((v) => v.here.length).map((v) => v.n);
    const before = await tiedOf();
    expect(before).toHaveLength(1);
    fs.rmSync(path.join(theo.dir, 'reports', 'hex', 'deadbeefcafe-notes.md'));
    theo.place = appFilesPlace({ store: theo.store, team: theo.service, accountRoot: theo.accountRoot, storeRoot: theo.storeRoot });
    expect(await tiedOf()).toEqual(before);
  });

  it("a private thread's report of the same name never opens in its place", async () => {
    await writes(theo, 'Private notes', 'private', PRIVATE, { visibility: 'private' });
    await sync();
    for (const pending of [false, true]) {
      if (pending) notHereYet(phone);
      const got = await pressFilesList(phone);
      expect(await bytesAt(phone, got.version.path)).not.toBe(PRIVATE);
      expect(await bytesAt(phone, got.besidePath)).not.toBe(PRIVATE);
      for (const v of (await lena.place.lineFor({ product: workOf(phone).product, id: phone.id })).flatMap((f) => f.versions)) expect(text(v.path)).not.toBe(PRIVATE);
    }
  });
});

describe('a copy whose bytes are not here, on invented versions', () => {
  const shared = { ref: { kind: 'shared', ownerId: 'p-theo', threadId: 'w-phone', product: 'shared-thread:p-theo:w-phone' }, title: 'Phone loop', project: 'Website', lines: [] };
  const own = { ref: { kind: 'thread', product: 'website', id: 'w-hex' }, title: 'Hex notes', project: 'Website', lines: [] };
  const copy = (thread, p) => ({ thread, path: p, at: 1 });
  const version = (n, hash, copies = []) => ({ id: `report.md@${n}`, name: 'report.md', n, at: n, by: null, copies, opened: null, hash });
  const PREFIX = 'a1759f581a82';
  const sent = copy(shared, `attachments/${PREFIX}-report.md`);

  it('is neither version when two start with the hash its name carries', () => {
    const chain = [version(1, `${PREFIX}${'0'.repeat(52)}`, [sent]), version(2, `${PREFIX}${'1'.repeat(52)}`)];
    expect(versionOfMissingCopy(chain, sent)).toBeNull();
  });

  it('is the one version that starts with that hash, whichever version names it', () => {
    const chain = [version(1, 'f'.repeat(64), [sent]), version(2, `${PREFIX}${'1'.repeat(52)}`)];
    expect(versionOfMissingCopy(chain, sent)?.n).toBe(2);
  });

  it('is no version when the one that names it holds other bytes', () => {
    expect(versionOfMissingCopy([version(1, 'f'.repeat(64), [sent])], sent)).toBeNull();
    expect(versionOfMissingCopy([version(1, undefined, [sent])], sent)?.n).toBe(1);
  });

  it("reads no hash in the name of a file of one's own thread", () => {
    const mine = copy(own, 'reports/hex/deadbeefcafe-notes.md');
    expect(versionOfMissingCopy([version(1, 'f'.repeat(64), [mine]), version(2, `deadbeefcafe${'0'.repeat(52)}`)], mine)?.n).toBe(1);
  });
});
