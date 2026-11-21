// AN ASK IS SENT ONCE, AND ENDS IN WORDS THAT SAY HOW (w-f702d60afe, 2026-11-21).
//
// A bug hunt over the hand-off found, on two stage copies: Ctrl+Enter did
// nothing in the ask and hand-over sheets though their button showed the key
// (the menu's key handler swallowed Enter in a textarea); the same person
// could be asked twice and the row then said "2 people are reviewing"; a
// hand-over toast could read "Theo and Theo no longer have the ask", naming
// the person it was just handed to; an ask Sam took back read "Sam marked it
// done" on Theo's side, and every finished ask read plain "Done".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { askedOutWord } from '../shared/thread-asks.mts';
import { GIVEN_TASK } from '../shared/team-rules.mts';
import { taskWords } from '../renderer/src/team/company.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const nameOf = (id: string) => ({ sam: 'Sam', theo: 'Theo', lena: 'Lena' })[id] ?? '';
const ask = (o: Record<string, unknown>) => ({
  id: 't1', product: 'dm', labels: [GIVEN_TASK], status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 5,
  people: ['sam', 'theo'], ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 5 } }, ...o,
});
const product = { slug: 'dm', team: { direct: true, projectId: 'd1', people: ['sam', 'theo'] } };

describe('a row counts people, not asks', () => {
  it('two asks to one person read as that person', () => {
    expect(askedOutWord([ask({}), ask({ id: 't2' })] as never, 'sam', 'w-1', nameOf)).toBe('Theo is reviewing');
  });
  it('two people still read as two', () => {
    expect(askedOutWord([ask({}), ask({ id: 't2', assignee: 'lena' })] as never, 'sam', 'w-1', nameOf)).toBe('2 people are reviewing');
  });
});

describe('the menu will not ask the same person twice', () => {
  const menu = read('renderer/src/threads/ThreadMenu.tsx');
  const app = read('renderer/src/App.tsx');
  it('marks who already has an open ask on the thread', () => {
    expect(app).toContain('people.map((p) => (asked.has(p.id) ? { ...p, asked: true } : p))');
  });
  it('greys them out with the reason, only when asking', () => {
    expect(menu).toContain('disabled={asking && p.asked}');
    expect(menu).toContain('<span className="ts-more-detail">Already asked</span>');
  });
});

describe('the sheets send on the key their button shows', () => {
  it('lets a key typed in a sheet\'s box reach the box', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    const typing = menu.indexOf("['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')");
    expect(typing).toBeGreaterThan(-1);
    // It must come before the line that stops Enter, or that line wins.
    expect(typing).toBeLessThan(menu.indexOf("(e.key === 'Enter' || e.key === ' ') && wrap.current?.contains(document.activeElement)"));
  });
});

describe('the hand-over toast names only who lost the ask', () => {
  it('leaves out the person it went to, and says each name once', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('const letGo = [...new Set(asked.filter((a) => a.to !== to.id)');
  });
});

describe('a finished ask says how it ended', () => {
  const done = (by: string, o: Record<string, unknown> = {}) => ask({ status: 'done', wrote: { status: { by, ts: 9 } }, ...o });
  it('taken back by the asker, to the person asked and to the asker', () => {
    expect(taskWords(done('sam') as never, product as never, 'theo', nameOf, true)?.word).toBe('Sam took it back');
    expect(taskWords(done('sam') as never, product as never, 'theo', nameOf, false)?.word).toBe('Sam took it back');
    expect(taskWords(done('sam') as never, product as never, 'sam', nameOf, false)?.word).toBe('You took it back');
  });
  it('answered, it says the answer to the asker', () => {
    expect(taskWords(done('theo', { verdict: 'yes' }) as never, product as never, 'sam', nameOf, false)?.word).toBe('Theo says it looks good');
    expect(taskWords(done('theo', { verdict: 'changes' }) as never, product as never, 'sam', nameOf, false)?.word).toBe('Theo asked for changes');
    expect(taskWords(done('theo', { verdict: 'done' }) as never, product as never, 'sam', nameOf, false)?.word).toBe('Theo handed it back');
    expect(taskWords(done('theo', { verdict: 'yes' }) as never, product as never, 'theo', nameOf, false)?.word).toBe('You handed it back');
  });
  it('a plain task someone finished reads as before', () => {
    const plain = done('theo', { ask: undefined });
    expect(taskWords(plain as never, product as never, 'sam', nameOf, true)?.word).toBe('Theo marked it done');
    expect(taskWords(plain as never, product as never, 'sam', nameOf, false)?.word).toBe('Done');
  });
});

// Theo's Home still read "Sam asks for a review" 20 seconds after Sam took it back.
describe('Home says how a closed ask ended', () => {
  it('uses the same words as the row', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("const ended = from && i.ask && i.status === 'done' && team ? taskWords(");
    expect(app).toContain('from: ended ?? (from ? `${from}${asks}` : null)');
  });
});

// Theo's inbox read "From Sam" on a thread Sam handed him for good, the same as a message.
describe('a thread handed over says so in the inbox', () => {
  it('reads "Sam handed it to you", and a plain task still reads "From Sam"', async () => {
    const { threadLink, sentWords } = await import('../shared/thread-link.mts');
    const body = sentWords('Add a key', threadLink('sam', 'w-1')!, 'Yours now.');
    const given = ask({ ask: undefined, body });
    const inbox = { slug: 'dm', team: { direct: true, projectId: 'd1', people: ['sam', 'theo'] } };
    expect(taskWords(given as never, inbox as never, 'theo', nameOf)?.word).toBe('Sam handed it to you');
    expect(taskWords(ask({ ask: undefined, body: 'Do this' }) as never, inbox as never, 'theo', nameOf)?.word).toBe('From Sam');
  });
});
