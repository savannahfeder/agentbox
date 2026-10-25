// AN UNREAD THREAD CARRIES A DOT UNTIL YOU OPEN IT, AND AGAIN WHEN AN AGENT
// WRITES TO IT AFTER THAT.
//
// Asked on w-22da913d00 (2026-10-17): "sometimes I reread threads a bunch of
// times, not realizing I've already read them." The app kept a set of thread
// ids you had opened, but showed nothing for it, and a set of ids cannot say
// that an agent answered again after you looked. So the app now keeps WHEN you
// last opened each thread, and a thread is unread while its latest answer is
// newer than that.
//
// Two cases this has to get right that are easy to get wrong: the first launch
// must not dot every thread you already had (anything older than the moment
// the feature arrived counts as read), and Mark Unread must bring the dot back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivedAt, isUnread } from '../renderer/src/unread.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');

const SINCE = 1_000;
const thread = (id, createdAt, resultTs) => ({
  id, createdAt, wrote: resultTs == null ? {} : { result: { ts: resultTs, source: 'agent' } },
});

describe('when a thread last had something new for you', () => {
  it('is its latest answer', () => {
    expect(arrivedAt(thread('a', 100, 5_000))).toBe(5_000);
  });
  it('is when it was made, if nothing has answered yet', () => {
    expect(arrivedAt(thread('a', 2_000))).toBe(2_000);
  });
});

describe('a thread is unread', () => {
  it('when it arrived after you last opened it', () => {
    expect(isUnread(thread('a', 100, 3_000), { a: 2_000 }, SINCE)).toBe(true);
  });
  it('when you have never opened it and it is newer than the feature', () => {
    expect(isUnread(thread('a', 1_500), {}, SINCE)).toBe(true);
  });
  it('again when an agent answers after you opened it', () => {
    const opened = { a: 4_000 };
    expect(isUnread(thread('a', 100, 3_000), opened, SINCE)).toBe(false);
    expect(isUnread(thread('a', 100, 4_001), opened, SINCE)).toBe(true);
  });
  it('after Mark Unread, which leaves an opened time of 0', () => {
    expect(isUnread(thread('a', 100, 3_000), { a: 0 }, SINCE)).toBe(true);
  });
});

describe('a thread is read', () => {
  it('when you opened it after it arrived', () => {
    expect(isUnread(thread('a', 100, 3_000), { a: 3_500 }, SINCE)).toBe(false);
  });
  it('when you opened it at the very moment it arrived', () => {
    expect(isUnread(thread('a', 100, 3_000), { a: 3_000 }, SINCE)).toBe(false);
  });
  it('on first launch, for everything you already had', () => {
    expect(isUnread(thread('a', 100, 900), {}, SINCE)).toBe(false);
    expect(isUnread(thread('b', 1_000), {}, SINCE)).toBe(false);
  });
});

describe('the list draws it', () => {
  it('as a class on the row, in Needs You only', () => {
    const list = read('components/List.tsx');
    expect(list).toMatch(/view === 'inbox' && unread\?\.\(item\) \? ' unread' : ''/);
  });
  it('as a dot in the row gutter and a heavier title', () => {
    const css = read('threads/pages.css');
    expect(css).toMatch(/\.th-table \.row\.unread::before \{[^}]*background: var\(--accent\)/);
    // Measured in the built app: without `:root` the shared 400 rule, loaded
    // later, won and unread titles drew at 400.
    // 530: 560 read one step too heavy in the built app (2026-10-20).
    expect(css).toMatch(/:root \.th-table \.row\.unread \.subject \{ font-weight: 530; \}/);
  });
  it('and opening a thread marks it read at that moment', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/setSeenAt\(\(m\) => \(\{ \.\.\.m, \[item\.id\]: Date\.now\(\) \}\)\)/);
  });
  it('and Mark Unread puts the dot back', () => {
    expect(read('App.tsx')).toMatch(/setSeenAt\(\(m\) => \(\{ \.\.\.m, \[item\.id\]: 0 \}\)\)/);
  });
});
