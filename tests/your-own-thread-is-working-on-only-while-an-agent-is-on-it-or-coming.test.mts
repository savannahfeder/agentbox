// YOUR OWN THREAD IS "WORKING ON" ONLY WHILE AN AGENT IS ON IT OR COMING.
//
// A synthetic tester, round four: he gave a task to Codex, Codex was out of
// usage, and Everyone still listed it under his own Working on. Then he closed
// a finished thread with its "Close this task" option and, with the Done toast
// still up, Everyone listed it under Working on with its old progress line.
// Measured with `teamToday` on the rows the window passes it: your own open
// threads went under Working on whatever the supervisor said it would not
// start (only a teammate's card heard that, through `cardsFor`), and a row held
// in the undo window has already left Needs you while its status is still
// open, so it fell through to Working on.
//
// Now your own rows read the card's own rule (`cardStateOf`) against your
// supervisor, and a row whose move is held in the undo window is left out
// until it is written.
import { describe, it, expect } from 'vitest';
import { teamToday, groupsOf } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const AT = new Date(2026, 10, 11, 10, 45).getTime();
const item = (o: Record<string, unknown>) => ({ product: 'payments', status: 'open', labels: ['founder'], updatedAt: AT, createdAt: AT - 60_000, title: o.id, ...o });
const card = (o: Record<string, unknown>) => ({ personId: 'p-lena', visible: true, state: 'running', project: 'Payments', blockedBy: [], blocks: [], people: null, priority: null, problem: null, progress: null, solution: null, updatedAt: AT, ...o });
type Opts = { items?: Record<string, unknown>[]; cards?: Record<string, unknown>[]; supervisor?: Record<string, unknown>; undoing?: ReadonlySet<string> };
const day = ({ items = [], cards = [], supervisor, undoing }: Opts) => teamToday({
  range: 'today', now: NOW, me: 'p-me', items: items as never, products: [{ slug: 'payments', name: 'Payments API' }] as never,
  cards: cards as never, decisions: [], needs: [], people: [{ id: 'p-lena', name: 'Lena Ruiz' }], mates: [], mateOf: () => null,
  ...(supervisor ? { supervisor: supervisor as never } : {}), ...(undoing ? { undoing } : {}),
});
const groups = (d: ReturnType<typeof day>, key = 'me') => {
  const p = d.people.find((x) => x.key === key);
  return p ? groupsOf(p) : { working: [], todo: [], done: [], blocked: [] };
};
const ids = (lines: { item?: { id: string }; card?: { threadId: string } }[]) => lines.map((l) => l.item?.id ?? l.card?.threadId);

const overlap = item({ id: 'w-overlap', title: 'Payments API overlapping booking validation', engine: 'codex' });
const atLimit = { atLimit: { 'w-overlap': { tool: 'Codex', until: NOW + 3_600_000 } } };

describe('your own thread sent to Codex while Codex is out of usage', () => {
  it('is not Working on, and is Blocked on Codex usage as the team reads it', () => {
    const g = groups(day({ items: [overlap], supervisor: atLimit }));
    expect(g.working).toEqual([]);
    expect(g.blocked.map((l) => [l.item?.id, l.on])).toEqual([['w-overlap', 'Codex usage']]);
  });

  it('whose start died at the limit is not Working on either', () => {
    const died = item({
      id: 'w-overlap', result: 'Codex is at its usage limit on Plus, so nothing has been done on this task. It starts again on its own when the limit resets.',
      wrote: { result: { ts: AT, source: 'agent' } },
    });
    const g = groups(day({ items: [died], supervisor: atLimit }));
    expect(g.working).toEqual([]);
    expect(g.blocked.map((l) => l.on)).toEqual(['Codex usage']);
  });

  it('signed out, or that nothing will start again, is not Working on', () => {
    expect(groups(day({ items: [overlap], supervisor: { signInNeeded: { 'w-overlap': 'Codex' } } })).working).toEqual([]);
    expect(groups(day({ items: [overlap], supervisor: { stalled: ['w-overlap'] } })).working).toEqual([]);
  });
});

describe('your own thread that is being worked on', () => {
  it('with an agent on it is Working on, its tool at the limit or not', () => {
    const claimed = item({ id: 'w-overlap', status: 'claimed', claim: { holder: 'mcp-1' } });
    expect(ids(groups(day({ items: [claimed], supervisor: atLimit })).working)).toEqual(['w-overlap']);
    const second = item({ id: 'w-overlap', result: 'First turn.' });
    expect(ids(groups(day({ items: [second], supervisor: { ...atLimit, running: [{ itemId: 'w-overlap' }] } })).working)).toEqual(['w-overlap']);
  });

  it('waiting its turn for a free slot stays Working on', () => {
    expect(ids(groups(day({ items: [overlap], supervisor: { queued: ['w-overlap'] } })).working)).toEqual(['w-overlap']);
    expect(ids(groups(day({ items: [overlap], supervisor: { cannotStart: { 'w-overlap': { why: 'memory', tool: 'Codex' } } } })).working)).toEqual(['w-overlap']);
    expect(ids(groups(day({ items: [overlap] })).working)).toEqual(['w-overlap']);
  });
});

describe('your own thread you closed', () => {
  const finished = item({
    id: 'w-health', title: 'GET /health endpoint with test', updatedAt: new Date(2026, 10, 11, 10, 20).getTime(),
    progress: 'Added the route\nCommitted with a test', result: 'Done, the endpoint and its test are in.\n\n## Options\n1. Close this task (recommended)',
    wrote: { result: { ts: new Date(2026, 10, 11, 10, 20).getTime(), source: 'agent' } },
  });

  it('while its close is still in the undo window is not Working on, nor anywhere', () => {
    const g = groups(day({ items: [finished], undoing: new Set(['w-health']) }));
    expect(Object.values(g).flat()).toEqual([]);
  });

  it('a moment ago is Done', () => {
    const closed = { ...finished, status: 'done', updatedAt: NOW - 5_000, wrote: { ...finished.wrote as object, status: { ts: NOW - 5_000, source: 'founder' } } };
    const g = groups(day({ items: [closed] }));
    expect(g.working).toEqual([]);
    expect(ids(g.done)).toEqual(['w-health']);
  });
});

describe("a teammate's card", () => {
  it('is unchanged by your own supervisor and your undo window', () => {
    const cards = [card({ threadId: 'w-overlap', title: 'Their overlap check' }), card({ threadId: 'w-wait', title: 'Payouts export', state: 'waiting' })];
    const g = groups(day({ cards, supervisor: { stalled: ['w-overlap', 'w-wait'], ...atLimit }, undoing: new Set(['w-overlap']) }), 'person:p-lena');
    expect(ids(g.working)).toEqual(['w-overlap']);
    expect(ids(g.todo)).toEqual(['w-wait']);
  });
});
