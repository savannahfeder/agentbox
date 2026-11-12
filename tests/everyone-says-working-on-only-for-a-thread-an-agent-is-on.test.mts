// EVERYONE SAYS "WORKING ON" ONLY FOR A THREAD AN AGENT IS ON.
//
// Synthetic testers on one team: "Teammate reports stopped agent but Everyone
// says working", and "a card can't say what a task is blocked on". Measured with
// `teamToday` on a teammate's cards: every open card that moved today went under
// Working on whatever its state, so a card waiting on its owner read as work
// going on; and a card that waits on something in plain words (`name:`) found no
// owner for it and dropped to Working on too, saying nothing of the block.
//
// Now a running card is Working on, a waiting one is To do with how far it got,
// a Later one is neither (as your own are), and a block in words is Blocked on
// those words.
import { describe, it, expect } from 'vitest';
import { teamToday, groupsOf } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const AT = new Date(2026, 10, 11, 10, 0).getTime();
const card = (o: Record<string, unknown>) => ({ personId: 'p-theo', visible: true, state: 'running', project: 'Payments', blockedBy: [], blocks: [], people: null, priority: null, problem: null, progress: null, solution: null, updatedAt: AT, ...o });
const item = (o: Record<string, unknown>) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: AT, createdAt: AT, title: o.id, ...o });
const day = (cards: Record<string, unknown>[], items: Record<string, unknown>[] = []) => teamToday({
  range: 'today', now: NOW, me: 'p-me', items: items as never, products: [{ slug: 'lumen', name: 'Lumen', team: {} }] as never,
  cards: cards as never, decisions: [], needs: [], people: [{ id: 'p-theo', name: 'Theo Park' }], mates: [], mateOf: () => null,
});
const groups = (d: ReturnType<typeof day>, key = 'person:p-theo') => groupsOf(d.people.find((p) => p.key === key)!);
const titles = (lines: { title: string }[]) => lines.map((l) => l.title);

describe("a teammate's cards", () => {
  const d = day([
    card({ threadId: 'w-run', title: 'Refund webhook' }),
    card({ threadId: 'w-wait', title: 'Payouts export', state: 'waiting', progress: 'Wrote the query\nTests pass, not merged' }),
    card({ threadId: 'w-limit', title: 'Codex runbook', state: 'waiting', blockedBy: [{ id: 'name:Codex usage', title: 'Codex usage' }] }),
    card({ threadId: 'w-later', title: 'Ledger schema', state: 'scheduled' }),
  ]);
  const g = groups(d);

  it('Working on holds only the one an agent is on', () => {
    expect(titles(g.working)).toEqual(['Refund webhook']);
  });

  it('one waiting on its owner is To do, with how far it got', () => {
    expect(g.todo.map((l) => [l.title, l.says])).toEqual([['Payouts export', 'Tests pass, not merged']]);
  });

  it('one held by its tool is Blocked, on what holds it', () => {
    expect(g.blocked.map((l) => [l.title, l.on])).toEqual([['Codex runbook', 'Codex usage']]);
  });

  it('one put off till later is in none of them', () => {
    expect(Object.values(g).flat().map((l) => l.title)).not.toContain('Ledger schema');
  });

  it('a card blocked on a person still names the person', () => {
    const g2 = groups(day([card({ threadId: 'w-p', title: 'DNS', state: 'waiting', blockedBy: [{ id: 'person:p-me', title: null }] })]));
    expect(g2.blocked.map((l) => [l.title, l.on])).toEqual([['DNS', 'you']]);
  });
});

describe('your own thread that waits on something in words', () => {
  it('is Blocked on those words, not Working on', () => {
    const g = groups(day([], [item({ id: 'a', title: 'Go-live', blockedBy: ['name:the bank'] })]), 'me');
    expect(g.blocked.map((l) => [l.title, l.on])).toEqual([['Go-live', 'the bank']]);
    expect(g.working).toEqual([]);
  });
});
