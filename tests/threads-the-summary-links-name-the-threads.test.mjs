// THE SUMMARY'S LINKS NAME THE THREADS, AND NEVER ONE SHE CANNOT SEE.
//
// Approved 2026-10-01 (w-e731ca9376, round 9). "Blocked by" and "Blocks" are
// thread ids on the row (blockedBy, blocks). The panel draws each one as the
// title she knows it by, which is the list's own name for it (label, then
// title). An id this Mac does not hold is a teammate's private thread or one
// that was deleted, and it reads "A thread you cannot see" rather than an id
// or a blank. The menu that adds a link offers only her other open threads:
// never this thread, never one already linked, never a finished one, never a
// message between two people, and never a teammate's.
import { describe, it, expect } from 'vitest';
import { linkedThreads, linkCandidates, ownerName, UNSEEN_THREAD } from '../renderer/src/threads/summary-rules.ts';

const row = (o) => ({ id: 'w-x', product: 'nw', title: 'Untitled', status: 'open', labels: [], updatedAt: 0, ...o });
const items = [
  row({ id: 'w-a', title: 'Acme renewal terms', updatedAt: 5 }),
  row({ id: 'w-b', title: 'sign in with google, tests passing', label: 'Sign in with Google', updatedAt: 9 }),
  row({ id: 'w-c', title: 'Acme call on Thursday', updatedAt: 7 }),
  row({ id: 'w-done', title: 'Old', status: 'done', updatedAt: 8 }),
  row({ id: 'w-maya', title: 'Maya’s own', createdBy: 'p-maya', updatedAt: 6 }),
  row({ id: 'w-msg', product: 'direct-1', title: 'Can you take the call?', updatedAt: 10 }),
  row({ id: 'w-agent', title: 'A running agent', agent: { pid: 1 }, updatedAt: 11 }),
];

describe('linked titles', () => {
  it('uses the name the list shows, the label before the title', () => {
    expect(linkedThreads(['w-b', 'w-c'], items, 'nw')).toEqual([
      { id: 'w-b', title: 'Sign in with Google', known: true },
      { id: 'w-c', title: 'Acme call on Thursday', known: true },
    ]);
  });
  it('says a thread you cannot see for an id this Mac does not hold', () => {
    expect(UNSEEN_THREAD).toBe('A thread you cannot see');
    expect(linkedThreads(['w-gone'], items, 'nw')).toEqual([{ id: 'w-gone', title: UNSEEN_THREAD, known: false }]);
  });
  it('draws nothing for no links, or for a field that is not a list', () => {
    expect(linkedThreads(undefined, items, 'nw')).toEqual([]);
    expect(linkedThreads('w-a', items, 'nw')).toEqual([]);
  });
  it('prefers the thread in the same project when two projects share an id', () => {
    const two = [row({ id: 'w-a', product: 'web', title: 'Wrong one' }), row({ id: 'w-a', product: 'nw', title: 'Right one' })];
    expect(linkedThreads(['w-a'], two, 'nw')[0].title).toBe('Right one');
  });
});

describe('the threads offered to link', () => {
  const me = 'p-sav';
  const directs = new Set(['direct-1']);
  it('offers her other open threads, newest first', () => {
    const out = linkCandidates(items[0], items, [], { me, direct: directs }).map((i) => i.id);
    expect(out).toEqual(['w-b', 'w-c']);
  });
  it('never offers this thread, one already linked, a finished one, a teammate’s, a message or an agent', () => {
    const out = linkCandidates(items[0], items, ['w-b'], { me, direct: directs }).map((i) => i.id);
    expect(out).toEqual(['w-c']);
    expect(out).not.toContain('w-a');
    expect(out).not.toContain('w-done');
    expect(out).not.toContain('w-maya');
    expect(out).not.toContain('w-msg');
    expect(out).not.toContain('w-agent');
  });
  it('offers everything open when nobody is signed in, since every row is hers', () => {
    const out = linkCandidates(items[0], items, [], { me: null, direct: new Set() }).map((i) => i.id);
    expect(out).toContain('w-maya');
  });
});

describe('the owner', () => {
  const byId = new Map([['p-maya', { id: 'p-maya', name: 'Maya Chen' }]]);
  it('is you on a thread you started, or one with nobody on it', () => {
    expect(ownerName(row({ createdBy: 'p-sav' }), 'p-sav', byId)).toBe('You');
    expect(ownerName(row({}), 'p-sav', byId)).toBe('You');
  });
  it('is the teammate’s full name on a thread they started', () => {
    expect(ownerName(row({ createdBy: 'p-maya' }), 'p-sav', byId)).toBe('Maya Chen');
  });
  it('is never a raw id, even for someone who has left the team', () => {
    expect(ownerName(row({ createdBy: 'p-gone' }), 'p-sav', byId)).toBe('Someone');
  });
});
