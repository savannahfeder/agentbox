// SHOWING THE TEAM OPENS THE BOARD, AS IT WAS APPROVED TO.
//
// The approved design, kept in page-rules.ts as the reason for
// DEFAULT_DISPLAY: your own page is a list by default and the team page is a
// board by default. Both were built, and then the Inbox and the Team page
// became one page (w-05ff3d1438) and the page read `readDisplay('inbox')` and
// nothing else. The team default was still stored, still defaulted to board,
// and could never be reached: lighting a teammate's face left you in the list.
//
// There is one page now, so "per page" is read as "per audience": your own
// threads keep the inbox's remembered display, a page with anyone else on it
// keeps the team's. `pageFor` is the only copy of that, so the App and the
// tests cannot disagree about which half is being written.
//
// It is NOT an effect that forces board on, which would overrule a view picked
// while the team was up. Each half remembers what was last chosen for it, and
// only the untouched half falls back to its default.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pageFor, readDisplay, writeDisplay, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';

const store = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};

describe('pageFor: which remembered display the one page is on', () => {
  it('yours alone is the inbox', () => expect(pageFor(false)).toBe('inbox'));
  it('anyone else on the page is the team', () => expect(pageFor(true)).toBe('team'));
});

describe('the defaults that were approved, reachable again', () => {
  it('your own page opens as a list', () => {
    expect(readDisplay(pageFor(false), store()).view).toBe('list');
    expect(DEFAULT_DISPLAY.inbox.view).toBe('list');
  });
  it('a page with the team on it opens as a board', () => {
    expect(readDisplay(pageFor(true), store()).view).toBe('board');
    expect(DEFAULT_DISPLAY.team.view).toBe('board');
  });
});

describe('what is picked is remembered for that half only', () => {
  it('choosing List with the team up does not make your own page a board, or the other way round', () => {
    const s = store();
    writeDisplay(pageFor(true), { ...DEFAULT_DISPLAY.team, view: 'list' }, s);
    expect(readDisplay(pageFor(true), s).view).toBe('list');
    expect(readDisplay(pageFor(false), s).view).toBe('list'); // untouched, its own default
    writeDisplay(pageFor(false), { ...DEFAULT_DISPLAY.inbox, view: 'board' }, s);
    expect(readDisplay(pageFor(false), s).view).toBe('board');
    expect(readDisplay(pageFor(true), s).view).toBe('list'); // still what was chosen there
  });
  it('and they are two keys, not one', () => {
    const s = store();
    writeDisplay('inbox', DEFAULT_DISPLAY.inbox, s);
    writeDisplay('team', DEFAULT_DISPLAY.team, s);
    expect([...s.map.keys()].sort()).toEqual(['threads.display.inbox', 'threads.display.team']);
  });
});

describe('the page itself reads the right half', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('App.tsx picks its display with pageFor rather than naming the inbox', () => {
    expect(app).toMatch(/pageFor\(withOthers\)/);
  });
  it('and keeps both remembered, so neither half is lost when the faces change', () => {
    expect(app).toMatch(/readDisplay\('inbox'\)/);
    expect(app).toMatch(/readDisplay\('team'\)/);
  });
});
