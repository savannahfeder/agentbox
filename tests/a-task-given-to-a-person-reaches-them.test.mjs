// A TASK GIVEN TO A PERSON REACHES THEM.
//
// What broke: Maya sent Dev a task with a priority
// and a due day. It was filed in Maya's own project, projects never leave their
// Mac, and the rule for whether an agent may run said yes to any row in an
// unshared project. So Maya's own agent answered it and it sat in her Needs you;
// Dev said "Your Dr. Ames task did NOT reach me." The rebuilt
// version had two more: "the row kept saying WITH DEV with no unread dot", and
// "the hand-off to Dev lost the design".
//
// Measured here with two copies of the app over the in-memory cloud. The task
// rides the record the two people already share for messages, as a row of its
// own, so everything below is what each copy reads off its own disk.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';
import { wantsPriority } from '../main/message-priority.mts';
import { GIVEN_TASK, handedOnByReply, heldByAPerson, iSpokeLast, inMyInbox, isGivenTask, mayRunHere, taskGiver, taskNewsAt, whatATeammateMaySet } from '../shared/team-rules.mjs';
import { messageLine, conversationWith, teamEntries, boardColumns, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';
import { directConversations } from '../renderer/src/team/rooms/conversations.ts';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { isBusy, statusWord } from '../renderer/src/team/everything/place.ts';
import { teamRouteChoices } from '../renderer/src/team/TeamFocus.tsx';
import { namedCards, taskWords } from '../renderer/src/team/company.ts';
import { isUnread } from '../renderer/src/unread.ts';
import { giveRows, threadCommands } from '../renderer/src/thread-commands.ts';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const PNG = Buffer.from('a picture').toString('base64');

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'given-task-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  // Both people share one process here and the author is process-wide.
  const on = async (fn) => { disk.setLineAuthor(personId); try { return await fn(); } finally { disk.setLineAuthor(null); } };
  const productOf = (slug) => store.listProducts().find((p) => p.slug === slug);
  // The one row with this title on this Mac, and the record it sits in.
  const row = (title) => store.listItems().find((i) => (i.label || i.title) === title);
  const facts = (title) => { const r = row(title); return { r, product: productOf(r.product) }; };
  return { personId, store, service, on, productOf, row, facts, accountRoot };
}

let cloud, maya, dev, jordan;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  jordan = await aMac(cloud, signUpMemory(cloud, { email: 'jordan@lumen.test', name: 'Jordan Lee' }));
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  await maya.service.invite('dev@lumen.test');
  await maya.service.invite('jordan@lumen.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  await jordan.service.signIn();
  await jordan.service.acceptInvite(maya.service.state().team.id);
  await maya.service.syncNow();
});
afterEach(async () => { for (const m of [maya, dev, jordan]) await m.service.signOut(); });

const give = (extra = {}) => maya.on(() => maya.service.giveTask(dev.personId, {
  title: 'Book Dr. Ames', body: 'Book Dr. Ames for the group class.', priority: 7, due: '2026-11-04', ...extra,
}));
const say = (mac, item, words) => mac.on(() => mac.store.answerItem(item.product, item.id, { answer: words }));
const bothSync = async () => { await maya.service.syncNow(); await dev.service.syncNow(); await maya.service.syncNow(); };

describe('it reaches the person it was given to', () => {
  it('lands in their Needs you, from the sender, with its words, priority and due day', async () => {
    await give();
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    expect(r.body).toBe('Book Dr. Ames for the group class.');
    expect(r.priority).toBe(7);
    expect(r.due).toBe('2026-11-04');
    expect(r.assignee).toBe(dev.personId);
    expect(isGivenTask(r, product)).toBe(true);
    expect(taskGiver(r)).toBe(maya.personId);
    expect(inMyInbox(r, product, dev.personId)).toBe(true);
  });

  it('is not in the sender\'s Needs you, and is theirs to see as held by the other', async () => {
    await give();
    const { r, product } = maya.facts('Book Dr. Ames');
    expect(heldByAPerson(r)).toBe(true);
    expect(inMyInbox(r, product, maya.personId)).toBe(false);
    expect(iSpokeLast(r, product, maya.personId)).toBe(false);
  });

  it('starts no agent on either Mac', async () => {
    await give();
    await dev.service.syncNow();
    const a = maya.facts('Book Dr. Ames');
    const b = dev.facts('Book Dr. Ames');
    expect(mayRunHere(a.r, a.product, maya.personId)).toBe(false);
    expect(mayRunHere(b.r, b.product, dev.personId)).toBe(false);
  });

  // The Mac that receives one sorts a message with a model. The sender's level is the task's.
  it('is never re-ranked by the receiving Mac', async () => {
    await give({ priority: 0 });
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    expect(wantsPriority(r, product, dev.personId)).toBe(false);
  });

  it('reaches nobody else on the team', async () => {
    await give();
    await jordan.service.syncNow();
    expect(jordan.row('Book Dr. Ames')).toBeUndefined();
  });

  it('carries the files on it', async () => {
    const made = await give({ files: [{ name: 'layout.png', dataBase64: PNG }] });
    expect(made.body).toMatch(/!\[layout\.png\]\(attachments\/[^)]+\)/);
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    const name = r.body.match(/\(attachments\/([^)]+)\)/)[1];
    expect(fs.readFileSync(path.join(product.dir, 'attachments', name)).toString()).toBe('a picture');
  });

  it('a task with no words of its own says its title', async () => {
    const made = await give({ body: undefined });
    expect(made.body).toBe('Book Dr. Ames');
  });

  it('goes to one person', async () => {
    await expect(maya.on(() => maya.service.giveTask([dev.personId, jordan.personId], { title: 'Both of you' }))).rejects.toThrow(/one person/);
    await expect(maya.on(() => maya.service.giveTask(maya.personId, { title: 'Me' }))).rejects.toThrow();
    await expect(maya.on(() => maya.service.giveTask('nobody', { title: 'Stranger' }))).rejects.toThrow(/not on your team/);
  });
});

describe('writing back does not hand it back', () => {
  it('stays with the person it was given to when they write', async () => {
    const made = await give();
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    expect(handedOnByReply(r, product, dev.personId)).toBeNull();
    await say(dev, r, 'Which Thursday?');
    await bothSync();
    const held = dev.facts('Book Dr. Ames');
    expect(held.r.assignee).toBe(dev.personId);
    expect(held.r.status).toBe('open');
    expect(maya.store.readItem(made.product, made.id).answer).toBe('Which Thursday?');
  });

  it('comes to the sender\'s Needs you when they write, and goes when the sender answers', async () => {
    const made = await give();
    await dev.service.syncNow();
    await say(dev, dev.row('Book Dr. Ames'), 'Which Thursday?');
    await bothSync();
    const product = maya.productOf(made.product);
    let r = maya.store.readItem(made.product, made.id);
    expect(inMyInbox(r, product, maya.personId)).toBe(true);
    await say(maya, r, 'The 6th.');
    await bothSync();
    r = maya.store.readItem(made.product, made.id);
    expect(inMyInbox(r, product, maya.personId)).toBe(false);
    const held = dev.facts('Book Dr. Ames');
    expect(held.r.answer).toBe('The 6th.');
    expect(inMyInbox(held.r, held.product, dev.personId)).toBe(true);
  });

  it('the row says who wrote, and is unread, until the sender opens it', async () => {
    const made = await give();
    await dev.service.syncNow();
    const nameOf = () => 'Dev';
    let r = maya.store.readItem(made.product, made.id);
    const product = maya.productOf(made.product);
    expect(taskWords(r, product, maya.personId, nameOf)).toMatchObject({ word: 'With Dev', unread: false });
    await say(dev, dev.row('Book Dr. Ames'), 'Which Thursday?');
    await bothSync();
    r = maya.store.readItem(made.product, made.id);
    expect(taskWords(r, product, maya.personId, nameOf)).toMatchObject({ word: 'Dev wrote back', unread: true });
    const at = taskNewsAt(r, maya.personId);
    expect(at).toBe(r.wrote.answer.ts);
    expect(isUnread(r, {}, at - 1, maya.personId)).toBe(true);
    expect(isUnread(r, { [r.id]: at + 1 }, 0, maya.personId)).toBe(false);
  });

  it('your own reply is not news to you', async () => {
    await give();
    await dev.service.syncNow();
    await say(dev, dev.row('Book Dr. Ames'), 'On it.');
    const r = dev.row('Book Dr. Ames');
    expect(taskNewsAt(r, dev.personId)).toBeLessThan(r.wrote.answer.ts);
  });

  it('the row reads as from the sender to the person who holds it', async () => {
    await give();
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    expect(taskWords(r, product, dev.personId, () => 'Maya')).toMatchObject({ word: 'From Maya' });
  });

  // THE CASE THAT MUST NOT MATCH: a message is what it always was.
  it('leaves a message handing back and forth as it always did', async () => {
    await maya.on(() => maya.service.message(dev.personId, 'Lunch?'));
    await dev.service.syncNow();
    const { r, product } = dev.facts('Lunch?');
    expect(isGivenTask(r, product)).toBe(false);
    expect(handedOnByReply(r, product, dev.personId)).toBe(maya.personId);
    expect(inMyInbox(r, product, dev.personId)).toBe(true);
    await say(dev, r, 'Yes.');
    const after = dev.facts('Lunch?');
    expect(inMyInbox(after.r, after.product, dev.personId)).toBe(false);
    expect(iSpokeLast(after.r, after.product, dev.personId)).toBe(true);
    expect(taskWords(after.r, after.product, dev.personId, () => 'Maya')).toBeNull();
  });
});

describe('a task and the conversation stay apart', () => {
  it('a message after a task opens the conversation, not the task', async () => {
    const task = await give();
    await maya.on(() => maya.service.message(dev.personId, 'Unrelated: lunch?'));
    expect(maya.store.readItem(task.product, task.id).answer ?? null).toBeNull();
    const convo = maya.service.conversation(dev.personId);
    expect(convo.id).not.toBe(task.id);
    expect(convo.product).toBe(task.product);
  });

  it('a task after a message does not write on the conversation', async () => {
    const said = await maya.on(() => maya.service.message(dev.personId, 'Lunch?'));
    const task = await give();
    expect(task.id).not.toBe(said.id);
    expect(task.product).toBe(said.product);
    expect(maya.store.readItem(said.product, said.id).answer ?? null).toBeNull();
    expect(maya.service.conversation(dev.personId).id).toBe(said.id);
  });

  it('the window\'s conversation list and message line leave a task out', async () => {
    const task = await give();
    const products = maya.store.listProducts();
    const items = maya.store.listItems();
    const product = maya.productOf(task.product);
    const r = items.find((i) => i.id === task.id);
    expect(messageLine(r, product, maya.personId)).toBeNull();
    expect(conversationWith(dev.personId, { products, items, me: maya.personId })).toBeNull();
    expect(directConversations({ items, products, me: maya.personId, people: new Map(), waiting: new Set() })).toEqual([]);
  });
});

describe('done', () => {
  it('their done shows on the sender\'s copy and takes it off both lists', async () => {
    const made = await give();
    await dev.service.syncNow();
    const r = dev.row('Book Dr. Ames');
    await dev.on(() => dev.store.answerItem(r.product, r.id, { status: 'done' }));
    await bothSync();
    const seen = maya.store.readItem(made.product, made.id);
    expect(seen.status).toBe('done');
    expect(inMyInbox(seen, maya.productOf(made.product), maya.personId)).toBe(false);
    const held = dev.facts('Book Dr. Ames');
    expect(inMyInbox(held.r, held.product, dev.personId)).toBe(false);
  });

  it('the sender\'s done closes it for both', async () => {
    const made = await give();
    await dev.service.syncNow();
    await maya.on(() => maya.store.answerItem(made.product, made.id, { status: 'done' }));
    await bothSync();
    const held = dev.facts('Book Dr. Ames');
    expect(held.r.status).toBe('done');
    expect(inMyInbox(held.r, held.product, dev.personId)).toBe(false);
  });
});

describe('what a teammate\'s line may set', () => {
  const opening = { id: 'w-1', ts: 1, by: 'x', uid: 'u', source: 'system', patch: { kind: 'directive', title: 't', labels: ['founder', GIVEN_TASK], priority: 9 } };

  it('keeps only the task\'s mark from the labels on the line that opens the row', () => {
    expect(whatATeammateMaySet(opening, { direct: true }).patch.labels).toEqual([GIVEN_TASK]);
  });

  it('cannot turn a row into a task afterwards', () => {
    const later = { ...opening, patch: { labels: [GIVEN_TASK], answer: 'hi' } };
    expect(whatATeammateMaySet(later, { direct: true }).patch.labels).toBeUndefined();
  });

  it('carries the due day in a message record and nowhere else', () => {
    const due = { ...opening, patch: { due: '2026-11-04' } };
    expect(whatATeammateMaySet(due, { direct: true }).patch.due).toBe('2026-11-04');
    expect(whatATeammateMaySet(due, { direct: false })).toBeNull();
    expect(whatATeammateMaySet(opening, { direct: false })).toBeNull();
  });
});

describe('giving it to an agent', () => {
  const view = (mac) => ({ me: mac.personId, byId: new Map([[maya.personId, { id: maya.personId, name: 'Maya Chen' }], [dev.personId, { id: dev.personId, name: 'Dev Rao' }]]), products: new Map(mac.store.listProducts().map((p) => [p.slug, p])), state: {} });

  it('is offered to the person who holds it, and only that', async () => {
    await give();
    await dev.service.syncNow();
    expect(teamRouteChoices(dev.row('Book Dr. Ames'), view(dev))).toEqual([{ route: 'agent', label: 'Give it to an agent' }]);
    expect(teamRouteChoices(maya.row('Book Dr. Ames'), view(maya))).toEqual([]);
  });

  it('the brief and files leave the task as a new thread would take them', async () => {
    await give({ files: [{ name: 'layout.png', dataBase64: PNG }] });
    await dev.service.syncNow();
    const { r, product } = dev.facts('Book Dr. Ames');
    const out = dev.service.taskBrief(r.product, r.id);
    expect(out.body).toContain('Book Dr. Ames for the group class.');
    expect(out.body).not.toContain('attachments/');
    expect(out.files).toEqual([expect.objectContaining({ name: 'layout.png', srcPath: expect.stringContaining(product.dir) })]);
    // And the task itself has not moved.
    expect(dev.row('Book Dr. Ames').assignee).toBe(dev.personId);
  });
});

describe('a thread can be handed on', () => {
  async function aThread() {
    const product = await maya.on(() => maya.store.createProduct?.({ name: 'Lumen app' }));
    const slug = product?.slug ?? 'lumen-app';
    if (!product) {
      const dir = path.join(maya.accountRoot, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Lumen app', slug }));
    }
    const dir = maya.productOf(slug).dir;
    fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'attachments', 'sketch.png'), 'the sketch');
    fs.writeFileSync(path.join(dir, 'designs', 'final.html'), '<h1>the design</h1>');
    const made = await maya.on(() => maya.store.composeItem(slug, {
      title: 'Old name', body: 'Make the booking page.\n\n![sketch](attachments/sketch.png)', priority: 7, due: '2026-11-04',
    }));
    await maya.on(() => disk.updateWorkItem(dir, made.id, { label: 'Final booking design' }, { source: 'founder' }));
    disk.updateWorkItem(dir, made.id, { result: 'Finished. The design is at `designs/final.html`.' }, { source: 'agent' });
    return { slug, id: made.id, dir };
  }

  it('sends the new title, the brief, priority, due day and the files', async () => {
    const t = await aThread();
    await maya.on(() => maya.service.handOn({ product: t.slug, id: t.id, to: dev.personId }));
    await dev.service.syncNow();
    expect(dev.row('Old name')).toBeUndefined();
    const { r, product } = dev.facts('Final booking design');
    expect(isGivenTask(r, product)).toBe(true);
    expect(r.assignee).toBe(dev.personId);
    expect(r.priority).toBe(7);
    expect(r.due).toBe('2026-11-04');
    expect(r.body).toContain('Make the booking page.');
    const named = [...r.body.matchAll(/\(attachments\/([^)]+)\)/g)].map((m) => m[1]);
    expect(named).toHaveLength(2);
    const held = named.map((n) => fs.readFileSync(path.join(product.dir, 'attachments', n), 'utf8')).sort();
    expect(held).toEqual(['<h1>the design</h1>', 'the sketch']);
    // No link is left pointing at a file only Maya's Mac has.
    expect(r.body).not.toContain('(attachments/sketch.png)');
    expect(r.body).not.toContain('designs/final.html');
  });

  // Found on screen: a one-line thread has no body, so a rename left the task
  // with neither the words nor the file those words named.
  it('keeps the words and files of a one-line thread that was renamed', async () => {
    const t = await aThread();
    const made = await maya.on(() => maya.store.composeItem(t.slug, { title: 'Finish it. The design is at designs/final.html' }));
    await maya.on(() => disk.updateWorkItem(t.dir, made.id, { label: 'New name' }, { source: 'founder' }));
    await maya.on(() => maya.service.handOn({ product: t.slug, id: made.id, to: dev.personId }));
    await dev.service.syncNow();
    const { r, product } = dev.facts('New name');
    expect(r.body).toContain('Finish it.');
    const name = r.body.match(/\(attachments\/([^)]+)\)/)[1];
    expect(fs.readFileSync(path.join(product.dir, 'attachments', name), 'utf8')).toBe('<h1>the design</h1>');
  });

  it('closes on the sender\'s side saying who has it', async () => {
    const t = await aThread();
    await maya.on(() => maya.service.handOn({ product: t.slug, id: t.id, to: dev.personId }));
    const old = maya.store.readItem(t.slug, t.id);
    expect(old.status).toBe('done');
    expect(old.answer).toContain('Dev Rao');
    expect(mayRunHere(old, maya.productOf(t.slug), maya.personId)).toBe(true);
    expect(disk.readWorkItems(maya.productOf(t.slug).dir).find((i) => i.id === t.id).status).toBe('done');
  });

  it('says so when a file is too big to go', async () => {
    const t = await aThread();
    fs.writeFileSync(path.join(t.dir, 'designs', 'huge.html'), Buffer.alloc(11 * 1024 * 1024));
    disk.updateWorkItem(t.dir, t.id, { result: 'See `designs/huge.html`.' }, { source: 'agent' });
    await maya.on(() => maya.service.handOn({ product: t.slug, id: t.id, to: dev.personId }));
    await dev.service.syncNow();
    expect(dev.row('Final booking design').body).toMatch(/huge\.html.*over 10 MB/);
  });

  it('refuses a conversation, a person off the team and themselves, and closes nothing', async () => {
    const t = await aThread();
    const said = await maya.on(() => maya.service.message(dev.personId, 'Lunch?'));
    await expect(maya.on(() => maya.service.handOn({ product: said.product, id: said.id, to: jordan.personId }))).rejects.toThrow();
    await expect(maya.on(() => maya.service.handOn({ product: t.slug, id: t.id, to: 'nobody' }))).rejects.toThrow(/not on your team/);
    await expect(maya.on(() => maya.service.handOn({ product: t.slug, id: t.id, to: maya.personId }))).rejects.toThrow();
    expect(maya.store.readItem(t.slug, t.id).status).not.toBe('done');
  });

  it('lists people in the menu and the command bar', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, give: true }).map((r) => r.label)).toContain('Give it to someone else…');
    expect(threadMenuRows({ change: false, terminal: null, finish: true }).map((r) => r.label)).not.toContain('Give it to someone else…');
    const rows = threadCommands({ give: [{ id: 'u-dev', name: 'Dev' }, { id: 'u-jo', name: 'Jordan' }] });
    expect(rows.map((r) => r.label)).toEqual(['Give it to Dev', 'Give it to Jordan']);
    expect(rows[0].does).toEqual({ act: 'give', to: 'u-dev', name: 'Dev' });
  });

  it('offers no person on a conversation, a stranger\'s thread, or yourself', () => {
    const people = [{ id: 'me', name: 'Maya Chen' }, { id: 'u-dev', name: 'Dev Rao' }];
    const shape = (over) => ({ id: 'w-1', status: 'open', createdBy: 'me', ...over });
    expect(giveRows(shape({}), { me: 'me', people, product: { slug: 'a' } }).map((p) => p.name)).toEqual(['Dev']);
    expect(giveRows(shape({}), { me: 'me', people, product: { team: { direct: true } } })).toEqual([]);
    expect(giveRows(shape({ createdBy: 'u-dev' }), { me: 'me', people, product: { team: { projectId: 'p' } } })).toEqual([]);
    expect(giveRows(shape({ status: 'done' }), { me: 'me', people, product: { slug: 'a' } })).toEqual([]);
    expect(giveRows(shape({ agent: { id: 'x' } }), { me: 'me', people, product: { slug: 'a' } })).toEqual([]);
  });
});

describe('a person\'s card', () => {
  it('publishes a task they hold with no words on it, and not one they gave', async () => {
    await give();
    await dev.service.syncNow();
    const onDev = cardsFor({ products: dev.store.listProducts(), readItems: (p) => disk.readWorkItems(p.dir), since: 0, me: dev.personId });
    expect(onDev).toEqual([expect.objectContaining({ title: null, project: null, state: 'waiting', visible: true, people: null })]);
    const onMaya = cardsFor({ products: maya.store.listProducts(), readItems: (p) => disk.readWorkItems(p.dir), since: 0, me: maya.personId });
    expect(onMaya).toEqual([]);
  });

  it('stops publishing it once it is done, and never publishes a message', async () => {
    await maya.on(() => maya.service.message(dev.personId, 'Lunch?'));
    await give();
    await dev.service.syncNow();
    const r = dev.row('Book Dr. Ames');
    await dev.on(() => dev.store.answerItem(r.product, r.id, { status: 'done' }));
    expect(cardsFor({ products: dev.store.listProducts(), readItems: (p) => disk.readWorkItems(p.dir), since: 0, me: dev.personId })).toEqual([]);
  });

  const people = [{ id: 'me', name: 'Maya', avatarUrl: null }, { id: 'dev', name: 'Dev', avatarUrl: null }];
  const card = (over) => ({ threadId: 't', personId: 'dev', state: 'waiting', title: null, updatedAt: 1, ...over });
  const devCard = (args) => buildMembers({ me: people[0], people, ...args }).find((m) => m.key === 'person:dev');

  // Then: a tester read "4 in progress" over a list with two In progress rows,
  // and Everyone had put the tasks under To do. A task not under way is to do.
  it('counts what is under way as in progress, and a task held but not under way as to do, once each', () => {
    const m = devCard({
      cards: [card({ threadId: 'a' }), card({ threadId: 'b', state: 'running' }), card({ threadId: 'c', state: 'done' }), card({ threadId: 'd', state: 'scheduled' })],
      tasksHeld: new Map([['dev', ['a', 'e']]]),
    });
    expect(m.inProgress).toBe(2);
    expect(m.toDo).toBe(1);
    expect(statusWord(m)).toBe('2 in progress · 1 to do');
    expect(statusWord(devCard({ tasksHeld: new Map([['dev', ['e']]]) }))).toBe('1 to do');
  });

  // Found on screen: the card published no title, so it drew as an empty box.
  it('draws the task by name to the person who gave it, and as a task to anyone else', () => {
    const c = card({ threadId: 'a', project: null });
    expect(namedCards([c], [{ id: 'a', title: 'Old', label: 'Book Dr. Ames' }])[0]).toMatchObject({ title: 'Book Dr. Ames', project: 'Task' });
    expect(namedCards([c], [])[0]).toMatchObject({ title: 'A task', project: 'Task' });
    const shared = card({ threadId: 'b', title: 'Theirs', project: 'App' });
    expect(namedCards([shared], [])[0]).toBe(shared);
  });

  // 2026-10-30: "Not running" read as broken; an idle AI teammate is Free.
  it('says nothing in progress for a person, and free for an AI teammate', () => {
    expect(statusWord(devCard({}))).toBe('Nothing in progress');
    const mate = buildMembers({ me: people[0], people, teammates: [{ id: 'ai', name: 'Scout', letter: 'S', role: null, now: null, status: 'active', paused: false }] }).find((m) => m.kind === 'mate');
    expect(statusWord(mate)).toBe('Free');
    expect(statusWord({ ...mate, agents: 2 })).toBe('Working');
  });

  const onWall = (agents) => ({ id: 'dev', name: 'Dev', me: false, avatarUrl: null, agents, level: null, workingOn: null, workingPrivate: false, status: null });

  it('still says agents when agents are all of it, and the tasks they hold beside it', () => {
    expect(statusWord(devCard({ wall: [onWall(2)] }))).toBe('2 agents working');
    expect(statusWord(devCard({ wall: [onWall(2)], tasksHeld: new Map([['dev', ['a', 'b', 'c']]]) }))).toBe('2 agents working · 3 to do');
    expect(isBusy('2 agents working · 3 to do')).toBe(true);
    expect(isBusy('2 in progress · 1 to do')).toBe(false);
  });

  it('draws a teammate\'s waiting thread under In progress where the board has no Waiting column', () => {
    const cards = [{ ...card({ threadId: 'a', title: 'Waiting one', visible: true }), personId: 'dev' }];
    const args = { items: [], products: [], display: DEFAULT_DISPLAY.team, cards, picked: ['dev'], me: 'me', now: 10, since: null };
    const without = boardColumns({ ...args, order: ['running', 'scheduled', 'done'] });
    expect(without.find((c) => c.state === 'running').rows.map((e) => e.title)).toEqual(['Waiting one']);
    const withIt = boardColumns({ ...args, order: ['waiting', 'running', 'scheduled', 'done'] });
    expect(withIt.find((c) => c.state === 'waiting').rows.map((e) => e.title)).toEqual(['Waiting one']);
    expect(withIt.find((c) => c.state === 'running').rows).toEqual([]);
  });
});

describe('on the sender\'s own board', () => {
  it('is an entry that reads as the task, not as a message', async () => {
    const made = await give();
    const items = maya.store.listItems();
    const out = teamEntries({
      items, products: maya.store.listProducts(), cards: [], me: maya.personId, now: Date.now(),
      stateOf: () => 'running', allMine: true, nameOf: () => 'Dev',
    });
    const e = out.find((x) => x.item?.id === made.id);
    expect(e.title).toBe('Book Dr. Ames');
    expect(e.message).toBeUndefined();
    expect(e.task).toMatchObject({ word: 'With Dev' });
  });
});
