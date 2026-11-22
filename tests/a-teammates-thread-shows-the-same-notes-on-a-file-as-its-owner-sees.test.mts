// A TEAMMATE'S THREAD SHOWS THE SAME NOTES ON A FILE AS ITS OWNER SEES (2026-11-11).
//
// Two testers on one team, twice: from Needs you, "Lena seeing Notes 1 while I
// see both notes" on a revised spec. Measured through two copies of the app over
// the memory cloud: the owner's thread view adds what Files holds for the file
// (here, Lena's note on the copy in their conversation), but a teammate's
// thread view drew only the marks its owner's copy published, and Files could
// not be asked about a teammate's thread's copies at all. Now the teammate's
// view asks Files the same way, for the notes made elsewhere and for the
// numbers on the file's version line.
//
// What must NOT happen: a note is counted twice because two versions of the
// file are on the thread and each copy answers with all of the file's notes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { filesInLines, lineAsThread, marksOf, marksOnVersions, otherFilesInLines, threadFiles } from '../shared/artifact-marks.mts';
import { withElsewhere } from '../renderer/src/components/ThreadArtifacts.tsx';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'same-notes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website', 'documents'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, place, on, dir: path.join(accountRoot, 'website') };
}

let cloud, theo, lena, thread;
const sync = async () => {
  for (let i = 0; i < 3; i += 1) for (const m of [theo, lena]) await m.service.syncNow();
  for (const m of [theo, lena]) { await m.place.list(); await m.place.crossing(); }
};
const doc = (name) => path.join(theo.dir, 'documents', name);
const note = (id, file, text) => ({ do: 'note', id, file, place: { kind: 'whole' }, text });

/** What a door's big view shows: the thread's own marks with Files' for its copies, each on its version's number. */
async function seenThrough(place, ask, lines, own) {
  const copies = threadFiles([...filesInLines(lines), ...otherFilesInLines(lines)]).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id })));
  const elsewhere = await place.sameFiles({ ...ask, copies });
  const numbered = lineAsThread(await place.lineFor(ask));
  const families = threadFiles(filesInLines([...lines, ...numbered.lines]), numbered.numbers);
  const marks = marksOnVersions(withElsewhere(own, elsewhere), families);
  const versions = families.flatMap((f) => f.versions);
  return marks.notes.map((n) => [n.id, versions.find((v) => v.id === n.file)?.n]).sort();
}
const ownerSees = () => seenThrough(theo.place, { product: 'website', id: thread.id },
  theo.store.readHistory('website', thread.id, { max: Number.MAX_SAFE_INTEGER }), theo.store.readItem('website', thread.id).artifacts);
const teammateSees = () => {
  const work = lena.service.threadWork(theo.personId, thread.id);
  const own = marksOf(work.lines.filter((l) => l.patch?.artifact).map((l) => ({ ...l.patch.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null })));
  return seenThrough(lena.place, { product: work.product, id: thread.id }, work.lines, own);
};
const filesSees = async (mac) => {
  const key = (await mac.place.list()).files[0].key;
  const view = await mac.place.open(key);
  return view.marks.notes.map((n) => [n.id, view.versions.find((v) => v.id === n.file)?.n]).sort();
};

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

  // Theo's agent writes the spec and revises it; he sends the revision to Lena, who notes it in their conversation.
  fs.writeFileSync(doc('spec.md'), '# Spec\n');
  thread = await theo.on(() => theo.store.composeItem('website', { title: 'Spec', body: 'Write the spec', visibility: 'team' }));
  await theo.on(() => disk.updateWorkItem(theo.dir, thread.id, { note: 'The spec: [spec.md](documents/spec.md)' }, { source: 'agent' }));
  fs.writeFileSync(doc('spec-v2.md'), '# Spec\n\nRevised.\n');
  await theo.on(() => disk.updateWorkItem(theo.dir, thread.id, { note: 'Revised: [spec-v2.md](documents/spec-v2.md)' }, { source: 'agent' }));
  await theo.on(() => theo.store.fileMark('website', thread.id, note('n-theo', 'spec-v2.md', 'Lena, is the limit right?')));
  await sync();
  await theo.on(() => theo.service.message(lena.personId, 'The revised spec', undefined, [{ name: 'spec-v2.md', srcPath: doc('spec-v2.md') }]));
  await sync();
  const chat = lena.store.listProducts().find((p) => p.team?.direct);
  const convo = lena.store.listAllWorkItems().find((i) => i.product === chat.slug);
  await lena.on(() => lena.store.fileMark(chat.slug, convo.id, note('n-lena', 'spec-v2.md', 'The limit should be 50')));
  await sync();
});
afterEach(async () => { for (const m of [theo, lena]) await m.service.signOut(); });

describe('the revised spec, opened from each side', () => {
  it("the owner's thread shows both notes on v2", async () => {
    expect(await ownerSees()).toEqual([['n-lena', 2], ['n-theo', 2]]);
  });

  it("the teammate's view of that thread shows the same two, on the same version", async () => {
    expect(await teammateSees()).toEqual(await ownerSees());
  });

  it('Files on each computer shows the same two', async () => {
    expect(await filesSees(theo)).toEqual([['n-lena', 2], ['n-theo', 2]]);
    expect(await filesSees(lena)).toEqual([['n-lena', 2], ['n-theo', 2]]);
  });
});

describe('what must not happen', () => {
  it('a note made elsewhere is counted once, though both versions on the thread answer with it', () => {
    const n = { id: 'n-x', file: 'spec.md', place: { kind: 'whole' }, text: 'x', by: 'u', ts: 1, mentions: [], owner: null, uid: null };
    const merged = withElsewhere({ notes: [], approvals: [], seen: {} }, [
      { key: 'k', notes: [{ ...n, key: 'k' }], approvals: [] },
      { key: 'k', notes: [{ ...n, key: 'k' }], approvals: [] },
    ]);
    expect(merged.notes.map((x) => x.id)).toEqual(['n-x']);
  });
});

describe("the teammate's thread view", () => {
  it('asks Files for the notes and the numbers of its copies', () => {
    const view = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(view).toContain('api.fileElsewhere({ product, id: threadId, copies })');
    expect(view).toContain('api.fileLine({ product, id: threadId })');
    expect(view).toContain('withElsewhere(own, elsewhere)');
    expect(view).toContain('numbers={numbered.numbers}');
  });
});
