// A THREAD HANDED OVER IS ONE ROW FOR WHOEVER GAVE IT (w-f702d60afe, 2026-11-21).
//
// A hand-off review on Sam's stage copy: after Sam handed a thread to Theo,
// the thread went to Done as "Handed over to Theo" and the task the hand-over
// made also sat in In progress as "Task · with Theo", the same title twice.
// The task stays off the giver's In progress, Done and board, as a sent ask
// does; a reply on it still reaches Needs you.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sentAwayByMe } from '../shared/thread-asks.mts';
import { sentWords, threadLink } from '../shared/thread-link.mts';
import { GIVEN_TASK } from '../shared/team-rules.mts';

const body = sentWords('Add a key', threadLink('sam', 'w-1')!, 'Yours now.');
const task = (o: Record<string, unknown> = {}) => ({ id: 't1', product: 'dm', labels: [GIVEN_TASK], status: 'open', assignee: 'theo', createdBy: 'sam', people: ['sam', 'theo'], body, ...o });

describe('what counts as sent away', () => {
  it('a hand-over of my own thread, to me who gave it', () => {
    expect(sentAwayByMe(task() as never, 'sam')).toBe(true);
  });
  it('not to the person who holds it', () => {
    expect(sentAwayByMe(task() as never, 'theo')).toBe(false);
  });
  it('not a plain task I gave, with no thread behind it', () => {
    expect(sentAwayByMe(task({ body: 'Do the thing' }) as never, 'sam')).toBe(false);
  });
  it('still an ask I sent', () => {
    expect(sentAwayByMe(task({ body: 'x', ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' }, wrote: { ask: { by: 'sam', ts: 1 } } }) as never, 'sam')).toBe(true);
  });
});

describe('the lists', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('keep it off In progress, Done and the board', () => {
    expect(app).toContain('      if (sentAwayByMe(i, team?.me ?? null)) return false;');
    expect(app).toContain("i.status === 'done' && !sentAwayByMe(i, team?.me ?? null))");
    expect(app).toContain('const boardItemsHere = useMemo(() => items.filter((i) => !sentAwayByMe(i, team?.me ?? null)), [items, team?.me]);');
  });
});
