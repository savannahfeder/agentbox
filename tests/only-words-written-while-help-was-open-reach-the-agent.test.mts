// ONLY WORDS WRITTEN WHILE HELP WAS OPEN REACH THE AGENT (2026-11-21).
//
// A help ask passes the helper's comments on your thread to its agent as
// theirs. It decided by whether the ask was open when your computer read the
// comment, not when the comment was written. Two ways that went wrong, found
// reading the code and reproduced on the in-memory cloud with two computers:
//   - Theo left a plain remark while Sam's app was closed; Sam then asked him
//     for help, and the old remark went to Sam's agent as an instruction. A
//     restart did the same with every comment the cloud still listed, since
//     which ones were already read is kept only in memory.
//   - Sam's laptop slept while Theo wrote "Drop it concurrently" to the agent
//     and handed back. On waking, the hand-back closed the ask before the
//     comment was read, so the agent never got Theo's words.
// Now a comment goes to the agent when a help ask to its writer was opened
// before it was written and not handed back until after.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { helpAskCovering } from '../shared/thread-asks.mts';

async function aMac(cloud, personId, tellThread) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'help-window-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const stateFile = path.join(storeRoot, '.team-sync.json');
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile, intervalMs: 3_600_000, tellThread });
  return { personId, store, service, accountRoot, stateFile };
}

let cloud, sam, theo, told;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud(); told = [];
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), (slug, id, o) => { told.push({ slug, id, ...o }); });
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }), vi.fn());
  await sam.service.signIn(); await sam.service.createTeam('Clinicflow');
  await sam.service.invite('theo@cf.test');
  await theo.service.signIn(); await theo.service.acceptInvite(sam.service.state().team.id);
});
afterEach(async () => { disk.setLineAuthor(null); for (const m of [sam, theo]) await m.service.signOut(); });

const both = async (n = 3) => { for (let k = 0; k < n; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
const theTask = () => theo.store.listItems().find((i) => i.ask);
const toAgent = () => told.filter((x) => !x.hold).map((x) => x.text);
async function thread() {
  disk.setLineAuthor(sam.personId);
  const t = sam.store.composeItem('api', { title: 'Add an idempotency key', body: 'Add one.' });
  sam.store.recordSessionResult('api', t.id, { result: 'Should I drop the old unique index first?' });
  await both();
  return t;
}
async function askHelp(t) {
  disk.setLineAuthor(sam.personId);
  await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'help', note: 'Is it safe?' });
  await both();
}
const asleep = async (fn) => { const emit = cloud.events.emit; cloud.events.emit = () => true; try { await fn(); } finally { cloud.events.emit = emit; } };

it('words written while help was open reach the agent, even when the hand-back is read first', async () => {
  const t = await thread(); await askHelp(t);
  disk.setLineAuthor(theo.personId);
  await asleep(async () => {
    await theo.service.commentOnThread(sam.personId, t.id, 'Drop it concurrently.');
    await theo.service.handBack({ product: theTask().product, id: theTask().id, words: 'Told your agent.' });
    await theo.service.syncNow();
  });
  await both(); await both();
  expect(toAgent()).toContain('Drop it concurrently.');
});

it('a remark written before the ask is not passed to the agent once the ask is made', async () => {
  const t = await thread();
  disk.setLineAuthor(theo.personId);
  await asleep(async () => {
    await theo.service.commentOnThread(sam.personId, t.id, 'Old remark from last week.');
    await theo.service.syncNow();
  });
  await askHelp(t);
  expect(toAgent()).not.toContain('Old remark from last week.');
});

it('after a restart, an old plain comment is not passed to the agent', async () => {
  const t = await thread();
  disk.setLineAuthor(theo.personId);
  await theo.service.commentOnThread(sam.personId, t.id, 'Plain remark, delivered as a comment.');
  await both();
  await askHelp(t);
  const again = [];
  const sam2 = createTeamService({ session: memorySession(() => memoryBackend(cloud, sam.personId)), store: sam.store, disk, accountRoot: sam.accountRoot, stateFile: sam.stateFile, intervalMs: 3_600_000, tellThread: (slug, id, o) => { again.push({ slug, id, ...o }); } });
  await sam2.signIn(); await sam2.syncNow(); await sam2.signOut();
  expect(again.filter((x) => !x.hold)).toEqual([]);
});

it('a comment written during an open ask still reaches the agent at once', async () => {
  const t = await thread(); await askHelp(t);
  disk.setLineAuthor(theo.personId);
  await theo.service.commentOnThread(sam.personId, t.id, 'Yes, drop it first.');
  await both();
  expect(toAgent()).toContain('Yes, drop it first.');
});

it('the window: opened before the words, handed back after them', () => {
  const row = (o = {}) => ({ id: 'k', status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 100, labels: ['given-task'], ask: { kind: 'help', owner: 'sam', thread: 't', product: 'api' }, wrote: { ask: { by: 'sam', ts: 100 } }, ...o });
  expect(helpAskCovering([row()], 'sam', 't', 'theo', 150)).toBeTruthy();
  expect(helpAskCovering([row()], 'sam', 't', 'theo', 50)).toBeNull();
  const back = row({ status: 'done', verdict: 'done', wrote: { ask: { by: 'sam', ts: 100 }, status: { ts: 200 } } });
  expect(helpAskCovering([back], 'sam', 't', 'theo', 150)).toBeTruthy();
  expect(helpAskCovering([back], 'sam', 't', 'theo', 250)).toBeNull();
  expect(helpAskCovering([row()], 'sam', 't', 'priya', 150)).toBeNull();
});
