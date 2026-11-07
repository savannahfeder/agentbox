// A THREAD SAYS WHAT IT WAITS ON, AND COMES BACK WHEN THAT ENDS.
//
// "'Blocked by' exists on a thread card but was 'Nothing'
// on everything I opened" (Dev, 03:05), and Dev's "Onboarding designs" row
// could not say it was held by Maya's decision. Nothing could set a wait, and
// nothing told the thread's owner when what it waited on finished. A wait with
// no end also breaks the repo's rule that nothing waits for ever, so a wait on a
// person comes back on its own after three days.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { personWait, cardWait, waitParts, setByPerson, endedWaits, waitWords, waitChoices, WAIT_GIVES_UP_MS } from '../shared/thread-waits.mjs';
import { belongsInInbox, waitsInLater } from '../renderer/src/list-rules.ts';
import { buildLine, foldWorkItems } from '../shared/work-items.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { threadCommands } from '../renderer/src/thread-commands.ts';
import { noticeEndedWaits } from '../main/team/waits.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateCard, TeammateStanding } from '../renderer/src/threads/Summary.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const now = new Date(2026, 9, 30, 15).getTime();
const at = now - 3_600_000;
const held = (on, o = {}) => ({
  id: 'w-1', product: 'lumen', title: 'Onboarding', status: 'open', labels: ['founder'], result: 'Done so far', blockedBy: on,
  wrote: { blockedBy: { source: 'founder', ts: at } }, ...o,
});
const names = { maya: 'Maya', dev: 'Dev' };
const ctx = (o = {}) => ({ items: [], cards: [], lastWordFrom: () => 0, nameOf: (id) => names[id] ?? 'Someone', now, ...o });

describe('what a wait names', () => {
  it('a person, a teammate’s thread, or a thread of mine', () => {
    expect(waitParts(personWait('maya'))).toEqual({ kind: 'person', person: 'maya' });
    expect(waitParts(cardWait('maya', 'w-9'))).toEqual({ kind: 'card', person: 'maya', thread: 'w-9' });
    expect(waitParts('w-9')).toEqual({ kind: 'thread', thread: 'w-9' });
  });
  it('fits the ledger’s limit with real ids', () => {
    const uuid = '7f3e2b10-1234-4abc-8def-1234567890ab';
    expect(cardWait(uuid, 'w-0123456789').length).toBeLessThanOrEqual(64);
  });
  it('is kept by the ledger, and what ended it too', () => {
    const id = 'w-0000000001';
    const lines = [
      buildLine({ id, patch: { title: 'a', status: 'open' }, source: 'founder', now: now - 9 }),
      buildLine({ id, patch: { blockedBy: [personWait('maya')] }, source: 'founder', now: now - 8 }),
      buildLine({ id, patch: { blockedBy: [], waitEnded: { said: 'Maya wrote to you', at: now } }, source: 'system', now: now - 7 }),
    ];
    const out = foldWorkItems(lines, now);
    const item = out.get ? out.get(id) : out.find((i) => i.id === id);
    expect(item.blockedBy).toEqual([]);
    expect(item.waitEnded).toEqual({ said: 'Maya wrote to you', at: now });
  });
});

describe('who set it decides what it does', () => {
  it('a person’s wait is the kind this file means', () => {
    expect(setByPerson(held(['w-9']))).toBe(true);
  });
  it('an agent’s wait keeps the old rule', () => {
    expect(setByPerson(held(['w-9'], { wrote: { blockedBy: { source: 'agent', ts: at } } }))).toBe(false);
  });
  it('no wait is no wait, and a finished thread waits on nothing', () => {
    expect(setByPerson(held([]))).toBe(false);
    expect(setByPerson(held(['w-9'], { status: 'done' }))).toBe(false);
  });
});

describe('while it waits', () => {
  it('it is out of Needs you and in Later', () => {
    const item = held([personWait('maya')]);
    expect(waitsInLater(item, [])).toBe(true);
    expect(belongsInInbox(item, { now })).toBe(false);
  });
  it('a teammate’s comment still reaches you', () => {
    expect(belongsInInbox(held([personWait('maya')], { waitingComments: [{ by: 'dev', ts: now, text: 'hi' }] }), { now })).toBe(true);
  });
  it('an agent asking you something still reaches you', () => {
    expect(belongsInInbox(held([personWait('maya')]), { now, asking: true })).toBe(true);
  });
  it('the row says who, in few words', () => {
    expect(waitWords(held([personWait('maya')]), ctx()).word).toBe('Waits on Maya');
    expect(waitWords(held([cardWait('dev', 'w-9')]), ctx({ cards: [{ personId: 'dev', threadId: 'w-9', title: 'Group bookings', state: 'running' }] })))
      .toMatchObject({ word: 'Waits on Dev', title: 'Waits on Dev’s “Group bookings”' });
    expect(waitWords(held(['w-9']), ctx({ items: [{ id: 'w-9', title: 'Stripe', status: 'open' }] }))).toMatchObject({ word: 'Waits on a thread', title: 'Waits on “Stripe”' });
    expect(waitWords(held([]), ctx())).toBeNull();
  });
});

describe('when it ends', () => {
  const one = (item, o) => endedWaits([item], ctx(o));
  it('my own thread finishing', () => {
    const [e] = one(held(['w-9']), { items: [{ id: 'w-9', product: 'lumen', title: 'Stripe', status: 'done' }] });
    expect(e.said).toBe('“Stripe” finished');
  });
  it('not while it is still open', () => {
    expect(one(held(['w-9']), { items: [{ id: 'w-9', product: 'lumen', title: 'Stripe', status: 'open' }] })).toEqual([]);
  });
  it('a teammate’s thread finishing, read off their card', () => {
    const [e] = one(held([cardWait('dev', 'w-9')]), { cards: [{ personId: 'dev', threadId: 'w-9', title: 'Group bookings', state: 'done' }] });
    expect(e.said).toBe('Dev finished “Group bookings”');
  });
  it('not while their card is still running', () => {
    expect(one(held([cardWait('dev', 'w-9')]), { cards: [{ personId: 'dev', threadId: 'w-9', title: 'x', state: 'running' }] })).toEqual([]);
  });
  it('a person writing to me after the wait was set', () => {
    expect(one(held([personWait('maya')]), { lastWordFrom: () => at + 1 })[0].said).toBe('Maya wrote to you');
  });
  it('not on something they wrote before it, or exactly as it was set', () => {
    expect(one(held([personWait('maya')]), { lastWordFrom: () => at - 1 })).toEqual([]);
    expect(one(held([personWait('maya')]), { lastWordFrom: () => at })).toEqual([]);
  });
  it('three days on it comes back saying it is still waiting, and a minute sooner it does not', () => {
    const old = (ts) => held([personWait('maya')], { wrote: { blockedBy: { source: 'founder', ts } } });
    expect(one(old(now - WAIT_GIVES_UP_MS))[0].said).toBe('Still waiting on Maya after 3 days');
    expect(one(old(now - WAIT_GIVES_UP_MS + 60_000))).toEqual([]);
  });
  it('a thread that has gone ends the wait rather than holding it for ever', () => {
    expect(one(held(['w-gone']))[0].said).toBe('The thread this waited on is gone');
  });
  it('waits on two things ends when both have', () => {
    const items = [{ id: 'a', product: 'lumen', status: 'done', title: 'A' }, { id: 'b', product: 'lumen', status: 'open', title: 'B' }];
    expect(one(held(['a', 'b']), { items })).toEqual([]);
    expect(one(held(['a', 'b']), { items: [items[0], { ...items[1], status: 'done' }] })).toHaveLength(1);
  });
  it('an agent’s wait is left to the supervisor, and a finished thread to nobody', () => {
    const items = [{ id: 'w-9', product: 'lumen', status: 'done', title: 'S' }];
    expect(one(held(['w-9'], { wrote: { blockedBy: { source: 'agent', ts: at } } }), { items })).toEqual([]);
    expect(one(held(['w-9'], { status: 'done' }), { items })).toEqual([]);
  });
});

describe('back in Needs you', () => {
  const back = (o = {}) => ({ id: 'w-1', status: 'open', labels: ['founder'], result: 'x', blockedBy: [], waitEnded: { said: 'Maya wrote to you', at }, wrote: { result: { source: 'agent', ts: at - 100 }, title: { source: 'founder', ts: at - 200 } }, ...o });
  it('it is there until they next act', () => {
    expect(belongsInInbox(back({ answer: 'go', wrote: { answer: { source: 'founder', ts: at - 50 } } }), { now })).toBe(true);
  });
  it('a reply takes it away', () => {
    expect(belongsInInbox(back({ answer: 'go', wrote: { answer: { source: 'founder', ts: at + 5 } } }), { now })).toBe(false);
  });
  it('marking it done takes it away', () => {
    expect(belongsInInbox(back({ status: 'done', wrote: { status: { source: 'founder', ts: at + 5 } } }), { now })).toBe(false);
  });
  it('a run under way keeps it In progress', () => {
    expect(belongsInInbox(back(), { now, live: true })).toBe(false);
  });
});

describe('the sync writes it once', () => {
  const run = (items, o = {}) => {
    const wrote = [];
    const n = noticeEndedWaits({
      products: [{ slug: 'lumen', dir: '/x' }, { slug: 'dm', dir: '/y', team: { direct: true, people: ['maya'] } }],
      read: (p) => (p.slug === 'lumen' ? items : [{ id: 'm1', product: 'dm', status: 'open', wrote: { answer: { by: 'maya', ts: o.wordAt ?? 0 } } }]),
      write: (dir, id, patch) => wrote.push({ dir, id, patch }),
      cards: o.cards ?? [], nameOf: (id) => names[id] ?? 'Someone', now,
    });
    return { n, wrote };
  };
  it('clears the wait and says what ended it', () => {
    const { n, wrote } = run([held(['w-9']), { id: 'w-9', product: 'lumen', title: 'Stripe', status: 'done' }]);
    expect(n).toBe(1);
    expect(wrote[0]).toEqual({ dir: '/x', id: 'w-1', patch: { blockedBy: [], waitEnded: { said: '“Stripe” finished', at: now } } });
  });
  it('reads a person’s word from your conversation with them', () => {
    expect(run([held([personWait('maya')])], { wordAt: at + 5 }).wrote[0].patch.waitEnded.said).toBe('Maya wrote to you');
    expect(run([held([personWait('maya')])], { wordAt: at - 5 }).n).toBe(0);
  });
  it('writes nothing while everything still waits', () => {
    expect(run([held(['w-9']), { id: 'w-9', product: 'lumen', status: 'open' }]).wrote).toEqual([]);
  });
  it('the supervisor leaves a person’s wait to it, and the team service runs it', () => {
    expect(readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8')).toMatch(/resumeFinishedWaits[\s\S]{0,1500}wrote\?\.blockedBy\?\.source === 'founder'/);
    expect(readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8')).toContain('noticeEndedWaits(');
  });
});

describe('where a person says it', () => {
  it('the thread’s menu has a row, and Ctrl+K a row for each choice', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, wait: true }).map((r) => r.label)).toContain('Waits on…');
    const rows = threadCommands({ waits: [{ id: personWait('maya'), label: 'Maya' }], waitsNow: true });
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Waits on Maya', 'Stop waiting']));
    expect(rows.find((r) => r.label === 'Waits on Maya').keywords).toMatch(/blocked/);
  });
  it('the choices are people, then my open threads and teammates’ cards, never itself or something finished', () => {
    const out = waitChoices({
      item: { id: 'w-1', product: 'lumen' }, me: 'dev',
      people: [{ id: 'dev', name: 'Dev' }, { id: 'maya', name: 'Maya Chen' }],
      items: [{ id: 'w-1', product: 'lumen', status: 'open', title: 'Me', updatedAt: 9 }, { id: 'w-2', product: 'lumen', status: 'open', title: 'Mine', updatedAt: 8 }, { id: 'w-3', product: 'lumen', status: 'done', title: 'Old', updatedAt: 9 }, { id: 'w-4', product: 'other', status: 'open', title: 'Elsewhere', updatedAt: 9 }],
      cards: [{ personId: 'maya', threadId: 't', visible: true, title: 'Deck', state: 'running', updatedAt: 7 }, { personId: 'maya', threadId: 'u', visible: true, title: 'Done', state: 'done', updatedAt: 7 }],
      nameOf: (id) => names[id] ?? 'Someone',
    });
    expect(out.map((c) => c.label)).toEqual(['Maya', 'Mine', 'Maya: Deck']);
    expect(out.map((c) => c.id)).toEqual([personWait('maya'), 'w-2', cardWait('maya', 't')]);
  });
  // Seen on screen: the card's head said "Waiting on Dev" over "Blocked by Maya".
  it('the head of a teammate’s thread says who it waits on, the same as its Blocked by', () => {
    const maya = { id: 'maya', name: 'Maya Chen', email: '', avatarUrl: null };
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'x', project: 'p', state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [{ id: personWait('maya'), title: null }], blocks: [], people: null, updatedAt: now };
    const draw = (part) => renderToStaticMarkup(createElement(TeamContext.Provider, { value: { me: 'dev', byId: new Map([['maya', maya]]), state: {}, products: new Map() } }, createElement(part, { card, person: { id: 'dev', name: 'Dev', email: '', avatarUrl: null }, now })));
    const html = draw(TeammateStanding);
    expect(html).toContain('Waits on Maya');
    expect(html).not.toContain('Waiting on Dev');
    expect(draw(TeammateCard)).toMatch(/Blocked by<\/span><p><span class="">Maya<\/span>/);
  });
  it('a teammate’s card names the wait without saying a private thread’s title', () => {
    const cards = cardsFor({
      products: [{ slug: 'lumen', name: 'Lumen app' }], now, me: 'dev',
      readItems: () => [held([personWait('maya'), 'w-2']), { id: 'w-2', title: 'Secret', status: 'open', visibility: 'private', updatedAt: now }],
    });
    const card = cards.find((c) => c.threadId === 'w-1');
    expect(card.blockedBy).toEqual([{ id: personWait('maya'), title: null }, { id: 'w-2', title: null }]);
  });
});
