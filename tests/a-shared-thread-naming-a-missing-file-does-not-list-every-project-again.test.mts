// A shared thread naming a missing file does not list every project again.
//
// 2026-11-23: with the Files and phone fixes loaded, the app's own CPU record
// still put listing folders on top, at 13 to 18% of the main thread's busy
// time, with the four disk threads busy beside it. The folders themselves were
// quiet: 2 of the 72 watched ones changed in 45 seconds. What listed them was
// the publisher of shared threads. It looks at every shared thread again each
// minute (419 on that Mac), and a file a thread points at that its own project
// does not have was searched for in every project, each one's folders listed
// afresh as they are for a person who has just sent a message. Seven such
// names there, 8,879 folder reads each across 39 projects: about 62,000 folder
// reads a minute for files that are not there.
//
// 2026-11-24: main went red here once a bare name was also looked for in each
// project's attachments folder. A path never reaches that folder, so a bare
// name after a path lists it once per project (3 reads), then never again: 0 a
// minute and 11 minutes later, measured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { findFileToSend } from '../main/team/carry-files.mts';
import { stopWatchingFolders } from '../main/artifact-path.mts';

const PROJECTS = ['website', 'handbook', 'archive'];
let clock = 0;

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'missing-file-')));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const slug of PROJECTS) {
    // Folders a list has to read, so a list made again is counted.
    for (const sub of ['docs/old', 'designs/round-1', 'notes']) fs.mkdirSync(path.join(accountRoot, slug, sub), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, slug, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug, seenBy: 'team' }));
  }
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, now: () => clock,
  });
  return { personId, store, service, accountRoot };
}
type Mac = Awaited<ReturnType<typeof aMac>>;

const write = (mac: Mac, project: string, rel: string, body: string) => {
  const file = path.join(mac.accountRoot, project, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
};
const asks = (mac: Mac, words: string, answer: string) => {
  const item = mac.store.composeItem('website', { title: words, body: words, visibility: 'team' });
  mac.store.recordSessionResult('website', item.id, { result: answer });
  return item;
};
const lastWords = (mac: Mac, owner: string, id: string): string =>
  mac.service.threadWork(owner, id).lines.flatMap((l) => [l.patch?.result]).filter(Boolean).at(-1) as string;

// Every list made of a folder inside a project, while `fn` runs.
const folderReads = async (mac: Mac, fn: () => Promise<unknown>) => {
  const real = fs.promises.readdir.bind(fs.promises) as (p: fs.PathLike, o?: unknown) => Promise<unknown>;
  let reads = 0;
  const spy = vi.spyOn(fs.promises, 'readdir').mockImplementation(((p: fs.PathLike, o?: unknown) => {
    if (PROJECTS.some((slug) => `${String(p)}${path.sep}`.startsWith(path.join(mac.accountRoot, slug) + path.sep))) reads += 1;
    return real(p, o);
  }) as typeof fs.promises.readdir);
  try { await fn(); } finally { spy.mockRestore(); }
  return reads;
};

let cloud: ReturnType<typeof createMemoryCloud>;
let maya: Mac;
let theo: Mac;
beforeEach(async () => {
  disk._internals.forgetFolds();
  stopWatchingFolders();
  clock = Date.now();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(maya.service.state().team!.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const m of [maya, theo]) await m.service.signOut();
  stopWatchingFolders();
});

describe('a shared thread that points at a file no project has', () => {
  it('lists no project folder again on its next look at the thread', async () => {
    asks(maya, 'Where is the plan?', 'It is in [the plan](plans/launch-plan.md).');
    // The first look has to list them: the file could be in any project.
    expect(await folderReads(maya, () => maya.service.syncNow())).toBeGreaterThan(0);
    clock += 61_000;
    expect(await folderReads(maya, () => maya.service.syncNow())).toBe(0);
  });

  it('lists none again for a second thread naming another file that is not there', async () => {
    asks(maya, 'Where is the plan?', 'It is in `launch-plan.md`.');
    await maya.service.syncNow();
    asks(maya, 'And the budget?', 'It is in `budget-2027.csv`.');
    expect(await folderReads(maya, () => maya.service.syncNow())).toBe(0);
  });

  it('lists each project\'s attachments once for a bare name after a path, then never again', async () => {
    asks(maya, 'Where is the plan?', 'It is in [the plan](plans/launch-plan.md).');
    await maya.service.syncNow();
    asks(maya, 'And the budget?', 'It is in `budget-2027.csv`.');
    expect(await folderReads(maya, () => maya.service.syncNow())).toBe(PROJECTS.length);
    asks(maya, 'And the notes?', 'It is in `notes-2027.csv`.');
    clock += 61_000;
    expect(await folderReads(maya, () => maya.service.syncNow())).toBe(0);
  });
});

describe('a file the thread points at that another project has', () => {
  it('is still found there and sent, wherever in that project it sits', async () => {
    write(maya, 'handbook', 'guides/2026/launch-plan.md', '# The plan');
    const item = asks(maya, 'Where is the plan?', 'It is `launch-plan.md`.');
    await maya.service.syncNow();
    await theo.service.syncNow();
    expect(lastWords(theo, maya.personId, item.id)).toMatch(/\(attachments\/[\w.-]+-launch-plan\.md\)/);
  });

  it('is found on a later look when it was written after the first one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const item = asks(maya, 'Where is the plan?', 'It is `launch-plan.md`.');
    await maya.service.syncNow();
    await theo.service.syncNow();
    expect(lastWords(theo, maya.personId, item.id)).not.toContain('attachments/');

    write(maya, 'handbook', 'guides/2026/launch-plan.md', '# The plan');
    // Past how long any folder's list is kept, whatever a folder watch saw.
    vi.setSystemTime(Date.now() + 11 * 60_000);
    clock += 11 * 60_000;
    await maya.service.syncNow();
    await theo.service.syncNow();
    expect(lastWords(theo, maya.personId, item.id)).toMatch(/\(attachments\/[\w.-]+-launch-plan\.md\)/);
  });
});

describe('a person sending a message that names a file', () => {
  it('still finds one written a moment ago, with no wait', async () => {
    const products = maya.store.listProducts({ includeArchived: true });
    expect(await findFileToSend({ ref: 'launch-plan.md', meant: true, products })).toEqual({ none: 'missing' });
    const file = write(maya, 'handbook', 'guides/2026/launch-plan.md', '# The plan');
    expect(await findFileToSend({ ref: 'launch-plan.md', meant: true, products })).toMatchObject({ file });
  });
});
