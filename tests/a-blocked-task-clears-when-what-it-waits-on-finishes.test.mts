// A BLOCKED TASK CLEARS WHEN WHAT IT WAITS ON FINISHES, AND THE TEAM CAN SEE IT.
//
// Dev gave Sofia a task and looked for "blocked by". He saw only "Due
// on: No Deadline", "Medium" and a message box, and wrote "blocked on my restyle"
// in words. "Board view exists" said the rest: only his own tasks, no blocked-by,
// nobody else's. Measured on the code before this, with three copies of the app
// over the in-memory cloud: `giveTask` dropped any blockedBy it was handed, the
// team sync skipped every conversation record when it cleared waits, and a task
// a person held went to the team as a card with no title, no due day and no
// block, so the third person could list nothing.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { cardsFor } from '../shared/thread-cards.mts';
import { inMyInbox } from '../shared/team-rules.mts';
import { blockedWords, endedTaskBlocks } from '../shared/team-tasks.mts';
import { personWait, cardWait } from '../shared/thread-waits.mts';

async function aMac(cloud, personId, name) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-task-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  const row = (title) => store.listItems().find((i) => (i.label || i.title) === title);
  const productOf = (slug) => store.listProducts().find((p) => p.slug === slug);
  const ctx = () => ({ items: store.listItems(), cards: service.state().cards ?? [], me: personId, nameOf: (id) => service.state().people.find((p) => p.id === id)?.name ?? 'Someone' });
  return { personId, name, store, service, on, row, productOf, ctx };
}

let cloud, maya, dev, sofia;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }), 'maya');
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }), 'dev');
  sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Ruiz' }), 'sofia');
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  await maya.service.invite('dev@lumen.test');
  await maya.service.invite('sofia@lumen.test');
  for (const m of [dev, sofia]) { await m.service.signIn(); await m.service.acceptInvite(maya.service.state().team.id); }
  await maya.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev, sofia]) await m.service.signOut(); });

const everyoneSyncs = async () => { for (let k = 0; k < 2; k += 1) for (const m of [maya, dev, sofia]) await m.service.syncNow(); };
const restyle = () => maya.on(() => maya.service.giveTask(dev.personId, { title: 'Restyle the seat picker', body: 'Restyle the seat picker.', visibility: 'team' }));
const cut = (blockedBy, extra = {}) => maya.on(() => maya.service.giveTask(sofia.personId, { title: 'Cut the launch film', body: 'Cut the launch film once the picker is restyled.', visibility: 'team', blockedBy, ...extra }));
const write = (mac, item, patch) => mac.on(() => mac.store.answerItem(item.product, item.id, patch));

describe('a task blocked by another task', () => {
  it('reaches its holder blocked, and says on whom', async () => {
    const r = await restyle();
    await cut([cardWait(dev.personId, r.id)]);
    await everyoneSyncs();
    const held = sofia.row('Cut the launch film');
    expect(held.blockedBy).toEqual([cardWait(dev.personId, r.id)]);
    expect(blockedWords(held, sofia.ctx())).toMatchObject({ word: 'Blocked on Dev', title: 'Blocked on Dev’s “Restyle the seat picker”' });
    // The giver's copy reads the same.
    expect(blockedWords(maya.row('Cut the launch film'), maya.ctx()).word).toBe('Blocked on Dev');
  });

  it('does not clear when the blocking task is merely answered', async () => {
    const r = await restyle();
    await cut([cardWait(dev.personId, r.id)]);
    await everyoneSyncs();
    await write(dev, dev.row('Restyle the seat picker'), { answer: 'Halfway there.' });
    await everyoneSyncs();
    expect(sofia.row('Cut the launch film').blockedBy).toEqual([cardWait(dev.personId, r.id)]);
    expect(sofia.row('Cut the launch film').waitEnded).toBeUndefined();
  });

  it('clears when it finishes, tells its holder, and the giver sees it clear', async () => {
    const r = await restyle();
    await cut([cardWait(dev.personId, r.id)]);
    await everyoneSyncs();
    await write(sofia, sofia.row('Cut the launch film'), { answer: 'Will do once Dev is done.' });
    await everyoneSyncs();
    let held = sofia.row('Cut the launch film');
    expect(inMyInbox(held, sofia.productOf(held.product), sofia.personId)).toBe(false);
    await write(dev, dev.row('Restyle the seat picker'), { status: 'done' });
    await everyoneSyncs();
    held = sofia.row('Cut the launch film');
    expect(held.blockedBy).toEqual([]);
    expect(held.waitEnded.said).toBe('Dev finished “Restyle the seat picker”');
    expect(inMyInbox(held, sofia.productOf(held.product), sofia.personId)).toBe(true);
    expect(maya.row('Cut the launch film').blockedBy).toEqual([]);
  });
});

describe('a task blocked by a person', () => {
  it('clears when that person writes to its holder, and not before', async () => {
    await cut([personWait(dev.personId)]);
    await everyoneSyncs();
    expect(blockedWords(sofia.row('Cut the launch film'), sofia.ctx()).word).toBe('Blocked on Dev');
    await everyoneSyncs();
    expect(sofia.row('Cut the launch film').blockedBy).toEqual([personWait(dev.personId)]);
    await dev.on(() => dev.service.message(sofia.personId, 'The picker is done.'));
    await everyoneSyncs();
    expect(sofia.row('Cut the launch film').blockedBy).toEqual([]);
    expect(sofia.row('Cut the launch film').waitEnded.said).toBe('Dev wrote to you');
  });
});

describe('set later', () => {
  it('its holder can block it after it arrives, and the giver sees it', async () => {
    const r = await restyle();
    await cut(undefined);
    await everyoneSyncs();
    const held = sofia.row('Cut the launch film');
    await sofia.on(() => sofia.store.threadEdit(held.product, held.id, { blockedBy: [cardWait(dev.personId, r.id)] }));
    await everyoneSyncs();
    expect(maya.row('Cut the launch film').blockedBy).toEqual([cardWait(dev.personId, r.id)]);
  });
});

describe('the team sees every task', () => {
  it('a third person reads its title, holder, due day and block', async () => {
    const r = await restyle();
    await cut([cardWait(dev.personId, r.id)], { due: '2026-11-04', priority: 8 });
    await everyoneSyncs();
    const card = dev.service.state().cards.find((c) => c.personId === sofia.personId && c.title === 'Cut the launch film');
    expect(card).toMatchObject({ state: 'waiting', priority: 8, task: { from: maya.personId, dueAt: new Date(2026, 10, 5).getTime(), clock: false } });
    expect(card.blockedBy.map((b) => b.id)).toEqual([cardWait(dev.personId, r.id)]);
  });

  it('a finished task stays on the team\'s list long enough for the blocks on it to clear', async () => {
    await restyle();
    await everyoneSyncs();
    await write(dev, dev.row('Restyle the seat picker'), { status: 'done' });
    await everyoneSyncs();
    const onDev = cardsFor({ products: dev.store.listProducts(), readItems: (p) => disk.readWorkItems(p.dir), since: 0, me: dev.personId });
    expect(onDev).toEqual([expect.objectContaining({ title: 'Restyle the seat picker', state: 'done' })]);
  });

  it('a task nobody said the team may see still goes up with no words', async () => {
    await maya.on(() => maya.service.giveTask(sofia.personId, { title: 'Private one', body: 'Private one.' }));
    await everyoneSyncs();
    const cards = dev.service.state().cards.filter((c) => c.personId === sofia.personId);
    expect(cards).toEqual([expect.objectContaining({ title: null, project: null })]);
    expect(cards[0].task).toBeUndefined();
  });
});

describe('only its holder\'s Mac clears it', () => {
  it('the giver\'s copy leaves it for the holder to be told', () => {
    const task = { id: 't', status: 'open', labels: ['given-task'], assignee: 'sofia', people: ['maya', 'sofia'], blockedBy: [personWait('dev')], wrote: { blockedBy: { ts: 1 } } };
    const ctx = { items: [], cards: [], lastWordFrom: () => 5, nameOf: () => 'Dev' };
    expect(endedTaskBlocks([task], { ...ctx, me: 'maya' })).toEqual([]);
    expect(endedTaskBlocks([task], { ...ctx, me: 'sofia' })).toHaveLength(1);
  });
});
