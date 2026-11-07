// A PERSON WHO LEAVES HANDS THEIR WORK TO SOMEONE.
//
// "Jordan left today; the app has no way to hand over his work, his
// teammates or his threads: 10 threads sit Waiting on a person who is gone", his
// Support and Growth leads said "Waiting on its owner", and To still offered him.
// Measured here with three copies of the app over the memory cloud: removing a
// person deleted the membership and nothing else, so every task given to him,
// every conversation waiting on him and his open threads stayed where they were.
//
// Now the owner names who takes the work. What crosses the cloud is one record
// (who left, who takes it, and what happens to each AI teammate); each copy then
// moves what it holds itself, once, with a line on each saying so.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { mateCard } from '../shared/mate-cards.mjs';
import { inMyInbox, isTaskRow, mayRunHere } from '../shared/team-rules.mjs';
import { waitCameBack } from '../renderer/src/list-rules.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leaves-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    // No pass starts on a cloud event: all three copies share one process and
    // one line author, so a pass must run inside `on` to write as its own person.
    session: memorySession(() => ({ ...memoryBackend(cloud, personId), subscribe: () => () => {} })),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  const productOf = (slug) => store.listProducts().find((p) => p.slug === slug);
  const rows = (title) => store.listItems().filter((i) => (i.label || i.title) === title);
  return { personId, store, service, on, productOf, rows };
}

let cloud, maya, dev, jordan, teamId;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  jordan = await aMac(cloud, signUpMemory(cloud, { email: 'jordan@lumen.test', name: 'Jordan Lee' }));
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  teamId = maya.service.state().team.id;
  await maya.service.invite('dev@lumen.test');
  await maya.service.invite('jordan@lumen.test');
  for (const m of [dev, jordan]) { await m.service.signIn(); await m.service.acceptInvite(teamId); }
  for (const m of [maya, dev]) m.store.createProduct({ name: 'Lumen app' });
  for (const m of [maya, dev, jordan]) await m.on(() => m.service.syncNow());

  // What Jordan left behind: a task from each of the others, a conversation
  // where Dev spoke last, one open thread of his own and two AI teammates.
  await maya.on(() => maya.service.giveTask(jordan.personId, { title: 'Northside signup link', body: 'Send Northside the signup link.' }));
  await dev.on(() => dev.service.giveTask(jordan.personId, { title: 'Support feedback summary', body: 'Sum up this week\'s support emails.' }));
  await dev.on(() => dev.service.message(jordan.personId, 'Did the clinic confirm the Monday slot?'));
  await memoryBackend(cloud, jordan.personId).putCards(teamId, [
    { threadId: 'w-aaaaaaaaaa', visible: true, people: null, title: 'Launch cut 2 receptionist revisions', project: 'Lumen app', state: 'waiting', priority: null, problem: null, progress: 'Two of five shots redone', solution: null, blockedBy: [], blocks: [], updatedAt: Date.now() },
    { threadId: 'w-bbbbbbbbbb', visible: true, people: null, title: 'Old pricing page', project: 'Lumen app', state: 'done', priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: Date.now() },
    mateCard({ id: 'tm-support', name: 'Support lead', job: 'Answer user emails pasted into a thread.' }),
    mateCard({ id: 'tm-growth', name: 'Growth lead', job: 'Find clinics for the waitlist.' }),
  ]);
  for (const m of [maya, dev]) await m.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev, jordan]) await m.service.signOut(); });

const remove = (extra = {}) => maya.on(() => maya.service.removeMember(jordan.personId, {
  handTo: maya.personId, mates: [{ id: 'tm-support', to: dev.personId }, { id: 'tm-growth', to: null }], ...extra,
}));
// Three rounds: a task Dev's copy hands on goes up on its next pass and down on Maya's after.
const everyoneSyncs = async () => { for (let k = 0; k < 3; k += 1) for (const m of [maya, dev]) await m.on(() => m.service.syncNow()); };

describe('the owner asks who takes the work, and the cloud keeps one record of it', () => {
  it('records who left, who takes their work and what happens to each AI teammate', async () => {
    await remove();
    const [d] = await memoryBackend(cloud, dev.personId).departures(teamId);
    expect(d).toMatchObject({ personId: jordan.personId, name: 'Jordan Lee', handTo: maya.personId });
    expect(d.mates).toEqual([
      { id: 'tm-support', name: 'Support lead', job: 'Answer user emails pasted into a thread.', to: dev.personId },
      { id: 'tm-growth', name: 'Growth lead', job: 'Find clinics for the waitlist.', to: null },
    ]);
  });

  it('refuses a hand-over from anyone but the owner, and to someone not on the team', async () => {
    await expect(memoryBackend(cloud, dev.personId).removeMember(teamId, jordan.personId, { handTo: dev.personId })).rejects.toThrow();
    await expect(remove({ handTo: 'somebody-else' })).rejects.toThrow(/team/);
    await expect(remove({ handTo: jordan.personId })).rejects.toThrow();
    expect(await memoryBackend(cloud, maya.personId).departures(teamId)).toEqual([]);
    expect((await memoryBackend(cloud, maya.personId).teamPeople(teamId)).map((p) => p.id)).toContain(jordan.personId);
  });
});

describe('each copy moves what it holds', () => {
  it('a task the receiver gave him is theirs again, in their Needs you, with a line saying so', async () => {
    await remove();
    await everyoneSyncs();
    const rows = maya.rows('Northside signup link');
    const task = rows.find((r) => r.status !== 'done');
    expect(rows).toHaveLength(2);
    expect(task.assignee).toBe(maya.personId);
    expect(task.body).toContain('Send Northside the signup link.');
    expect(task.handedOver?.said).toBe('Jordan Lee left the team. This is yours now.');
    expect(waitCameBack(task)).toBe(true);
    // Held by a person, so no agent picks it up.
    expect(mayRunHere(task, maya.productOf(task.product), maya.personId)).toBe(false);
    expect(rows.find((r) => r.status === 'done').assignee).toBe(jordan.personId);
  });

  it('a task someone else gave him goes to the receiver as a new task, and closes on the giver\'s copy saying where it went', async () => {
    await remove();
    await everyoneSyncs();
    const onDev = dev.rows('Support feedback summary');
    const old = onDev.find((r) => r.assignee === jordan.personId);
    expect(old.status).toBe('done');
    expect(old.handedOver?.said).toBe('Jordan Lee left the team, so this went to Maya Chen.');
    const [moved] = maya.rows('Support feedback summary');
    expect(moved.assignee).toBe(maya.personId);
    expect(isTaskRow(moved)).toBe(true);
    expect(moved.body).toContain('Sum up this week\'s support emails.');
    expect(moved.body).toMatch(/^Handed to you from Jordan Lee, who left the team/);
    expect(inMyInbox(moved, maya.productOf(moved.product), maya.personId)).toBe(true);
  });

  it('a conversation waiting on him comes back to Needs you saying he left and who has his work', async () => {
    await remove();
    await everyoneSyncs();
    const [chat] = dev.store.listItems().filter((i) => dev.productOf(i.product)?.team?.direct && !isTaskRow(i));
    expect(chat.waitEnded?.said).toBe('Jordan Lee left the team. Maya Chen took over their work.');
    expect(waitCameBack(chat)).toBe(true);
    // Measured on screen: the team inbox asks this first, and it said no.
    expect(inMyInbox(chat, dev.productOf(chat.product), dev.personId)).toBe(true);
    // Once Dev writes again it is his conversation as before.
    await dev.on(() => dev.store.answerItem(chat.product, chat.id, { answer: 'Maya, can you check the Monday slot?' }));
    const again = dev.store.readItem(chat.product, chat.id);
    expect(inMyInbox(again, dev.productOf(chat.product), dev.personId)).toBe(false);
  });

  it('his open threads reach the receiver as one list of where each stood, and a finished one is left out', async () => {
    await remove();
    await everyoneSyncs();
    const [list] = maya.rows('Jordan Lee\'s open threads');
    expect(list.assignee).toBe(maya.personId);
    expect(list.body).toContain('Launch cut 2 receptionist revisions (Lumen app): Two of five shots redone');
    expect(list.body).not.toContain('Old pricing page');
    expect(list.body).toMatch(/the threads stayed on Jordan Lee's computer/);
    expect(waitCameBack(list)).toBe(true);
    expect(mayRunHere(list, maya.productOf(list.product), maya.personId)).toBe(false);
    expect(dev.rows('Jordan Lee\'s open threads')).toHaveLength(0);
  });

  it('an AI teammate given to someone is made again on their copy from its job; a paused one is made nowhere', async () => {
    await remove();
    await everyoneSyncs();
    const devs = dev.store.teammates.list();
    expect(devs.map((t) => t.name)).toEqual(['Support lead']);
    expect(devs[0].job).toBe('Answer user emails pasted into a thread.');
    expect(maya.store.teammates.list()).toEqual([]);
  });

  it('does all of it once, however many passes follow', async () => {
    await remove();
    await everyoneSyncs();
    await everyoneSyncs();
    expect(maya.rows('Support feedback summary')).toHaveLength(1);
    expect(maya.rows('Jordan Lee\'s open threads')).toHaveLength(1);
    expect(dev.store.teammates.list()).toHaveLength(1);
  });

  it('moves nothing when the owner removes someone without naming who takes over', async () => {
    await maya.on(() => maya.service.removeMember(jordan.personId));
    await everyoneSyncs();
    expect(maya.rows('Northside signup link')[0].assignee).toBe(jordan.personId);
    expect(maya.rows('Jordan Lee\'s open threads')).toHaveLength(0);
  });
});

describe('he leaves the people lists', () => {
  it('is gone from the team, its board and its AI teammates on every copy', async () => {
    await remove();
    await everyoneSyncs();
    for (const m of [maya, dev]) {
      const s = m.service.state();
      expect(s.people.map((p) => p.id)).not.toContain(jordan.personId);
      expect(s.cards.filter((c) => c.personId === jordan.personId)).toEqual([]);
      expect(s.teamMates.filter((t) => t.owner === jordan.personId)).toEqual([]);
    }
    await expect(dev.on(() => dev.service.message(jordan.personId, 'Still there?'))).rejects.toThrow(/not on your team/);
  });
});
