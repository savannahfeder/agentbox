// A TASK YOU HOLD STAYS YOURS UNTIL YOU PRESS DONE.
//
// Maya: "Replying 'I will do this by 6:45' sent Dev's task to
// Done, though I still owed it", "In progress showed 0 while I still owed two
// things." Her reply was not what closed it: Dev, waiting on her, pressed E to get
// it out of his Needs you, and his close was the one status they share. Measured
// with two copies over the in-memory cloud below.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { inMyInbox } from '../shared/team-rules.mts';
import { taskWords } from '../renderer/src/team/company.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'held-task-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  return { personId, store, service, on };
}

let cloud, dev, maya, made;
const row = (mac) => mac.store.readItem(made.product, made.id);
const product = (mac) => mac.store.listProducts().find((p) => p.slug === made.product);
const sync = async () => { await dev.service.syncNow(); await maya.service.syncNow(); await dev.service.syncNow(); };
const say = (mac, words) => mac.on(() => mac.store.answerItem(made.product, made.id, { answer: words }));
const close = (mac) => mac.on(() => mac.store.answerItem(made.product, made.id, { status: 'done' }));

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  await dev.service.signIn();
  await dev.service.createTeam('Lumen');
  await dev.service.invite('maya@lumen.test');
  await maya.service.signIn();
  await maya.service.acceptInvite(dev.service.state().team.id);
  await dev.service.syncNow();
  made = await dev.on(() => dev.service.giveTask(maya.personId, { title: 'Render account', body: 'Make the Render account.' }));
  await sync();
});
afterEach(async () => { await dev.service.signOut(); await maya.service.signOut(); });

describe('when the holder replies', () => {
  it('it is in her Needs you before she has said anything', () => {
    expect(inMyInbox(row(maya), product(maya), maya.personId)).toBe(true);
  });
  it('it leaves her Needs you, stays open and stays hers, and says so', async () => {
    await say(maya, 'I will do this by 6:45');
    await sync();
    const r = row(maya);
    expect(r.status).toBe('open');
    expect(r.assignee).toBe(maya.personId);
    expect(inMyInbox(r, product(maya), maya.personId)).toBe(false);
    expect(taskWords(r, product(maya), maya.personId, () => 'Dev').word).toBe('You have this');
  });
  it('the giver\'s answer brings it back to her', async () => {
    await say(maya, 'I will do this by 6:45');
    await sync();
    await say(dev, 'Thanks, 6:45 works.');
    await sync();
    expect(inMyInbox(row(maya), product(maya), maya.personId)).toBe(true);
  });
});

// The giver's Done closes it for both: a-task-either-person-closes-is-closed-for-both.

describe('what still closes it', () => {
  it('the holder pressing Done closes it for both', async () => {
    await close(maya);
    await sync();
    expect(row(maya).status).toBe('done');
    expect(row(dev).status).toBe('done');
  });
  it('and the giver pressing Done after her leaves it closed', async () => {
    await close(maya);
    await sync();
    await close(dev);
    await sync();
    expect(row(maya).status).toBe('done');
    expect(row(dev).status).toBe('done');
  });
  it('the giver takes it back with Done before she has said anything', async () => {
    await close(dev);
    await sync();
    expect(row(maya).status).toBe('done');
  });
});

it('a held task is on the In progress list, from the same rule', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const rule = app.slice(app.indexOf('const teamProgress = useCallback'), app.indexOf('const teamProgress = useCallback') + 500);
  expect(rule).toMatch(/isTaskRow\(i\) && i\.assignee === team\.me/);
});
