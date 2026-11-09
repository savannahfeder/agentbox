// "SEEN BY DEV, 1:55PM" SITS UNDER YOUR LAST MESSAGE ONCE THEY OPENED IT.
//
// Sofia: "My reply to Dev sat 6 hours 45 minutes unseen: your reply did
// not reach me." Wanted: "a read mark (Seen by Dev 1:55pm) under my message".
// The read marks now cross (a-read-mark-reaches-only-the-people-in-the-conversation);
// this is the line drawn from them, read off the pure rule the chat draws.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { seenLine } from '../renderer/src/team/seen-line.ts';

const ME = 'p-sofia', DEV = 'p-dev', MAYA = 'p-maya', JO = 'p-jo';
const names = { [DEV]: 'Dev', [MAYA]: 'Maya', [JO]: 'Jo' };
const nameOf = (id) => names[id] ?? 'Someone';
const at = (h, m) => new Date(2026, 9, 30, h, m).getTime();
const NOW = at(18, 0);
const mine = (uid, ts) => ({ kind: 'said', who: 'you', by: ME, uid, at: ts, text: 'x' });
const theirs = (uid, ts, by = DEV) => ({ kind: 'said', who: 'you', by, uid, at: ts, text: 'y' });
const line = (events, others, seen) => seenLine({ events, me: ME, others, seen, nameOf, now: NOW });

describe('with one person', () => {
  it('names them and when, under your newest message', () => {
    const out = line([theirs('a', at(9, 0)), mine('b', at(13, 0))], [DEV], { [DEV]: at(13, 55) });
    expect(out?.uid).toBe('b');
    expect(out?.text).toMatch(/^Seen by Dev, 1:55\s?pm$/i);
  });
  it('says the day when it was not today', () => {
    const out = seenLine({ events: [mine('b', at(13, 0))], me: ME, others: [DEV], seen: { [DEV]: at(13, 55) }, nameOf, now: at(13, 0) + 86_400_000 });
    expect(out?.text).toMatch(/^Seen by Dev, Yesterday 1:55\s?pm$/i);
  });
  it('says nothing until they opened it after you wrote', () => {
    expect(line([mine('b', at(13, 0))], [DEV], {})).toBe(null);
    expect(line([mine('b', at(13, 0))], [DEV], { [DEV]: at(12, 0) })).toBe(null);
  });
  it('says nothing once they have answered: the answer says it', () => {
    expect(line([mine('b', at(13, 0)), theirs('c', at(14, 0))], [DEV], { [DEV]: at(14, 0) })).toBe(null);
  });
  it('a message still sending or taken back carries nothing', () => {
    expect(line([{ ...mine('b', at(13, 0)), pending: true }], [DEV], { [DEV]: at(14, 0) })).toBe(null);
    expect(line([{ ...mine('b', at(13, 0)), deleted: true }], [DEV], { [DEV]: at(14, 0) })).toBe(null);
  });
});

describe('in a group', () => {
  it('counts who has, with their names on hover', () => {
    const out = line([mine('b', at(13, 0))], [DEV, MAYA, JO], { [DEV]: at(13, 55), [MAYA]: at(14, 2) });
    expect(out?.text).toBe('Seen by 2 of 3');
    expect(out?.title).toMatch(/^Dev 1:55\s?pm, Maya 2:02\s?pm$/i);
  });
  it('says everyone once everyone has', () => {
    expect(line([mine('b', at(13, 0))], [DEV, MAYA], { [DEV]: at(13, 55), [MAYA]: at(14, 2) })?.text).toBe('Seen by everyone');
  });
});

describe('where it is drawn', () => {
  const thread = fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8');
  const item = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('under the message it is about, in the chat', () => {
    expect(thread).toMatch(/seenUnder && seenUnder\.uid === e\.uid/);
    expect(item).toMatch(/seenLine\(\{/);
  });
  it('opening a conversation, with the window in front, says so', () => {
    expect(app).toMatch(/api\.teamSeen\(/);
    expect(app).toMatch(/document\.hasFocus\(\)/);
  });
});
