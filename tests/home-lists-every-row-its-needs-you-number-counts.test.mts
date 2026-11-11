// HOME LISTS EVERY ROW ITS NEEDS YOU NUMBER COUNTS (2026-11-11).
//
// Three people on one team with Rooms on. Maya messaged Theo. Theo's Home said
// "Needs you 1" and "Inbox 1" directly over "Nothing needs you.", while his
// Inbox's Needs you tab listed the row. Home built its list from his own work
// items only; the number added a teammate's waiting threads, group messages,
// invitations, file news and followed-thread news, which Home never drew, and
// a row Home did draw opened only if it was a work item. Now Home draws the
// Inbox's Needs you rows from one list (threads/needs-you-list.ts), its card's
// number is that list's length, and a Home row opens what the Inbox row opens.
// The Inbox's own number and the sidebar badge are left as they were.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsYouList, openNeedsEntry } from '../renderer/src/threads/needs-you-list.ts';
import { homeNeedsRows, HOME_NEEDS_CAP } from '../renderer/src/home/home-needs.ts';
import { HomePage } from '../renderer/src/home/HomePage.tsx';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';

const NOW = Date.UTC(2026, 10, 11, 12, 0);
const MIN = 60_000;
const ME = 'u-theo';
const names = { 'u-maya': 'Maya Chen', 'u-priya': 'Priya Shah', 'u-theo': 'Theo Okafor' };
const mine = (n, over = {}) => ({ id: `w-${n}`, product: 'kestrel', productName: 'Kestrel', status: 'open', kind: 'question', title: `my thread ${n}`, priority: 5, updatedAt: NOW - n * MIN, createdAt: NOW - n * MIN, ...over });
const card = (over = {}) => ({
  personId: 'u-maya', threadId: 't-1', visible: true, title: 'Fix the pricing page', project: 'Kestrel', state: 'waiting', priority: 5,
  problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - 3 * MIN, ...over,
});
const mention = { key: 'room-mention:r-dm', mention: { id: 'room-mention:r-dm', messageId: 'm1', roomId: 'r-dm', roomName: 'Maya C.', by: 'u-maya', byName: 'Maya C.', body: 'Can you look at the deck?', at: NOW - MIN } };
const invite = { key: 'invite/team/t1', invite: { key: 'invite/team/t1', kind: 'team', id: 't1', words: 'Maya invited you to Kestrel' } };
const fileNews = (over = {}) => ({ owner: 'u-maya', threadId: 't-1', id: 'n1', file: 'deck.md', text: 'Is this right?', by: 'u-maya', ts: NOW - 2 * MIN, ...over });
const follow = { key: 'u-priya/t-9/done', kind: 'done', owner: 'u-priya', thread: 't-9', title: 'Ship the invoices', at: NOW - 4 * MIN, card: card({ personId: 'u-priya', threadId: 't-9', state: 'done', title: 'Ship the invoices' }) };

const list = (over = {}) => needsYouList({
  mine: [], withOthers: true, cards: [], picked: [ME, 'u-maya', 'u-priya'], me: ME, display: DEFAULT_DISPLAY.inbox, products: [], now: NOW, order: [],
  leads: [], fileNews: [], follows: [], ...over,
});
const rowsFor = (entries) => homeNeedsRows(entries, {
  item: (i) => ({ key: `${i.product}/${i.id}`, letter: 'C', title: i.title, from: null, priority: null, project: i.productName, at: i.updatedAt, unread: false }),
  nameOf: (id) => names[id] ?? '',
});
const home = (entries, inboxCount = entries.length) => renderToStaticMarkup(React.createElement(HomePage, {
  hello: 'Good afternoon', now: NOW, needs: rowsFor(entries), needsCount: entries.length, inboxCount, progressCount: 0, team: [], progress: [],
  slot: () => {}, onDoor: () => {}, onOpen: () => {}, onMember: () => {}, onTeam: () => {},
}));

describe('Needs you on Home', () => {
  it('lists a message from a teammate in a group, the reported row', () => {
    const entries = list({ leads: [mention] });
    expect(entries).toHaveLength(1);
    expect(rowsFor(entries)).toHaveLength(1);
    const html = home(entries);
    expect(html).not.toContain('Nothing needs you.');
    expect(html).toContain('Can you look at the deck?');
    expect(html).toContain('Maya');
  });

  it('names the sender once: a two-person chat is named for them, a group keeps its name', () => {
    expect(rowsFor(list({ leads: [mention] }))[0]).toMatchObject({ from: 'Maya', project: '' });
    const inGroup = { key: 'room-mention:r-team', mention: { ...mention.mention, id: 'room-mention:r-team', roomId: 'r-team', roomName: 'Kestrel' } };
    expect(rowsFor(list({ leads: [inGroup] }))[0]).toMatchObject({ from: 'Maya', project: 'Kestrel' });
    const three = { key: 'room-mention:r-3', mention: { ...mention.mention, id: 'room-mention:r-3', roomId: 'r-3', roomName: 'Maya C., Priya R.' } };
    expect(rowsFor(list({ leads: [three] }))[0].project).toBe('Maya C., Priya R.');
  });

  it('lists a teammate\'s thread waiting on you, and nothing of yours', () => {
    const entries = list({ cards: [card()] });
    expect(entries.map((e) => e.kind)).toEqual(['card']);
    expect(home(entries)).toContain('Fix the pricing page');
  });

  it('lists your own rows alone, as before', () => {
    const entries = list({ mine: [mine(1), mine(2)] });
    expect(entries.map((e) => e.key)).toEqual(['kestrel/w-1', 'kestrel/w-2']);
    expect(rowsFor(entries).map((r) => r.title)).toEqual(['my thread 1', 'my thread 2']);
  });

  it('lists every kind in the Inbox\'s order: file news, followed threads, invitations and groups, then the threads', () => {
    const entries = list({
      mine: [mine(1), mine(5)], cards: [card()], leads: [invite, mention], fileNews: [fileNews()], follows: [follow],
      display: { ...DEFAULT_DISPLAY.inbox, sort: 'updated' },
    });
    expect(entries.map((e) => e.kind)).toEqual(['file', 'follow', 'lead', 'lead', 'item', 'card', 'item']);
    expect(rowsFor(entries)).toHaveLength(entries.length);
  });

  it('says "Nothing needs you." only over a count of nothing', () => {
    const entries = list();
    expect(entries).toHaveLength(0);
    expect(home(entries)).toContain('Nothing needs you.');
  });

  it('leaves out a teammate\'s private thread and one not waiting on you', () => {
    const entries = list({ cards: [card({ visible: false }), card({ threadId: 't-2', state: 'running' })] });
    expect(entries).toHaveLength(0);
  });

  it('leaves out every teammate row while no teammate is picked, as the page does', () => {
    expect(list({ cards: [card()], withOthers: false })).toHaveLength(0);
    expect(list({ cards: [card()], withOthers: false, mine: [mine(1)] }).map((e) => e.kind)).toEqual(['item']);
  });

  it('leaves out a teammate nobody picked, and your own card', () => {
    expect(list({ cards: [card()], picked: [ME] })).toHaveLength(0);
    expect(list({ cards: [card({ personId: ME })] })).toHaveLength(0);
  });

  it('leaves out file news whose thread is not here to open, as the Inbox does, and does not count it', () => {
    const entries = list({ fileNews: [fileNews({ threadId: 't-gone' })], cards: [card()] });
    expect(entries.map((e) => e.kind)).toEqual(['card']);
    const html = home(entries, 2);
    expect(html).toContain('<span class="t">Needs you<em>1</em></span>');
  });

  it('keeps the Inbox\'s own number on the Inbox door', () => {
    const html = home(list({ leads: [mention] }), 3);
    expect(html).toMatch(/Inbox<span class="c">3<\/span>/);
    expect(html).toContain('<span class="t">Needs you<em>1</em></span>');
  });

  it('counts past its cap and draws the cap', () => {
    const many = Array.from({ length: HOME_NEEDS_CAP + 5 }, (_, n) => mine(n + 1));
    const entries = list({ mine: many });
    expect(entries).toHaveLength(HOME_NEEDS_CAP + 5);
    expect(rowsFor(entries)).toHaveLength(HOME_NEEDS_CAP);
  });

  it('opens each row the way the Inbox opens it', () => {
    const on = { item: vi.fn(), card: vi.fn(), lead: vi.fn(), file: vi.fn(), follow: vi.fn() };
    const entries = list({ mine: [mine(1)], cards: [card()], leads: [mention], fileNews: [fileNews()], follows: [follow] });
    for (const e of entries) openNeedsEntry(e, on);
    expect(on.lead).toHaveBeenCalledWith(mention);
    expect(on.card).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't-1' }));
    expect(on.item).toHaveBeenCalledWith(expect.objectContaining({ id: 'w-1' }));
    expect(on.file).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), expect.objectContaining({ threadId: 't-1' }));
    expect(on.follow).toHaveBeenCalledWith(follow, follow.card);
  });

  it('gives every row its own key, so J, K and Enter reach each one', () => {
    const entries = list({ mine: [mine(1)], cards: [card()], leads: [invite, mention], fileNews: [fileNews()], follows: [follow] });
    const keys = rowsFor(entries).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('App.tsx', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, '..', 'renderer/src/App.tsx'), 'utf8');
  const tabCount = "(mineShown ? shownCount(inbox) : 0) + theirCount('inbox') + leadCount + sharedFileNews.length + followingNews.length";
  it('leaves the Inbox tab\'s number and the sidebar badge as they were, box filter and all', () => {
    expect(app).toContain(`const needsYouCount = { inbox: ${tabCount} };`);
    expect(app).toContain(`inbox: ${tabCount},`);
    expect(app).toContain('const inboxCount = inboxBadge({ rows: shownCount(inbox), leads: leadCount, fileNews: sharedFileNews.length, follows: followingNews.length });');
  });
  it('counts on Home the list Home draws, with your rows as the tab\'s number sees them', () => {
    const built = app.slice(app.indexOf('const needsList = useMemo'), app.indexOf('const needsList = useMemo') + 700);
    expect(built).toContain('mine: mineShown ? sortedByDisplay(inbox.filter((i) => shownCount([i]) === 1)');
    expect(built).not.toMatch(/shownAs|filterBox|boxFilter/);
    expect(built).toContain('withOthers,');
    expect(app).toMatch(/homeNeedsRows\(needsList,/);
    expect(app).toContain('needs={homeNeeds} needsCount={needsList.length} inboxCount={needsYouCount.inbox}');
  });
  it('opens a Home row through the list, not only when it is a work item', () => {
    const openRow = app.slice(app.indexOf('const homeOpenRow'), app.indexOf('const skyOnInbox'));
    expect(openRow).toContain('openNeedsEntry(');
    expect(openRow).not.toMatch(/items\.find/);
  });
});
