// A MESSAGE FROM A PERSON LOOKS LIKE A MESSAGE, ON THE LIST AND ON THE BOARD.
//
// Found 2026-10-01 (w-2ad23ca814) messaging a test teammate: "I don't see a
// message from Riley here or in the board view... it should be more
// identifiable as a message... at least I should see her profile." Measured:
//   - on the Inbox board, `teamEntries` skipped every conversation (`isDirect`)
//     and every row someone else made, so a message to her was on no column;
//   - on the list, who it was from sat at the far right as a small face in the
//     project column, and the row read like any task;
//   - a message is made with priority 0, so its priority was hidden outright.
// Now a conversation row leads with the person's face and name, the board
// carries it in the column the Inbox tabs put it in, and its priority shows
// once someone (the sorter or the person) has set one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { messageLine, messagePriority, teamEntries } from '../renderer/src/threads/page-rules.ts';

const ME = 'p-me';
const RILEY = 'p-riley';
const BEA = 'p-bea';
const direct = { slug: 'direct-1', name: 'Direct', dir: '/tmp/d', team: { direct: true, people: [ME, RILEY], sharedBy: RILEY, visibility: 'people' } };
const group = { slug: 'direct-2', name: 'Direct', dir: '/tmp/g', team: { direct: true, people: [ME, RILEY, BEA], sharedBy: ME, visibility: 'people' } };
const website = { slug: 'website', name: 'Website', dir: '/tmp/w', team: null };
const T = Date.parse('2026-10-01T12:00:00');

const msg = (over = {}) => ({
  id: 'w-1', product: 'direct-1', productName: 'Direct', status: 'open', title: 'Hi', body: 'Hi, it is Riley.\nSecond line.', kind: 'directive',
  priority: 0, createdAt: T, updatedAt: T, createdBy: RILEY, assignee: ME, people: [RILEY, ME],
  wrote: { priority: { ts: T, source: 'system' }, body: { ts: T, source: 'founder', by: RILEY } },
  ...over,
});

describe('what a message row says', () => {
  it('names the other person and reads as the newest message, first line only', () => {
    expect(messageLine(msg(), direct, ME)).toEqual({ people: [RILEY], fromMe: false, text: 'Hi, it is Riley.' });
  });

  it('reads the reply when there is one, and knows when the reply was mine', () => {
    const answered = msg({ answer: 'Hey!', wrote: { body: { ts: T, source: 'founder', by: RILEY }, answer: { ts: T + 5, source: 'founder', by: ME } } });
    expect(messageLine(answered, direct, ME)).toEqual({ people: [RILEY], fromMe: true, text: 'Hey!' });
  });

  it('names everyone else in a group', () => {
    expect(messageLine(msg({ product: 'direct-2', people: [ME, RILEY, BEA] }), group, ME)?.people).toEqual([RILEY, BEA]);
  });

  it('is nothing on a thread that is not a conversation', () => {
    expect(messageLine(msg({ product: 'website' }), website, ME)).toBeNull();
  });
});

describe('a message\'s priority', () => {
  it('is hidden while nobody has set one: 0 from the system would read as Low', () => {
    expect(messagePriority(msg())).toBeNull();
  });

  it('shows once the sorter has set one', () => {
    expect(messagePriority(msg({ priority: 9, wrote: { priority: { ts: T + 1, source: 'agent' } } }))).toBe(9);
  });

  it('shows once the person has set one', () => {
    expect(messagePriority(msg({ priority: 2, wrote: { priority: { ts: T + 1, source: 'founder' } } }))).toBe(2);
  });
});

describe('the Inbox board carries messages', () => {
  const waiting = () => 'waiting';
  it('puts a message from a teammate in the column the Inbox tabs give it', () => {
    const entries = teamEntries({ items: [msg()], products: [direct], cards: [], me: ME, now: T, stateOf: waiting, allMine: true });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ state: 'waiting', title: 'Hi, it is Riley.', message: { people: [RILEY], fromMe: false } });
  });

  it('leaves out a conversation no Inbox tab holds', () => {
    expect(teamEntries({ items: [msg()], products: [direct], cards: [], me: ME, now: T, stateOf: () => null, allMine: true })).toHaveLength(0);
  });

  it('keeps conversations off the Team page board, which is about work', () => {
    expect(teamEntries({ items: [msg()], products: [direct], cards: [], me: ME, now: T, stateOf: waiting })).toHaveLength(0);
  });

  it('still draws an ordinary thread of mine the same way', () => {
    const task = msg({ id: 'w-2', product: 'website', productName: 'Website', createdBy: ME, people: undefined, assignee: undefined, priority: 7, visibility: 'private' });
    const [e] = teamEntries({ items: [task], products: [website], cards: [], me: ME, now: T, stateOf: waiting, allMine: true });
    expect(e).toMatchObject({ title: 'Hi', project: 'Website', priority: 7 });
    expect(e.message).toBeUndefined();
  });
});

describe('drawn', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  it('leads a message row with the person\'s face and name', () => {
    expect(pages).toMatch(/function MessageTitle/);
    expect(pages).toMatch(/<span className="th-msg">/);
  });
  it('draws the same on a board card', () => {
    expect(pages).toMatch(/e\.message \? <MessageTitle/);
  });
  // THE UNDERLINE REACHES A MESSAGE ROW (her note, 2026-10-01: hovering a
  // message row showed no underline, and the selected one none either). The
  // row's highlight is `text-decoration` on `.subject` (styles.css), and a
  // decoration never propagates into an inline-flex or inline-block box, which
  // is what `.th-msg` was. In a row it is plain inline, so the name and the
  // words carry the underline like any other title.
  it('lets the row\'s underline reach the name and the words', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    const rule = (sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
    expect(rule('.th-msg')).toMatch(/display:\s*inline;/);
    for (const sel of ['.th-msg', '.th-msg-who', '.th-msg-text']) expect(rule(sel)).not.toMatch(/display:\s*inline-(flex|block)|display:\s*(flex|grid|block)/);
    // The card, which has no underline, may still lay itself out.
    expect(rule('.th-card .th-msg')).toMatch(/display:\s*grid/);
  });

  it('asks the board for messages on the Inbox', () => {
    // Your own page's board (w-05ff3d1438) is the one that asks for all of yours.
    expect(pages).toMatch(/teamEntries\(\{[^}]*allMine: true \}\)/);
  });
});
