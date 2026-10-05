// HIDE PRIVATE THREADS, FOR WHEN YOU ARE SHOWING THE APP TO SOMEBODY.
//
// Asked for on 2026-10-04: "Quite often I'm showing the app to my friends, it
// would be nice in that case to be able to filter out the private tasks." The
// View and filters menu had priority, project and updated, and nothing about
// who can see a thread, so every row with a lock on it was on the screen for
// whoever was looking over your shoulder.
//
// It is one more line in that menu, Privacy: All, Hide private, Only private.
// A private thread is exactly a row that wears the lock (`rowSharing` says
// 'private'), so what the filter takes away is what the eye already reads as
// private. Measured before the fix: `keeps` had no privacy argument at all and
// the menu drew no Privacy line, so both halves below were red.
//
// It is ONE choice for the whole page, not one per half of it. Your page and
// the page with teammates on it remember their own view and filters, and a
// privacy choice kept in only one of them would bring every private row back
// the moment a teammate's face was lit, which is the moment it matters.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_DISPLAY, boardColumns, isFiltered, keeps, keepsPrivacy, pageDisplay, readDisplay, readPrivacy, writePrivacy,
} from '../renderer/src/threads/page-rules.ts';
import { teammateRows } from '../renderer/src/threads/people-rules.ts';
import { DisplayMenu } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const NOW = Date.UTC(2026, 9, 4, 18);
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const me = { id: ME, name: 'Sam Rivera', email: 'sam@example.test' };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test' };
const northwind = { slug: 'northwind', name: 'Northwind', team: { projectId: 't-1', visibility: 'team', people: [] } };
const display = (o = {}) => ({ ...DEFAULT_DISPLAY.inbox, ...o });
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Mine', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + DAY, updatedAt: NOW - 3_600_000, createdBy: ME, ...o,
});
const card = (o = {}) => ({
  personId: maya.id, threadId: 'w-m1', visible: true, title: 'Acme renewal', project: 'Northwind', state: 'waiting',
  priority: 5, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: NOW - 60_000, ...o,
});
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('keepsPrivacy: what each choice keeps', () => {
  it('Hide private takes away the rows with a lock and nothing else', () => {
    expect(keepsPrivacy('private', 'shared')).toBe(false);
    expect(keepsPrivacy('team', 'shared')).toBe(true);
    expect(keepsPrivacy('people', 'shared')).toBe(true);
  });
  it('Hide private leaves the rows the question does not arise on: a message, an agent, the app’s own rows', () => {
    expect(keepsPrivacy(null, 'shared')).toBe(true);
    expect(keepsPrivacy(undefined, 'shared')).toBe(true);
  });
  it('Only private keeps the rows with a lock and nothing else', () => {
    expect(keepsPrivacy('private', 'private')).toBe(true);
    expect(keepsPrivacy('team', 'private')).toBe(false);
    expect(keepsPrivacy('people', 'private')).toBe(false);
    expect(keepsPrivacy(null, 'private')).toBe(false);
  });
  it('All keeps everything, and so does a display saved before there was a choice', () => {
    for (const seen of ['private', 'team', 'people', null]) {
      expect(keepsPrivacy(seen, 'any')).toBe(true);
      expect(keepsPrivacy(seen, undefined)).toBe(true);
    }
  });
});

describe('keeps: the privacy choice joins the other filters', () => {
  it('drops a private row under Hide private, keeps a shared one', () => {
    expect(keeps(item(), display({ privacy: 'shared' }), NOW, 'private')).toBe(false);
    expect(keeps(item(), display({ privacy: 'shared' }), NOW, 'team')).toBe(true);
  });
  it('still applies the other filters to a row it keeps', () => {
    expect(keeps(item({ priority: 9 }), display({ privacy: 'shared', priorities: ['low'] }), NOW, 'team')).toBe(false);
  });
  it('without a privacy choice, says what it said before', () => {
    expect(keeps(item(), display(), NOW, 'private')).toBe(true);
    expect(keeps(item(), display(), NOW)).toBe(true);
  });
  it('counts as a filter, so the dot and Clear filters show', () => {
    expect(isFiltered(display({ privacy: 'shared' }))).toBe(true);
    expect(isFiltered(display({ privacy: 'private' }))).toBe(true);
    expect(isFiltered(display({ privacy: 'any' }))).toBe(false);
    expect(isFiltered(display())).toBe(false);
  });
});

describe('one choice for the whole page', () => {
  it('is remembered between launches, and anything unreadable is All', () => {
    const store = memory();
    expect(readPrivacy(store)).toBe('any');
    writePrivacy('shared', store);
    expect(readPrivacy(store)).toBe('shared');
    store.setItem('threads.privacy', '"nonsense"');
    expect(readPrivacy(store)).toBe('any');
    store.setItem('threads.privacy', '{not json');
    expect(readPrivacy(store)).toBe('any');
  });
  it('rides on whichever half of the page is showing', () => {
    const mine = readDisplay('inbox', memory());
    const theirs = readDisplay('team', memory());
    expect(pageDisplay(mine, 'shared', true).privacy).toBe('shared');
    expect(pageDisplay(theirs, 'shared', true).privacy).toBe('shared');
    expect(pageDisplay(theirs, 'shared', true).view).toBe('board');
  });
  it('means nothing off a team, where no row is private, so it reads as All there', () => {
    expect(pageDisplay(display(), 'private', false).privacy).toBe('any');
  });
});

describe('teammates’ threads', () => {
  const args = (privacy) => ({ tab: 'inbox', picked: [ME, maya.id], me: ME, display: display({ privacy }), products: [northwind], now: NOW });
  it('are shared with you by definition, so Hide private keeps them', () => {
    expect(teammateRows([card()], args('shared'))).toHaveLength(1);
  });
  it('and Only private leaves none of them', () => {
    expect(teammateRows([card()], args('private'))).toHaveLength(0);
  });
  it('and All keeps them', () => expect(teammateRows([card()], args('any'))).toHaveLength(1));
});

describe('the board takes the same choice', () => {
  const shared = item({ id: 'w-shared', title: 'Shared one' });
  const locked = item({ id: 'w-locked', title: 'Locked one', visibility: 'private' });
  const titles = (privacy) => boardColumns({
    items: [shared, locked], products: [northwind], display: display({ view: 'board', privacy }), now: NOW,
    cards: [card()], picked: [ME, maya.id], me: ME, since: SINCE,
  }).flatMap((c) => c.rows).map((e) => e.item?.title ?? e.title).sort();
  it('Hide private takes the locked card off and leaves yours and theirs', () => {
    expect(titles('shared')).toEqual(['Acme renewal', 'Shared one']);
  });
  it('Only private leaves the locked card alone', () => expect(titles('private')).toEqual(['Locked one']));
  it('All leaves all three', () => expect(titles('any')).toEqual(['Acme renewal', 'Locked one', 'Shared one']));
});

describe('the Privacy line in View and filters', () => {
  const pick = { everyone: [me, maya], picked: [ME], me: ME, onPick: () => {} };
  const menu = (people, d = display()) => renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display: d, onDisplay: () => {}, products: [], people }));
  it('offers All, Hide private and Only private, after Updated', () => {
    const html = menu(pick);
    expect(html).toMatch(/Updated[\s\S]*Privacy[\s\S]*All[\s\S]*Hide private[\s\S]*Only private/);
  });
  it('lights the choice that is on', () => {
    expect(menu(pick, display({ privacy: 'shared' }))).toMatch(/class="on"[^>]*>(<svg[\s\S]*?<\/svg>)?Hide private/);
  });
  it('is not there off a team, where nothing is private', () => {
    expect(menu(undefined)).not.toContain('Privacy');
  });
  it('is there on a team of one too: your threads can still be private', () => {
    expect(menu({ everyone: [me], picked: [ME], me: ME, onPick: () => {} })).toContain('Privacy');
  });
});
