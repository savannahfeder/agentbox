// CONTINUING A TEAMMATE'S THREAD STARTS ONE OF YOUR OWN.
//
// What was missing: a teammate's shared thread could be read and commented on,
// and nothing more. To carry the work on you retyped the ask, pasted what was
// said and dragged the files across by hand, and the owner never knew. The
// owner asked for collaboration on threads, but a run on their account would
// have to run on their machine. So "Continue it yourself" seeds a thread of
// your own: the brief, the conversation quoted under each speaker, the files
// from the shared copy, and it tells the owner in one quiet line. Measured
// over the in-memory cloud through the real team service, three people.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';
import { CONTINUE_MESSAGES, CONTINUE_MESSAGE_CHARS } from '../main/team/continue-thread.mjs';
import { CONTINUED_NOTE, continuedFrom, continuedFromLabel } from '../shared/thread-continued.mjs';
import { itemThread } from '../renderer/src/item-thread';
import { canContinue, continueStart } from '../renderer/src/threads/continue-thread';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'continue-thread-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service, dir: path.join(accountRoot, 'website') };
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const lead = (mac, words, over = {}) => mac.store.composeItem('website', { title: words, body: words, visibility: 'team', ...over });
const answered = (mac, id, result) => mac.store.recordSessionResult('website', id, { result });

let cloud, maya, dev, jun, macs;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' }));
  dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@nw.test', name: 'Dev Rao' }));
  jun = await aMac(cloud, signUpMemory(cloud, { email: 'jun@nw.test', name: 'Jun Ito' }));
  macs = [maya, dev, jun];
  await maya.service.signIn();
  await maya.service.createTeam('Northwind');
  await maya.service.invite('dev@nw.test');
  await maya.service.invite('jun@nw.test');
  await dev.service.signIn();
  await dev.service.acceptInvite(maya.service.state().team.id);
  await jun.service.signIn();
  await jun.service.acceptInvite(maya.service.state().team.id);
  disk.setLineAuthor(maya.personId);
});
afterEach(async () => { for (const m of macs) await m.service.signOut(); });
const allSync = async () => { for (const m of macs) await m.service.syncNow(); };

describe('the seed', () => {
  it('carries the brief and the conversation, each message quoted under who said it', async () => {
    const item = lead(maya, 'Why is checkout slow?');
    answered(maya, item.id, 'The cart query has no index.\nAdding one should fix it.');
    await allSync();
    await jun.service.commentOnThread(maya.personId, item.id, 'Try the order table too');
    await allSync();

    const brief = await dev.service.continueBrief(maya.personId, item.id);
    expect(brief.title).toBe('Why is checkout slow?');
    // Its own first line, so the new thread is named after the one it carries on.
    expect(brief.body.startsWith('Why is checkout slow?\n\n')).toBe(true);
    expect(brief.body).toContain("Maya's thread");
    expect(brief.body).toContain('> Maya: Why is checkout slow?');
    expect(brief.body).toContain("> Maya's agent: The cart query has no index.\n> Adding one should fix it.");
    expect(brief.body).toContain('> Jun commented: Try the order table too');
    expect(brief.body.indexOf('Why is checkout slow?')).toBeLessThan(brief.body.indexOf('cart query'));
    expect(brief.from).toEqual({ personId: maya.personId, threadId: item.id });
  });

  it(`quotes the newest ${CONTINUE_MESSAGES} messages and says how many came before`, async () => {
    const item = lead(maya, 'message 1');
    for (let n = 2; n <= CONTINUE_MESSAGES + 3; n += 1) maya.store.answerItem('website', item.id, { answer: `message ${n}` });
    await allSync();
    const { body } = await dev.service.continueBrief(maya.personId, item.id);
    expect(body).not.toMatch(/: message 3\n/);
    expect(body).toContain(': message 4');
    expect(body).toContain(`: message ${CONTINUE_MESSAGES + 3}`);
    expect(body).toContain('3 earlier messages are not quoted');
  });

  it(`quotes exactly ${CONTINUE_MESSAGES} with nothing said about earlier ones`, async () => {
    const item = lead(maya, 'message 1');
    for (let n = 2; n <= CONTINUE_MESSAGES; n += 1) maya.store.answerItem('website', item.id, { answer: `message ${n}` });
    await allSync();
    const { body } = await dev.service.continueBrief(maya.personId, item.id);
    expect(body).toContain(': message 1');
    expect(body).not.toContain('earlier');
  });

  it('cuts a long message short rather than dropping it', async () => {
    const item = lead(maya, 'Long one');
    answered(maya, item.id, 'x'.repeat(CONTINUE_MESSAGE_CHARS * 3));
    await allSync();
    const { body } = await dev.service.continueBrief(maya.personId, item.id);
    expect(body).toContain(`${'x'.repeat(CONTINUE_MESSAGE_CHARS)}…`);
    expect(body).not.toContain('x'.repeat(CONTINUE_MESSAGE_CHARS + 1));
  });
});

describe('the files', () => {
  it('attaches the copies that came with the shared thread and names them in the words, with no dead links', async () => {
    fs.mkdirSync(path.join(maya.dir, 'designs'), { recursive: true });
    fs.writeFileSync(path.join(maya.dir, 'designs', 'cart.png'), PNG);
    fs.mkdirSync(path.join(maya.dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(maya.dir, 'docs', 'plan.md'), '# Plan');
    const item = lead(maya, 'Redo the cart');
    answered(maya, item.id, '![cart](designs/cart.png)\n\nThe plan is `docs/plan.md`.');
    await allSync();

    const { body, files } = await dev.service.continueBrief(maya.personId, item.id);
    expect(files.map((f) => f.name).sort()).toEqual(['cart.png', 'plan.md']);
    for (const f of files) expect(fs.existsSync(f.srcPath), f.srcPath).toBe(true);
    expect(fs.readFileSync(files.find((f) => f.name === 'cart.png').srcPath)).toEqual(PNG);
    for (const f of files) expect(f.srcPath.startsWith(dev.service.threadWork(maya.personId, item.id).dir)).toBe(true);
    expect(body).not.toContain('attachments/');
    expect(body).toContain('cart.png');
    expect(body).toContain('plan.md');
  });

  it('attaches nothing when the thread names no files', async () => {
    const item = lead(maya, 'Words only');
    await allSync();
    expect((await dev.service.continueBrief(maya.personId, item.id)).files).toEqual([]);
  });

  it('opens your own composer, to your agent, with the files and where it came from', async () => {
    const start = continueStart({ title: 'T', body: 'B', files: [{ name: 'cart.png', srcPath: '/x/cart.png' }, { name: 'plan.md', srcPath: '/x/plan.md' }], from: { personId: 'p', threadId: 'w-1' } });
    expect(start).toMatchObject({ to: 'agent', continueFrom: { personId: 'p', threadId: 'w-1' } });
    expect(start.body.startsWith('B')).toBe(true);
    expect(start.attachments).toEqual([
      { name: 'cart.png', srcPath: '/x/cart.png', image: true },
      { name: 'plan.md', srcPath: '/x/plan.md', image: false },
    ]);
  });
});

describe('who it is from', () => {
  it('the new thread carries a link back that reads as the owner and thread, and only that', () => {
    const label = continuedFromLabel('p-1', 'w-0123456789');
    expect(continuedFrom(['x', label])).toEqual({ personId: 'p-1', threadId: 'w-0123456789' });
    expect(continuedFrom(['handed-from:p-1'])).toBeNull();
    expect(continuedFrom(undefined)).toBeNull();
  });

  it("puts one quiet line on the owner's thread, which does not land in their Needs you", async () => {
    const item = lead(maya, 'Why is checkout slow?');
    await allSync();
    await dev.service.continuedThread(maya.personId, item.id);
    await allSync();

    const lines = maya.store.readHistory('website', item.id, { max: 1000 });
    const note = lines.filter((l) => l.patch?.comment);
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({ by: dev.personId, patch: { comment: { text: CONTINUED_NOTE } } });
    expect(maya.store.readItem('website', item.id).waitingComments ?? []).toEqual([]);

    const { events } = itemThread(lines, [], null, { whole: true });
    const quiet = events.filter((e) => e.kind === 'work' && /continued this/.test(e.verb));
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toMatchObject({ by: dev.personId, verb: 'continued this in their own thread' });
    expect(events.some((e) => e.kind !== 'work' && /continued this/i.test(e.text ?? ''))).toBe(false);
  });

  it('leaves an ordinary comment as a comment that waits on the owner', async () => {
    const item = lead(maya, 'Copy');
    await allSync();
    await dev.service.commentOnThread(maya.personId, item.id, 'Continued this in a thread of my own, sort of');
    await allSync();
    expect(maya.store.readItem('website', item.id).waitingComments).toHaveLength(1);
  });

  it('keeps notes on the shared files working after it is continued', async () => {
    fs.mkdirSync(path.join(maya.dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(maya.dir, 'docs', 'plan.md'), '# Plan');
    const item = lead(maya, 'Plan');
    answered(maya, item.id, 'See `docs/plan.md`.');
    await allSync();
    await dev.service.continuedThread(maya.personId, item.id);
    const file = dev.service.threadWork(maya.personId, item.id).lines.flatMap((l) => [...JSON.stringify(l.patch).matchAll(/attachments\/([\w.-]+)/g)].map((m) => m[1]))[0];
    await dev.service.markSharedFile(maya.personId, item.id, { do: 'note', id: 'n1', file, text: 'Good plan', place: { kind: 'pin', x: 0.5, y: 0.5 } });
    await allSync();
    const marks = maya.store.readHistory('website', item.id, { max: 1000 }).filter((l) => l.patch?.artifact);
    expect(marks).toMatchObject([{ by: dev.personId, patch: { artifact: { do: 'note', text: 'Good plan' } } }]);
    await dev.service.commentOnThread(maya.personId, item.id, 'And one more thing');
    await allSync();
    expect(maya.store.readItem('website', item.id).waitingComments).toMatchObject([{ text: 'And one more thing' }]);
  });
});

describe('what stays where it is', () => {
  it('refuses a private thread, and the window offers no button for one', async () => {
    const item = lead(maya, 'Mine alone', { visibility: 'private' });
    await allSync();
    await expect(dev.service.continueBrief(maya.personId, item.id)).rejects.toThrow(/not shared with you/);
    await expect(dev.service.continuedThread(maya.personId, item.id)).rejects.toThrow(/not shared with you/);
    expect(canContinue({ shared: false }, { personId: maya.personId }, dev.personId)).toBe(false);
  });

  it('refuses a thread made private after it was shared, and says nothing to its owner', async () => {
    const item = lead(maya, 'Going private');
    await allSync();
    await dev.service.continueBrief(maya.personId, item.id);
    maya.store.threadEdit('website', item.id, { visibility: 'private' });
    await allSync();
    await expect(dev.service.continueBrief(maya.personId, item.id)).rejects.toThrow(/not shared with you/);
    await expect(dev.service.continuedThread(maya.personId, item.id)).rejects.toThrow(/not shared with you/);
    expect(maya.store.readHistory('website', item.id, { max: 1000 }).some((l) => l.patch?.comment)).toBe(false);
  });

  it('refuses a thread shared with other people and not with you', async () => {
    const item = lead(maya, 'For Jun', { visibility: 'people', visibleTo: [jun.personId] });
    await allSync();
    expect(jun.service.threadWork(maya.personId, item.id).shared).toBe(true);
    await expect(dev.service.continueBrief(maya.personId, item.id)).rejects.toThrow(/not shared with you/);
  });

  it('offers nothing on your own thread: it is already yours to reply to', async () => {
    const item = lead(maya, 'My own');
    await allSync();
    await expect(maya.service.continueBrief(maya.personId, item.id)).rejects.toThrow(/yours/);
    expect(canContinue({ shared: true }, { personId: maya.personId }, maya.personId)).toBe(false);
    expect(canContinue({ shared: true }, { personId: maya.personId }, dev.personId)).toBe(true);
  });

  it("carries nothing that could run it on the owner's account: no engine, model, login or key", async () => {
    const item = lead(maya, 'Run it', { engine: 'codex', model: 'gpt-5' });
    answered(maya, item.id, 'Done.');
    await allSync();
    const brief = await dev.service.continueBrief(maya.personId, item.id);
    expect(Object.keys(brief).sort()).toEqual(['body', 'files', 'from', 'title']);
    expect(Object.keys(continueStart(brief)).sort()).toEqual(['attachments', 'body', 'continueFrom', 'to']);
    expect(JSON.stringify(brief)).not.toMatch(/codex|gpt-5|api[_-]?key|token/i);
  });
});
