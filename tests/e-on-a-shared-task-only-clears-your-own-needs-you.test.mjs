// E ON A SHARED TASK ONLY CLEARS IT FROM YOUR OWN NEEDS YOU; CLOSE TASK CLOSES IT.
//
// Maya pressed E on Dev's reply in her LUM-50 task, as she does on
// every thread she has dealt with, and it closed Dev's live task for both of
// them ("Done: Fix LUM-50"); only Undo saved it. And Sofia's E on Dev's "marked
// it done" notice closed it again in her name, which put it back in his Needs
// you, four times between 2:39 and 3:10. Measured with two copies over the
// in-memory cloud: each E wrote `status: done`, a new close by the other person.
// Now E writes `putAway`, which settles the task for the presser alone, and
// "Close task" is the one press that closes it for both.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { closedByTheOther, inMyInbox } from '../shared/team-rules.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'put-away-'));
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
const needsYou = (mac) => inMyInbox(row(mac), product(mac), mac.personId) || closedByTheOther(row(mac), product(mac), mac.personId, 0);
const sync = async () => { await maya.service.syncNow(); await dev.service.syncNow(); await maya.service.syncNow(); };
const say = (mac, words) => mac.on(() => mac.store.answerItem(made.product, made.id, { answer: words }));
const putAway = (mac, on = true) => mac.on(() => mac.store.answerItem(made.product, made.id, { putAway: on }));
const closeTask = (mac) => mac.on(() => mac.store.answerItem(made.product, made.id, { status: 'done' }));

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  await maya.service.invite('dev@lumen.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  await maya.service.syncNow();
  made = await maya.on(() => maya.service.giveTask(dev.personId, { title: 'Fix LUM-50', body: 'Fix LUM-50: Cancel does nothing.' }));
  await sync();
  await say(dev, 'On it. An agent is wiring Cancel.');
  await sync();
});
afterEach(async () => { await dev.service.signOut(); await maya.service.signOut(); });

describe('the giver presses E on the holder’s reply', () => {
  it('his reply is in her Needs you before she presses it', () => {
    expect(needsYou(maya)).toBe(true);
  });
  it('it leaves her Needs you, and the task stays open on both Macs', async () => {
    await putAway(maya);
    await sync();
    expect(needsYou(maya)).toBe(false);
    expect(row(maya).status).toBe('open');
    expect(row(dev).status).toBe('open');
  });
  it('his side does not change: no close, nothing new in his Needs you', async () => {
    const before = needsYou(dev);
    const status = row(dev).wrote.status?.ts;
    await putAway(maya);
    await sync();
    expect(needsYou(dev)).toBe(before);
    expect(row(dev).wrote.status?.ts).toBe(status);
  });
  it('it comes back when he writes again', async () => {
    await putAway(maya);
    await sync();
    await say(dev, 'Merged as 97cd9b9.');
    await sync();
    expect(needsYou(maya)).toBe(true);
  });
  it('her own next words do not bring it back to her', async () => {
    await putAway(maya);
    await say(maya, 'Thanks, keep it open until merged.');
    await sync();
    expect(inMyInbox(row(maya), product(maya), maya.personId)).toBe(false);
  });
  it('Undo puts it back', async () => {
    await putAway(maya);
    await putAway(maya, false);
    expect(needsYou(maya)).toBe(true);
  });
});

describe('the holder presses E', () => {
  it('it leaves his Needs you and stays open, his', async () => {
    await say(maya, 'Is the picture of a seat coming back in Files?');
    await sync();
    expect(needsYou(dev)).toBe(true);
    await putAway(dev);
    await sync();
    expect(needsYou(dev)).toBe(false);
    expect(row(dev).status).toBe('open');
    expect(row(dev).assignee).toBe(dev.personId);
  });
});

describe('Close task', () => {
  beforeEach(async () => {
    await say(dev, 'Done, merged.');
    await closeTask(dev);
    await sync();
  });
  it('closes it for both', () => {
    expect(row(dev).status).toBe('done');
    expect(row(maya).status).toBe('done');
  });
  it('tells the giver once, and not the one who closed it', () => {
    expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(true);
    expect(closedByTheOther(row(dev), product(dev), dev.personId, 0)).toBe(false);
  });
  it('her E on the notice clears it and does not bounce back to him', async () => {
    await putAway(maya);
    await sync();
    expect(closedByTheOther(row(maya), product(maya), maya.personId, 0)).toBe(false);
    expect(closedByTheOther(row(dev), product(dev), dev.personId, 0)).toBe(false);
    expect(row(dev).status).toBe('done');
    expect(row(dev).wrote.status.by).toBe(dev.personId);
  });
});

describe('the wiring', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const markDone = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const reopenDone = useCallback'));
  it('E on a given task writes putAway, and only Close task writes the close', () => {
    expect(markDone).toMatch(/isGivenTask\(item, team\?\.products\.get\(item\.product\)\) && !closeTask/);
    expect(markDone).toMatch(/putAway: true/);
  });
  it('the task offers a named Close task, on the task and in its menu', () => {
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).toMatch(/label: 'Close task'/);
    expect(app).toMatch(/onCloseTask=\{[^}]*markDone\(focused, \{ closeTask: true \}\)/);
  });
  it('a putAway from a teammate never reaches this Mac', async () => {
    const { whatATeammateMaySet } = await import('../shared/team-rules.mjs');
    expect(whatATeammateMaySet({ id: 't', ts: 1, by: 'p', patch: { putAway: true } }, { direct: true })).toBeNull();
  });
});
