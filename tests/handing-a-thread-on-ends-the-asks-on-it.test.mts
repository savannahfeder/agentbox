// HANDING A THREAD ON ENDS THE ASKS ON IT (2026-11-21).
//
// Sam asked Theo to help on a thread, then handed the thread to Cal. The ask
// stayed open: Theo's next words on the thread reopened Sam's closed thread
// and ran Sam's agent, and Theo's hand-back came back to Sam's Needs you while
// Cal, who now held the work, heard nothing. Found by a code review of the
// shipped Ask or hand off; reproduced on the in-memory cloud with three
// computers. Now handing on closes the giver's open asks on that thread, and
// words or a hand-back that still arrive for a handed-on thread are left as
// they are, not told to its agent.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { createAsks } from '../main/team/asks.mts';

async function aMac(cloud, personId, tellThread) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-on-asks-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread });
  return { personId, store, service };
}

let cloud, sam, theo, cal, told;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud(); told = [];
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), (slug, id, o) => { told.push({ slug, id, ...o }); });
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }), vi.fn());
  cal = await aMac(cloud, signUpMemory(cloud, { email: 'cal@cf.test', name: 'Cal Reyes' }), vi.fn());
  await sam.service.signIn(); await sam.service.createTeam('Clinicflow');
  await sam.service.invite('theo@cf.test'); await sam.service.invite('cal@cf.test');
  await theo.service.signIn(); await theo.service.acceptInvite(sam.service.state().team.id);
  await cal.service.signIn(); await cal.service.acceptInvite(sam.service.state().team.id);
});
afterEach(async () => { disk.setLineAuthor(null); for (const m of [sam, theo, cal]) await m.service.signOut(); });

const all = async (n = 3) => { for (let k = 0; k < n; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); await cal.service.syncNow(); } };
const theosTask = () => theo.store.listItems().find((i) => i.ask);
async function askedThenHandedOn() {
  disk.setLineAuthor(sam.personId);
  const t = sam.store.composeItem('api', { title: 'Add an idempotency key', body: 'Add one.' });
  sam.store.recordSessionResult('api', t.id, { result: 'Should I drop the old unique index first?' });
  await all();
  await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'help', note: 'Is it safe?' });
  await all();
  await sam.service.handOn({ product: 'api', id: t.id, to: cal.personId });
  await all();
  return t;
}

it('closes the ask on the helper\'s side, saying who has the thread now', async () => {
  await askedThenHandedOn();
  const task = theosTask();
  expect(task.status).toBe('done');
  expect(task.answer).toContain('handed this thread to Cal Reyes');
});

it('neither runs the old owner\'s agent on the helper\'s words nor reopens the thread', async () => {
  const t = await askedThenHandedOn();
  disk.setLineAuthor(theo.personId);
  await theo.service.commentOnThread(sam.personId, t.id, 'Drop it.');
  await all();
  expect(told).toEqual([]);
  expect(sam.store.readItem('api', t.id).status).toBe('done');
});

it('a hand-back that reaches a thread already handed on is put away, not told to it', () => {
  const told2 = [], away = [];
  const rows = {
    '/team-dm': [{ id: 'k1', status: 'done', assignee: 'theo', createdBy: 'sam', labels: ['given-task'], answer: 'Done.', verdict: 'done',
      ask: { kind: 'help', owner: 'sam', thread: 't1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 1 }, status: { by: 'theo', ts: 5 } } }],
    '/api': [{ id: 't1', status: 'done', answer: 'Given to Cal Reyes.' }],
  };
  const asks = createAsks({
    file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'asks-kept-')), 'asks.json'),
    me: () => 'sam',
    products: () => [{ slug: 'dm', dir: '/team-dm', team: { direct: true } }, { slug: 'api', dir: '/api', team: null }],
    readRows: (dir) => rows[dir] ?? [],
    nameOf: (id) => id,
    tell: (slug, id, o) => { told2.push({ slug, id, ...o }); },
    putAway: (slug, id) => { away.push(`${slug}/${id}`); },
  });
  expect(asks.carryBack()).toBe(0);
  expect(told2).toEqual([]);
  expect(away).toEqual(['dm/k1']);
});
