// A hand-over copied the giver's result, "committed on agentbox/w-…", and on the receiver's side that id
// named a thread they do not have, so the card read "committed on Unavailable thread". Measured on the in-memory cloud.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { isGivenTask } from '../shared/team-rules.mts';
import { handedFrom } from '../shared/thread-link.mts';

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-over-ids-'));
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
  disk.setLineAuthor(theo.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await sam.service.signOut(); });

async function handed(result: (ids: { other: string; self: string }) => string, progress?: string) {
  const other = theo.store.composeItem('api', { title: 'Persistence for appointments', body: 'Store appointments in SQLite.' });
  const t = theo.store.composeItem('api', { title: 'Production runbook for the API', body: 'Write the runbook.' });
  if (progress) disk.updateWorkItem(theo.dir, t.id, { progress: progress.replace('{other}', other.id) }, { source: 'agent' });
  theo.store.recordSessionResult('api', t.id, { result: result({ other: other.id, self: t.id }) });
  await theo.service.handOn({ product: 'api', id: t.id, to: sam.personId });
  for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await sam.service.syncNow(); }
  const task = sam.store.listItems().find((i) => isGivenTask(i, sam.store.listProducts().find((p) => p.slug === i.product)))!;
  return { task, other, t };
}

it('names a branch the result gives by its thread\'s title', async () => {
  const { task } = await handed(({ other, self }) => `Done: committed on agentbox/${self} and not merged. The persistence code is on agentbox/${other}.`);
  expect(task.body).toContain('Done: committed on the branch for Production runbook for the API and not merged.');
  expect(task.body).toContain('The persistence code is on the branch for Persistence for appointments.');
  expect(task.body).not.toMatch(/agentbox\/w-/);
});

it('names a thread given by its bare id by its title, in what the agent tried too', async () => {
  const { task } = await handed(({ other }) => `Rebased on ${other}.`, 'Read {other} first\nWrote the runbook');
  expect(task.body).toContain('Rebased on Persistence for appointments.');
  expect(task.body).toContain('- Read Persistence for appointments first');
});

it('says another branch for one that is not on this computer', async () => {
  const { task } = await handed(() => 'Merged agentbox/w-0123456789 into it.');
  expect(task.body).toContain('Merged another branch into it.');
});

it('leaves a path through a thread\'s folder, and the link back to the thread, as they were', async () => {
  const { task, other } = await handed(({ other: o }) => `The notes are in worktrees/${o}/README.md.`);
  expect(task.body).toContain(`worktrees/${other.id}/README.md`);
  expect(handedFrom(task.body, theo.personId)).toMatchObject({ owner: theo.personId });
});
