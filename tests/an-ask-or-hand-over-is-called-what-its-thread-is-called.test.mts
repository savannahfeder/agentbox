// The task an ask or a hand-over made took its name through the few-words rule a second time, so a thread
// named "Is the payment amount in cents or decimals?" reached the teammate as "Is the payment amount in cents". Measured on the in-memory cloud.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { shownTitle } from '../shared/thread-title.mts';

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-title-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, dir: path.join(accountRoot, 'api') };
}

let cloud: ReturnType<typeof createMemoryCloud>, theo: Awaited<ReturnType<typeof aMac>>, sam: Awaited<ReturnType<typeof aMac>>;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@nw.test', name: 'Sam Ortiz' }));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('sam@nw.test');
  await sam.service.signIn();
  await sam.service.acceptInvite(theo.service.state().team.id);
  disk.setLineAuthor(sam.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await sam.service.signOut(); });

const both = async () => { for (let k = 0; k < 2; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
const toTheo = () => theo.store.listItems().find((i) => i.assignee === theo.personId)!;

async function thread(title: string, renamed?: string) {
  const t = sam.store.composeItem('api', { title, body: 'Check what the API takes.' });
  if (renamed) sam.store.threadEdit('api', t.id, { label: renamed });
  return sam.store.readItem('api', t.id)!;
}

for (const kind of ['review', 'help'] as const) {
  it(`keeps a name the owner gave the thread whole, on an ask for ${kind}`, async () => {
    const t = await thread('Cents or decimals', 'Is the payment amount in cents or decimals?');
    await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind, note: 'Which one?' });
    await both();
    expect(toTheo().title).toBe('Is the payment amount in cents or decimals?');
  });
}

it('keeps it whole on a hand-over', async () => {
  const t = await thread('Cents or decimals', 'Is the payment amount in cents or decimals?');
  await sam.service.handOn({ product: 'api', id: t.id, to: theo.personId });
  await both();
  expect(toTheo().title).toBe('Is the payment amount in cents or decimals?');
});

it('calls a thread nobody renamed what its owner sees it called, not the message it began with', async () => {
  const t = await thread('Look at why sign up emails go to spam, and fix it');
  await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'review' });
  await both();
  expect(toTheo().title).toBe(shownTitle(t));
  expect(toTheo().title).not.toContain('and fix it');
});

it('still names a task given by hand by what it asks', async () => {
  await sam.service.giveTask(theo.personId, { title: 'Task for Theo', body: 'Rotate the staging keys before Friday.' });
  await both();
  expect(toTheo().title).toBe('Rotate the staging keys before Friday');
});
