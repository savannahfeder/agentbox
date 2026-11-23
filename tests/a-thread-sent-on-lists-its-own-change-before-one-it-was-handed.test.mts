// A thread carried on from a hand-over was sent for review with the handed-over change ahead of its own, and
// "View the change" opens the first: a tester reviewed +16 of old code while the thread had +18.
import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { machineryPath } from '../main/store/home.mts';
import { changePath } from '../main/code-change.mts';

async function aMac(cloud, personId, repoPath = null) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-carries-own-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team', ...(repoPath ? { repoPath } : {}) }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread: vi.fn() });
  return { personId, store, service, dir: path.join(accountRoot, 'api') };
}

let cloud, sam, priya, repo;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-carries-repo-'));
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), repo);
  priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@cf.test', name: 'Priya Shah' }));
  await sam.service.signIn();
  await sam.service.createTeam('Clinicflow');
  await sam.service.invite('priya@cf.test');
  await priya.service.signIn();
  await priya.service.acceptInvite(sam.service.state().team.id);
  disk.setLineAuthor(sam.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await sam.service.signOut(); await priya.service.signOut(); });

const both = async () => { for (let k = 0; k < 3; k += 1) { await sam.service.syncNow(); await priya.service.syncNow(); } };
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const checkout = (id, rel) => path.join(repo, '.claude', 'worktrees', id, rel);
const theTask = () => priya.store.listItems().find((i) => i.title === 'Payment amount in cents or decimals');
const linked = (body) => [...body.matchAll(/\]\((attachments\/[^)\s]+)\)/g)].map((m) => m[1]);
const carried = (task, rel) => fs.readFileSync(path.join(priya.store.listProducts().find((p) => p.slug === task.product).dir, rel), 'utf8');

function aThread(result) {
  const t = sam.store.composeItem('api', { title: 'Payment amount in cents or decimals', body: 'Write the error messages for a bad amount.' });
  sam.store.recordSessionResult('api', t.id, { result: result(t.id) });
  return t;
}
function withAChange(id) {
  const file = machineryPath(sam.dir, changePath(id));
  write(file, JSON.stringify({ item: id, files: [{ path: 'src/amount.ts', hunks: [{ rows: [['+', 'export const cents = true;']], plus: 1, minus: 0 }], plus: 1, minus: 0 }], plus: 1, minus: 0 }));
}

// The change this thread was handed when it was carried on, as it sits in the project.
const HANDED = 'attachments/mwold1-aaaaaa-Health-endpoint-change.change';
function carriedOn({ doc = false } = {}) {
  write(path.join(sam.dir, HANDED), JSON.stringify({ item: 'w-handed', files: [], plus: 16, minus: 1 }));
  const t = sam.store.composeItem('api', { title: 'Payment amount in cents or decimals', body: `Carry on from [Health-endpoint-change.change](${HANDED}).` });
  sam.store.recordSessionResult('api', t.id, { result: doc ? 'Wrote [amount-errors.md](amount-errors.md).' : 'Added the version.' });
  if (doc) write(checkout(t.id, 'amount-errors.md'), 'For developers only.\n');
  return t;
}
const plusOf = (rel) => JSON.parse(carried(theTask(), rel)).plus;
const send = {
  review: (id) => sam.service.askTeammate({ product: 'api', id, to: priya.personId, kind: 'review', note: 'The version.' }),
  help: (id) => sam.service.askTeammate({ product: 'api', id, to: priya.personId, kind: 'help', note: 'Is the version right?' }),
};

describe.each(['review', 'help'])('a thread carried on from a hand-over, sent on as a %s', (how) => {
  it('lists its own change before the one it was handed', async () => {
    const t = carriedOn();
    withAChange(t.id);
    await sam.service.syncNow();
    await send[how](t.id);
    await both();
    const changes = linked(theTask().body).filter((f) => f.endsWith('.change'));
    expect(changes.map(plusOf)).toEqual([1, 16]);
  });

  it('still lists a doc the agent wrote ahead of both', async () => {
    const t = carriedOn({ doc: true });
    withAChange(t.id);
    await sam.service.syncNow();
    await send[how](t.id);
    await both();
    const files = linked(theTask().body);
    expect(files.map((f) => f.split('.').pop())).toEqual(['md', 'change', 'change']);
    expect(files.slice(1).map(plusOf)).toEqual([1, 16]);
  });

  it('with no change of its own, carries the one it was handed', async () => {
    const t = carriedOn();
    await sam.service.syncNow();
    await send[how](t.id);
    await both();
    expect(linked(theTask().body).map(plusOf)).toEqual([16]);
  });
});

// Its words go too, with the link to the handed change where they name it; its own comes at the foot.
it('handed over again, it carries its own change at the foot, once', async () => {
  const t = carriedOn();
  withAChange(t.id);
  await sam.service.syncNow();
  await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
  await both();
  expect(linked(theTask().body).map(plusOf)).toEqual([16, 1]);
});
