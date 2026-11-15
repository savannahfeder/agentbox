// A FOUND LINE HAD NOWHERE TO GO.
//
// The finding, 2026-10-30: "Dev's status post sits in a group chat that search
// doesn't find", and Command K's line results from groups opened the group, not
// the message. This builds the rows Command K and the search page draw from what
// main found inside threads plus what the screen already holds (group lines,
// decisions), and checks each says who wrote it and when, names a conversation by
// its people, opens at the message, and leaves out what this person is not in.
import { describe, it, expect } from 'vitest';
import { insideGroups } from '../renderer/src/found-inside';

const none = { lines: [], files: [], comments: [], total: { lines: 0, files: 0, comments: 0 } };
const where = (o) => ({ kind: 'thread', product: 'lumen', id: 't1', ownerId: null, threadId: null, updatedAt: 1, ...o });
const items = [
  { id: 't1', product: 'lumen', title: 'Launch week' },
  { id: 'c1', product: 'people', title: 'Conversation' },
];
const cards = [{ personId: 'p-dev', threadId: 's1', title: 'Status post', visible: true }];
const people = { 'p-dev': 'Dev', 'p-maya': 'Maya', 'p-sofia': 'Sofia' };
const base = {
  query: 'render', items, cards, found: none,
  rooms: new Map([['r1', 'Lumen']]), messages: {}, decisions: {}, me: 'p-maya',
  nameOf: (id) => people[id] ?? 'Someone',
  titleOf: (i) => (i.id === 'c1' ? 'Sofia, Dev' : i.title),
  limit: { lines: 5, files: 5, comments: 5, decisions: 5 },
};
const run = (extra) => insideGroups({ ...base, ...extra });
const rowsOf = (groups, key) => groups.find((g) => g.key === key)?.rows ?? [];

describe('a line found inside a thread', () => {
  const found = { ...none, total: { ...none.total, lines: 3 }, lines: [
    { ...where({}), uid: 'u1', by: 'p-dev', source: 'founder', at: 300, comment: false, text: 'Render account is live.' },
    { ...where({}), uid: 'u2', by: null, source: 'agent', at: 200, comment: false, text: 'Render deploy finished.' },
    { ...where({ id: 'c1', product: 'people', kind: 'chat' }), uid: 'u3', by: 'p-sofia', source: 'founder', at: 100, comment: false, text: 'Render check for the amber state.' },
  ] };

  it('says who wrote it, when, where, and opens at that message', () => {
    const rows = rowsOf(run({ found }), 'lines');
    expect(rows[0]).toMatchObject({ who: 'Dev', at: 300, where: 'Launch week', text: 'Render account is live.' });
    expect(rows[0].open).toMatchObject({ type: 'thread', line: 'u1' });
    expect(rows[0].open.item.id).toBe('t1');
  });

  it('says "Agent" for the agent and "You" for the person searching', () => {
    const rows = rowsOf(run({ found }), 'lines');
    expect(rows[1].who).toBe('Agent');
    const mine = { ...found, lines: [{ ...found.lines[0], by: 'p-maya' }] };
    expect(rowsOf(run({ found: mine }), 'lines')[0].who).toBe('You');
  });

  it('names a conversation by its people, not "Conversation"', () => {
    const rows = rowsOf(run({ found }), 'lines');
    expect(rows[2].where).toBe('Sofia, Dev');
  });

  it('counts the lines main found beyond the ones it sent', () => {
    expect(run({ found }).find((g) => g.key === 'lines').more).toBe(0);
    expect(run({ found: { ...found, total: { ...found.total, lines: 9 } } }).find((g) => g.key === 'lines').more).toBe(6);
  });

  it('is left out when this screen does not list the thread', () => {
    const lost = { ...none, lines: [{ ...where({ id: 'gone' }), uid: 'x', by: 'p-dev', source: 'founder', at: 1, comment: false, text: 'render' }] };
    expect(run({ found: lost })).toEqual([]);
  });

  it('opens a teammate\'s shared thread by its card', () => {
    const shared = { ...none, lines: [{ ...where({ kind: 'shared', product: null, id: null, ownerId: 'p-dev', threadId: 's1' }), uid: 'u9', by: 'p-dev', source: 'founder', at: 50, comment: false, text: 'Render status posted.' }] };
    const row = rowsOf(run({ found: shared }), 'lines')[0];
    expect(row).toMatchObject({ where: 'Status post', who: 'Dev' });
    expect(row.open).toMatchObject({ type: 'card', line: 'u9' });
  });

  it('is left out for a teammate\'s thread whose card this person cannot see', () => {
    const shared = { ...none, lines: [{ ...where({ kind: 'shared', product: null, id: null, ownerId: 'p-dev', threadId: 'private' }), uid: 'u9', by: 'p-dev', source: 'founder', at: 50, comment: false, text: 'Render secrets.' }] };
    expect(run({ found: shared })).toEqual([]);
  });
});

describe('a line said in a group', () => {
  const messages = {
    r1: [
      { id: 'm1', roomId: 'r1', by: 'p-dev', body: 'Render account is live, deploying the booking API today.', at: 500 },
      { id: 'm2', roomId: 'r1', by: 'p-maya', body: 'Great, thanks.', at: 600 },
      { id: 'm3', roomId: 'r1', by: 'p-dev', body: 'Render gone.', at: 700, deleted: true },
    ],
    r9: [{ id: 'm9', roomId: 'r9', by: 'p-dev', body: 'Render budget is secret.', at: 800 }],
  };

  it('opens the group at that message, not just the group', () => {
    const rows = rowsOf(run({ messages }), 'lines');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ who: 'Dev', where: 'Lumen', at: 500, open: { type: 'room', roomId: 'r1', messageId: 'm1' } });
  });

  it('is not found in a group this person is not in, or after it was deleted', () => {
    const rows = rowsOf(run({ messages }), 'lines');
    expect(rows.some((r) => r.open.roomId === 'r9')).toBe(false);
    expect(rows.some((r) => r.open.messageId === 'm3')).toBe(false);
  });

  it('comes between thread lines newest first', () => {
    const found = { ...none, lines: [{ ...where({}), uid: 'u1', by: 'p-dev', source: 'founder', at: 900, comment: false, text: 'Render again.' }] };
    expect(rowsOf(run({ found, messages }), 'lines').map((r) => r.at)).toEqual([900, 500]);
  });
});

describe('files, comments and decisions', () => {
  it('shows a file by its name, and a markdown file by the line that matched', () => {
    const found = { ...none, files: [
      { ...where({}), how: 'name', src: 'render-plan.md', name: 'render-plan.md', by: 'p-dev', at: 10, text: '' },
      { ...where({}), how: 'contents', src: 'notes.md', name: 'notes.md', by: null, at: 20, text: 'The render account goes live Tuesday.' },
    ], total: { lines: 0, files: 2, comments: 0 } };
    const rows = rowsOf(run({ found }), 'files');
    expect(rows[0]).toMatchObject({ text: 'render-plan.md', open: { type: 'thread', file: 'render-plan.md' } });
    expect(rows[1]).toMatchObject({ file: 'notes.md', text: 'The render account goes live Tuesday.' });
  });

  it('shows a comment on a file with who and which file, and opens at that comment', () => {
    const found = { ...none, comments: [{ ...where({}), src: 'hero.png', name: 'hero.png', by: 'p-sofia', at: 40, resolved: false, noteId: 'n7', fileId: 'hero.png', text: 'Render the hero larger.' }], total: { lines: 0, files: 0, comments: 1 } };
    const row = rowsOf(run({ found }), 'comments')[0];
    expect(row).toMatchObject({ who: 'Sofia', file: 'hero.png', text: 'Render the hero larger.' });
    expect(row.open).toMatchObject({ type: 'thread', file: 'hero.png', note: { file: 'hero.png', id: 'n7' } });
  });

  it('shows a decision by its words, opening the group at the message', () => {
    const decisions = { r1: [
      { roomId: 'r1', messageId: 'm5', kind: 'decision', body: 'We render everything on Render, not Heroku.', saidBy: 'p-dev', at: 33, on: true },
      { roomId: 'r1', messageId: 'm6', kind: 'decision', body: 'Render was dropped.', saidBy: 'p-dev', at: 34, on: false },
      { roomId: 'r9', messageId: 'm7', kind: 'decision', body: 'Render in a group I am not in.', saidBy: 'p-dev', at: 35, on: true },
    ] };
    const rows = rowsOf(run({ decisions }), 'decisions');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ who: 'Dev', where: 'Lumen', open: { type: 'room', roomId: 'r1', messageId: 'm5' } });
  });

  it('keeps each group to its limit, and lists nothing for a blank query', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...where({}), uid: `u${i}`, by: 'p-dev', source: 'founder', at: i, comment: false, text: 'Render it.' }));
    const got = run({ found: { ...none, lines: many, total: { ...none.total, lines: 9 } }, limit: { lines: 3, files: 3, comments: 3, decisions: 3 } });
    expect(rowsOf(got, 'lines')).toHaveLength(3);
    expect(got.find((g) => g.key === 'lines').more).toBe(6);
    expect(run({ query: '   ' })).toEqual([]);
  });
});
