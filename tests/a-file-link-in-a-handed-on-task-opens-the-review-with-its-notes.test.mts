// A FILE LINK IN A HANDED-ON TASK OPENS THE REVIEW WITH ITS NOTES (2026-11-11).
//
// Two testers on one team, twice: "Report link in handoff opens document
// without shared review notes." Measured through two copies of the app over
// the memory cloud: the task a hand-off makes carries the report as a copy in
// the receiver's conversation, and Files does find the notes made on the
// thread for that copy. But a document pressed in a task opened beside the
// chat, and the pane beside the chat draws no notes. In a conversation or a
// task a teammate gave you, a file now opens in the review, as a chat
// attachment does, where its notes, numbers and version line come from Files.
//
// What must NOT change: a document in your own thread still opens beside the
// chat, and a web address is still not a file the review reads.
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
import { filesInLines, threadFiles } from '../shared/artifact-marks.mts';
import { whereAFileOpens } from '../renderer/src/artifact-layout.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'task-file-'));
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

let cloud, theo, lena;
const sync = async () => { for (let i = 0; i < 3; i += 1) for (const m of [theo, lena]) await m.service.syncNow(); };
const note = (id, text) => ({ do: 'note', id, file: 'csv-report.md', place: { kind: 'whole' }, text });

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
});
afterEach(async () => { for (const m of [theo, lena]) await m.service.signOut(); });

describe("the report in a hand-off task, on the receiver's computer", () => {
  it('has the notes Files shows for it', async () => {
    fs.writeFileSync(path.join(theo.dir, 'documents', 'csv-report.md'), '# Why rows go missing\n');
    const t = await theo.on(() => theo.store.composeItem('website', { title: 'CSV import', body: 'Find out why rows go missing.', visibility: 'team' }));
    await theo.on(() => theo.store.recordSessionResult('website', t.id, { result: 'The report: [csv-report.md](documents/csv-report.md)' }));
    await theo.on(() => theo.store.fileMark('website', t.id, note('n-theo', 'Check the quoted newline case')));
    await sync();
    const key = (await lena.place.list()).files[0].key;
    await lena.on(() => lena.place.mark(key, note('n-lena', 'Which file did this break on?')));
    await sync();
    await theo.on(() => theo.service.handOn({ product: 'website', id: t.id, to: lena.personId }));
    await sync();

    const task = lena.store.listAllWorkItems().find((i) => i.product !== 'website' && i.title === 'CSV import');
    expect(lena.store.listProducts().find((p) => p.slug === task.product).team.direct).toBe(true);
    const lines = lena.store.readHistory(task.product, task.id, { max: Number.MAX_SAFE_INTEGER });
    const copies = threadFiles(filesInLines(lines)).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id })));
    expect(copies).toHaveLength(1);
    const [elsewhere] = await lena.place.sameFiles({ product: task.product, id: task.id, copies });
    const files = await lena.place.open(key);
    expect(elsewhere.key).toBe(key);
    expect(elsewhere.notes.map((n) => n.id).sort()).toEqual(files.marks.notes.map((n) => n.id).sort());
    expect(elsewhere.notes.map((n) => n.id).sort()).toEqual(['n-lena', 'n-theo']);
  });
});

describe('where a file pressed in a conversation or a given task opens', () => {
  it('in the review, for a document, a table and a script as well as a picture', () => {
    for (const f of ['attachments/mvwy0003-cccc-csv-report.md', 'leads.csv', 'cart.mjs', 'shot.png', 'brief.pdf']) {
      expect(whereAFileOpens(f, { conversation: true }), f).toBe('full');
    }
  });

  it('a document in your own thread still opens beside the chat', () => {
    expect(whereAFileOpens('csv-report.md')).toBe('beside');
    expect(whereAFileOpens('csv-report.md', { conversation: false })).toBe('beside');
  });

  it('a web address is still not a file the review reads', () => {
    expect(whereAFileOpens('https://example.com/report.md', { conversation: true })).toBeNull();
  });

  it('the thread page asks with whether it is a conversation', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toContain("whereAFileOpens(path, { conversation: direct }) === 'full'");
    expect(focus).toContain("whereAFileOpens(path, { conversation: direct }) === 'beside'");
  });
});
