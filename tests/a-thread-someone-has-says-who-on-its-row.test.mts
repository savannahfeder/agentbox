// A THREAD SOMEONE YOU ASKED HAS SAYS WHO, ON ITS ROW AND ITS CARD (w-f702d60afe, 2026-11-20).
//
// Photographed on the board on Sam's copy while Theo reviewed his thread: the
// card read "NOTHING RUNNING", true of the agent and no use to Sam. His thread
// is out with Theo, which is the thing to say, as "Back from Theo" says the
// other half once it returns.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askedOutWord } from '../shared/thread-asks.mts';

const ask = (o: Record<string, unknown>) => ({
  id: 't1', product: 'dm', labels: ['given-task'], status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 5,
  ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 5 } }, ...o,
});
const nameOf = (id: string) => (id === 'theo' ? 'Theo Okafor' : 'Lena Fischer');

describe('the word for a thread out with someone you asked', () => {
  it('names them and what they are doing', () => {
    expect(askedOutWord([ask({})] as never, 'sam', 'w-1', nameOf)).toBe('Theo is reviewing');
    expect(askedOutWord([ask({ ask: { kind: 'help', owner: 'sam', thread: 'w-1', product: 'api' } })] as never, 'sam', 'w-1', nameOf)).toBe('Theo is helping');
  });
  // Round eleven: the board said "Theo is reviewing" while his own page said
  // "Review · Not opened"; Sam could not tell whether Theo had seen it.
  it('says it is asked, not being done, until they open it', () => {
    const seen = (at: number) => () => at;
    expect(askedOutWord([ask({})] as never, 'sam', 'w-1', nameOf, seen(0))).toBe('Asked Theo for a review');
    expect(askedOutWord([ask({ ask: { kind: 'help', owner: 'sam', thread: 'w-1', product: 'api' } })] as never, 'sam', 'w-1', nameOf, seen(4))).toBe('Asked Theo for help');
    expect(askedOutWord([ask({})] as never, 'sam', 'w-1', nameOf, seen(5))).toBe('Theo is reviewing');
    expect(askedOutWord([ask({})] as never, 'sam', 'w-1', nameOf, seen(9))).toBe('Theo is reviewing');
  });
  it('says nothing once it is handed back, or on another thread', () => {
    expect(askedOutWord([ask({ verdict: 'yes', status: 'done' })] as never, 'sam', 'w-1', nameOf)).toBeNull();
    expect(askedOutWord([ask({})] as never, 'sam', 'w-2', nameOf)).toBeNull();
  });
  it('is what the row and the board card say', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/const shownWord = wants \?\? backFrom \?\? askedOut \?\?/);
    // No agent mark and no try again: the agent did not stop, a person has it.
    expect(pages).toMatch(/askedOut && shownWord === askedOut \? \{ \.\.\.worded, word: shownWord, agent: false, title: undefined \}/);
    expect(pages).toMatch(/retry=\{askedOut \? undefined : retry\}/);
    expect(pages).toMatch(/const waitWord = e\.item\s*\? \(team \? askedOutWord\(allItems \?\? \[\], team\.me, e\.item\.id, \(id: string\) => team\.byId\.get\(id\)\?\.name \?\? '', askSeen\(team\.state\.seen\)\) : null\) \?\?/);
    expect(pages).toContain("askedOutWord(allItems ?? [], team.me, item.id, (id) => team.byId.get(id)?.name ?? '', askSeen(team.state.seen))");
  });
});
