// ASKING A TEAMMATE ABOUT A THREAD SAYS WHAT YOU WANT AND WHICH STEP (2026-11-20).
//
// Synthetic team run, three findings:
// - A junior engineer's Codex thread stopped on "Where should idempotency keys
//   be stored?". Share… › Send to Theo sent it at once: no note, no step, a
//   toast "Sent to Theo". Her row then said Answered, and nothing on it said
//   Theo had it. Theo's inbox line was the thread's name and nothing else.
// - A designer gave a thread to Lena with a note ("send it back when built").
//   Her thread said only "Given to Lena Fischer." and went to Done, so she
//   could not see her note or where it would come back.
// - Share's Send and More actions › Give it to someone else were two doors to
//   the same question, with different sheets.
// Now one sheet asks what you want: Help with this step, Review and send back,
// or Hand it over, with a note. Help and review leave the thread yours,
// waiting on them in Later with your note on its row, and it comes back when
// they write or comment. Theo's line says what was asked and the note, and
// the link opens his copy at the step. A hand-over keeps the note on the thread.
// Measured on the rules, the fold, the drawn sheet and the in-memory cloud.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { askWords, askedNow, askedPatch, askedSaid, latestStep, linkAtStep, stepLine, wantFirst } from '../shared/thread-ask.mts';
import { endedWaits, personWait, waitWords } from '../shared/thread-waits.mts';
import { threadOfLink, threadLink } from '../shared/thread-link.mts';
import { buildLine, foldWorkItems } from '../shared/work-items.mts';
import { belongsInInbox, waitsInLater } from '../renderer/src/list-rules.ts';
import { handedTo, messageLine } from '../renderer/src/threads/page-rules.ts';
import { SendSheet, ShareList } from '../renderer/src/threads/SharePanel.tsx';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const QUESTION = 'I checked the handler.\n\n**Where should idempotency keys be stored?**\n\n## Options\n1. Postgres table (recommended)\n2. Redis with a TTL';
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the step a help ask points at', () => {
  it('is the agent\'s newest words, at their question', () => {
    expect(latestStep({ result: QUESTION, wrote: { result: { ts: 50 } } })).toEqual({ at: 50, words: 'Where should idempotency keys be stored?' });
  });
  it('is the newer of the answer and the note', () => {
    expect(latestStep({ result: 'Old?', note: 'Picked Postgres, carrying on.', wrote: { result: { ts: 1 }, note: { ts: 2 } } })).toEqual({ at: 2, words: 'Picked Postgres, carrying on.' });
  });
  it('is the first line when nothing is asked, cut short when long', () => {
    expect(latestStep({ result: 'Done. Tests pass.', wrote: { result: { ts: 3 } } })?.words).toBe('Done. Tests pass.');
    expect(latestStep({ result: 'x'.repeat(400), wrote: { result: { ts: 3 } } })?.words).toHaveLength(140);
  });
  it('is nothing before the agent has said anything', () => {
    expect(latestStep({})).toBeNull();
    expect(latestStep({ result: '   ', wrote: { result: { ts: 3 } } })).toBeNull();
  });
  it('starts the sheet on help only when the step asks something', () => {
    expect(wantFirst({ at: 1, words: 'Where should idempotency keys be stored?' })).toBe('help');
    expect(wantFirst({ at: 1, words: 'Done. Tests pass.' })).toBeNull();
    expect(wantFirst(null)).toBeNull();
  });
});

describe('the link to a step', () => {
  const link = threadLink('p-maya', 'w-1')!;
  it('carries the step, and still reads as the thread', () => {
    expect(linkAtStep(link, { at: 1763600000000, words: 'x' })).toBe('https://app.agentbox.ac/t/p-maya/w-1?at=1763600000000');
    expect(threadOfLink('https://app.agentbox.ac/t/p-maya/w-1?at=1763600000000')).toEqual({ owner: 'p-maya', id: 'w-1', at: 1763600000000 });
  });
  it('is the plain link with no step, and a step that is not a time is dropped', () => {
    expect(linkAtStep(link, null)).toBe(link);
    expect(threadOfLink(link)).toEqual({ owner: 'p-maya', id: 'w-1' });
    expect(threadOfLink(`${link}?at=soon`)).toEqual({ owner: 'p-maya', id: 'w-1' });
  });
  it('lands on the message written by then, on the teammate\'s copy', () => {
    const events = [
      { at: 10, who: 'you', message: true, uid: 'u-ask' },
      { at: 20, kind: 'work' },
      { at: 50, who: 'agent', message: true },
      { at: 90, who: 'agent', message: true, uid: 'u-later' },
    ];
    expect(stepLine(events, 50)).toBe('at-50');
    expect(stepLine(events, 60)).toBe('at-50');
    expect(stepLine(events, 95)).toBe('u-later');
    expect(stepLine(events, 5)).toBeNull();
  });
});

describe('what the teammate gets', () => {
  const link = 'https://app.agentbox.ac/t/p-maya/w-1';
  const step = { at: 50, words: 'Where should idempotency keys be stored?' };
  it('help: what you want and the note first, then the link at the step, then the step', () => {
    expect(askWords({ want: 'help', title: 'Idempotency key for POST appointments', link, note: ' could you look at this question? ', step })).toBe(
      'Help with this step: could you look at this question?\n\n[Idempotency key for POST appointments](https://app.agentbox.ac/t/p-maya/w-1?at=50)\n\n> Where should idempotency keys be stored?',
    );
  });
  it('review: the whole thread, no step', () => {
    expect(askWords({ want: 'review', title: 'Empty state', link, note: 'Check the copy', step })).toBe('Review and send back: Check the copy\n\n[Empty state](https://app.agentbox.ac/t/p-maya/w-1)');
  });
  it('with no note the line names the thread', () => {
    expect(askWords({ want: 'help', title: 'Idempotency [v2]', link, note: '', step: null }).split('\n')[0]).toBe('Help with this step: Idempotency v2');
  });
});

describe('the thread you asked about', () => {
  const at = 1_000_000;
  const asked = (o = {}) => ({
    id: 'w-1', status: 'open', labels: ['founder'], result: QUESTION, ...askedPatch(['p-theo'], askedSaid('help', 'Theo', 'could you look at this question?'), at, 'help'),
    wrote: { result: { source: 'agent', ts: at - 10 }, blockedBy: { source: 'founder', ts: at }, asked: { source: 'founder', ts: at } }, ...o,
  });
  it('waits on them in Later, not Answered in Needs you, saying who has it', () => {
    expect(waitsInLater(asked(), [])).toBe(true);
    expect(belongsInInbox(asked(), { now: at + 1 })).toBe(false);
    expect(waitWords(asked(), { nameOf: () => 'Theo Park' })?.word).toBe('Waits on Theo');
  });
  it('shows your note while that wait is on', () => {
    expect(askedNow(asked())).toBe('Asked Theo for help with this step: could you look at this question?');
    expect(askedSaid('review', 'Lena', '')).toBe('Sent to Lena to review and send back');
  });
  it('drops the note once the wait ends, or is changed after', () => {
    expect(askedNow(asked({ blockedBy: [] }))).toBeNull();
    expect(askedNow(asked({ wrote: { blockedBy: { source: 'founder', ts: at + 5 }, asked: { source: 'founder', ts: at } } }))).toBeNull();
    expect(askedNow(asked({ status: 'done' }))).toBeNull();
  });
  it('keeps what was asked on the ledger', () => {
    const id = 'w-0000000001';
    const out = foldWorkItems([
      buildLine({ id, patch: { title: 'Idempotency', status: 'open' }, source: 'founder', now: at - 9 }),
      buildLine({ id, patch: askedPatch(['p-theo'], 'Asked Theo for help with this step', at, 'help'), source: 'founder', now: at }),
    ], at);
    const item = (Array.isArray(out) ? out : [...out.values()]).find((i: { id: string }) => i.id === id);
    expect(item.asked).toEqual({ said: 'Asked Theo for help with this step', at, want: 'help' });
    expect(askedNow(item)).toBe('Asked Theo for help with this step');
  });
});

describe('it comes back when they answer', () => {
  const at = 1_000_000;
  const waiting = (o = {}) => ({ id: 'w-1', status: 'open', blockedBy: [personWait('p-theo')], wrote: { blockedBy: { source: 'founder', ts: at } }, ...o });
  const ctx = { items: [], cards: [], lastWordFrom: () => 0, nameOf: () => 'Theo Park', now: at + 100 };
  it('on their comment on the thread', () => {
    expect(endedWaits([waiting({ waitingComments: [{ by: 'p-theo', ts: at + 5, text: 'Postgres' }] })], ctx)[0]?.said).toBe('Theo commented');
  });
  it('not on someone else\'s comment, or one from before you asked', () => {
    expect(endedWaits([waiting({ waitingComments: [{ by: 'p-jun', ts: at + 5, text: 'hm' }] })], ctx)).toEqual([]);
    expect(endedWaits([waiting({ waitingComments: [{ by: 'p-theo', ts: at - 5, text: 'old' }] })], ctx)).toEqual([]);
  });
  it('still on a message to you', () => {
    expect(endedWaits([waiting()], { ...ctx, lastWordFrom: () => at + 1 })[0]?.said).toBe('Theo wrote to you');
  });
});

describe('the sheet', () => {
  const THEO = { id: 'p-theo', name: 'Theo Park', email: 'theo@lumen.test', avatarUrl: null };
  const JUN = { id: 'p-jun', name: 'Jun Ito', email: 'jun@lumen.test', avatarUrl: null };
  const step = { at: 50, words: 'Where should idempotency keys be stored?' };
  const sheet = (o = {}) => renderToStaticMarkup(h(SendSheet, { people: [THEO, JUN], start: ['p-theo'], link: true, onCopy() {}, onSend() {}, step, want: 'help', wants: ['help', 'review', 'hand'], ...o }));
  it('asks what you want, with the step and a note, and says what the button does', () => {
    const html = sheet();
    for (const w of ['Help with this step', 'Review and send back', 'Hand it over']) expect(html).toContain(w);
    expect(html).toContain('aria-pressed="true"');
    expect(text(html)).toContain('Where should idempotency keys be stored?');
    expect(html).toContain('placeholder="Add a note"');
    expect(text(html)).toContain('Ask for help');
  });
  it('shows no step for a review, and the button says so', () => {
    const html = sheet({ want: 'review' });
    expect(text(html)).not.toContain('Where should idempotency keys be stored?');
    expect(text(html)).toContain('Send for review');
  });
  it('hands over to one person only, by name', () => {
    expect(text(sheet({ want: 'hand' }))).toContain('Give to Theo');
    expect(sheet({ want: 'hand', start: ['p-theo', 'p-jun'] })).toMatch(/<button[^>]*disabled=""[^>]*>Give to/);
  });
  it('with nothing picked it just sends the link, as before', () => {
    expect(text(sheet({ want: null }))).toContain('Send to inbox');
    expect(sheet({ want: null })).not.toContain('aria-pressed="true"');
  });
  it('offers hand over only where the thread can be given', () => {
    expect(sheet({ wants: ['help', 'review'] })).not.toContain('Hand it over');
  });
  it('Send to Theo opens the sheet rather than sending at once', () => {
    const list = renderToStaticMarkup(h(ShareList, { link: true, first: THEO, others: true, seen: 'Team', onCopy() {}, onSendFirst() {}, onSendOther() {}, onSee() {} }));
    expect(text(list)).toContain('Send to Theo…');
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).not.toContain("onSendTo?.([first.id], '')");
    expect(menu).not.toContain("onSendTo?.([id], '')");
    expect(menu).not.toContain('GiveSheet');
  });
});

describe('on two copies of the app', () => {
  async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-teammate-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
    return { personId, store, service };
  }
  let maya: Awaited<ReturnType<typeof aMac>>;
  let theo: Awaited<ReturnType<typeof aMac>>;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Lin' }));
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Park' }));
    await maya.service.signIn();
    await maya.service.createTeam('Northwind');
    await maya.service.invite('theo@nw.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(maya.service.state().team.id);
    disk.setLineAuthor(maya.personId);
  });
  afterEach(async () => { disk.setLineAuthor(null); await maya.service.signOut(); await theo.service.signOut(); });

  it('Theo\'s inbox line says who asked, what for, and the note', async () => {
    const link = threadLink(maya.personId, 'w-0000000abc')!;
    await maya.service.message(theo.personId, askWords({ want: 'help', title: 'Idempotency key for POST appointments', link, note: 'could you look at this question?', step: { at: 50, words: 'Where?' } }));
    for (let k = 0; k < 2; k += 1) { await maya.service.syncNow(); await theo.service.syncNow(); }
    const products = theo.store.listProducts();
    const row = theo.store.listItems().find((i) => products.find((p) => p.slug === i.product)?.team?.direct);
    const line = messageLine(row, products.find((p) => p.slug === row.product), theo.personId, () => 'Maya');
    expect(line).toMatchObject({ people: [maya.personId], fromMe: false, text: 'Help with this step: could you look at this question?' });
  });

  it('neither an ask nor a hand-over makes a second thread on the sender\'s side', async () => {
    const threadsOf = () => maya.store.listItems().filter((i) => !maya.store.listProducts().find((p) => p.slug === i.product)?.team?.direct);
    const t = maya.store.composeItem('api', { title: 'Idempotency key for POST appointments', body: 'Add a key.' });
    const before = threadsOf().map((i) => i.id).sort();
    await maya.service.message(theo.personId, askWords({ want: 'help', title: 'Idempotency key for POST appointments', link: threadLink(maya.personId, t.id)!, note: 'Look?', step: null }));
    await maya.service.handOn({ product: 'api', id: t.id, to: theo.personId, note: 'Yours now' });
    for (let k = 0; k < 2; k += 1) { await maya.service.syncNow(); await theo.service.syncNow(); }
    expect(threadsOf().map((i) => i.id).sort()).toEqual(before);
  });

  it('a hand-over keeps your note on the thread you gave', async () => {
    const t = maya.store.composeItem('api', { title: 'Empty state', body: 'Draw the empty state.' });
    await maya.service.handOn({ product: 'api', id: t.id, to: theo.personId, note: 'The Figma file is v3. Send it back when built.' });
    expect(maya.store.readItem('api', t.id).answer).toBe('Given to Theo Park: The Figma file is v3. Send it back when built.');
    expect(handedTo(maya.store.readItem('api', t.id))).toBe('Theo Park');
    const plain = maya.store.composeItem('api', { title: 'Other', body: 'x' });
    await maya.service.handOn({ product: 'api', id: plain.id, to: theo.personId });
    expect(maya.store.readItem('api', plain.id).answer).toBe('Given to Theo Park.');
  });

  it('the wait and the note are an edit the thread takes', async () => {
    const t = maya.store.composeItem('api', { title: 'Idempotency', body: 'Add an idempotency key.' });
    maya.store.threadEdit('api', t.id, askedPatch([theo.personId], 'Asked Theo for help with this step', Date.now(), 'help'));
    const row = maya.store.readItem('api', t.id);
    expect(row.blockedBy).toEqual([personWait(theo.personId)]);
    expect(askedNow(row)).toBe('Asked Theo for help with this step');
  });
});
