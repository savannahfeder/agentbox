// CLOSE TASK, FROM EITHER PERSON, CLOSES A TASK FOR BOTH, AND THE OTHER ONE IS TOLD.
//
// "Decide which ships first" sat in Maya's In progress as YOU HAVE
// THIS though she had answered and Dev had marked it done. The fold kept a task
// open for its holder once she had written on it, so the giver's close only
// settled it for him. Measured with two copies over the in-memory cloud: after
// Maya answered and Dev closed it, both rows folded to `open`. Now either close
// shuts it, and the other person finds it once in Needs you as "Dev marked it
// done". That close is the named Close task, not E: E only
// clears your own Needs you (e-on-a-shared-task-only-clears-your-own-needs-you).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { closedByTheOther } from '../shared/team-rules.mjs';
import { taskWords } from '../renderer/src/team/company.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-task-'));
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
const reopen = (mac) => mac.on(() => mac.store.answerItem(made.product, made.id, { status: 'open' }));

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
  made = await dev.on(() => dev.service.giveTask(maya.personId, { title: 'Decide which ships first', body: 'Decide which ships first.' }));
  await sync();
});
afterEach(async () => { await dev.service.signOut(); await maya.service.signOut(); });

describe('the giver presses Close task after the holder has answered', () => {
  beforeEach(async () => {
    await say(maya, 'Slot rule first, then the picker.');
    await sync();
    await close(dev);
    await sync();
  });
  it('it is closed on both Macs', () => {
    expect(row(dev).status).toBe('done');
    expect(row(maya).status).toBe('done');
  });
  it('her row says Done, never You have this', () => {
    expect(taskWords(row(maya), product(maya), maya.personId, () => 'Dev').word).toBe('Done');
  });
  it('she finds it once in Needs you, saying who closed it', () => {
    expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(true);
    expect(taskWords(row(maya), product(maya), maya.personId, () => 'Dev', true).word).toBe('Dev marked it done');
  });
  it('and not after she has opened it', () => {
    const closedAt = row(maya).wrote.status.ts;
    expect(closedByTheOther(row(maya), product(maya), maya.personId, closedAt)).toBe(false);
  });
  it('the one who pressed it is not told about his own Done', () => {
    expect(closedByTheOther(row(dev), product(dev), dev.personId, 0)).toBe(false);
  });
  it('her own close afterwards keeps it closed and puts it away for her', async () => {
    await close(maya);
    await sync();
    expect(row(maya).status).toBe('done');
    expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(false);
  });
  it('either of them can open it again', async () => {
    await reopen(maya);
    await sync();
    expect(row(maya).status).toBe('open');
    expect(row(dev).status).toBe('open');
  });
});

describe('the holder presses Close task', () => {
  it('it is closed for both, and the giver is told once', async () => {
    await say(maya, 'Done: slot rule first.');
    await close(maya);
    await sync();
    expect(row(dev).status).toBe('done');
    expect(closedByTheOther(row(dev), product(dev), dev.personId, 0)).toBe(true);
    expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(false);
  });
});

describe('the wiring', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('Close task is not held for a second press', () => {
    const markDone = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const resolve = useCallback'));
    expect(markDone).not.toMatch(/holdsTheClose|Press E again/);
  });
  it('Needs you takes a task the other person closed', () => {
    const inbox = app.slice(app.indexOf('const inboxCandidates = useMemo'), app.indexOf('const inboxCandidates = useMemo') + 4000);
    expect(inbox).toMatch(/closedByTheOther\(i, team\.products\.get\(i\.product\), team\.me, seenAt\[i\.id\] \?\? unreadSince\)/);
  });
});

it('an open task is never news of a close', async () => {
  await say(maya, 'On it.');
  await sync();
  expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(false);
  expect(closedByTheOther(row(dev), product(dev), dev.personId, 0)).toBe(false);
});
