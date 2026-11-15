// EVERY THREAD IN NEEDS YOU OPENS ONE THING AT A TIME (w-65bcefb857).
//
// The page shipped in 4191cb5c behind Space and a "One at a time" button. The
// founder restarted, clicked a Needs you thread and got the old page with the
// summary panel: "this should be immediately active no matter what". Read in
// renderer/src/App.tsx: `queueSpot` needed an `oneAtATime` flag that only
// Space and the button set, so a click, Enter, the board and search all opened
// the old page. Now the page is chosen by the thread alone: in Needs you, it
// is this page, however it was opened. Out of Needs you, it is the full page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { spotIn } from '../renderer/src/one-thing-at-a-time.ts';
import { replyMovesOn } from '../renderer/src/advance.ts';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('renderer/src/App.tsx');

describe('which page a thread opens on', () => {
  it('is decided by whether the thread is in Needs you, and nothing else', () => {
    expect(app).toMatch(/const queueSpot = spotIn\(shownInbox, focused\);/);
  });
  it('so a click, Enter, the board and search all land on it', () => {
    expect(app).not.toMatch(/oneAtATime|startOneAtATime/);
  });
  it('a thread in Needs you gets its place in the queue', () => {
    const waiting = [{ product: 'a', id: 'w-1' }, { product: 'a', id: 'w-2' }];
    expect(spotIn(waiting, waiting[1])).toEqual({ pos: 2, total: 2, index: 1 });
  });
  it('a thread in In progress, Later or Done does not, and keeps the full page', () => {
    expect(spotIn([{ product: 'a', id: 'w-1' }], { product: 'a', id: 'w-7' })).toBeNull();
  });
});

describe('there is no separate way in', () => {
  it('no button on the tabs', () => {
    const html = renderToStaticMarkup(h(StateTabs, { view: 'inbox', counts: { inbox: 3 }, onView: () => {}, onSearch: () => {} }));
    expect(html).not.toContain('One at a time');
    expect(read('renderer/src/threads/Pages.tsx')).not.toMatch(/onOneAtATime|th-one/);
  });
  it('and Space is not a key on the list', () => {
    expect(app).not.toMatch(/case ' ':/);
  });
});

describe('an answer on Needs you moves on', () => {
  it('to the next thread waiting', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 1, inboxSize: 3 })).toBe(true);
  });
  it('and from the last one too, to the empty inbox', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, inboxSize: 1 })).toBe(true);
  });
  it('but not from a thread opened from search, or one not in Needs you', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, inboxSize: 1, searching: true })).toBe(false);
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: -1, inboxSize: 3 })).toBe(false);
  });
});
