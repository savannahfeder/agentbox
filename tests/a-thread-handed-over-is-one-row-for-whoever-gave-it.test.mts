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
    expect(app).toContain("i.status === 'done' && !sentAwayByMe(i, team?.me ?? null)");
    expect(app).toContain('const boardItemsHere = useMemo(() => items.filter((i) => !sentAwayByMe(i, team?.me ?? null)), [items, team?.me]);');
  });
});

// The same review: the only way back was Reopen, which left Theo holding the task.
describe('taking a handed-over thread back', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('is the menu row, and ends their task before reopening yours', async () => {
    const { threadMenuRows } = await import('../renderer/src/threads/ThreadMenu.tsx');
    expect(threadMenuRows({ change: false, terminal: null, finish: false, reopen: true }).map((r) => r.label)).toContain('Take it back');
    expect(app).toContain('onReopen={() => (handedToPage(focused) ? takeHandOverBack(focused) : sendBack(focused))}');
    const fn = app.slice(app.indexOf('const takeHandOverBack'), app.indexOf('const takeAskBack'));
    // Not a reopen: that starts the agent again (a second walk-through saw it run). Back to Needs you instead.
    expect(fn).not.toContain('window.zero?.reopen?.(');
    expect(fn.indexOf("status: 'done'")).toBeLessThan(fn.indexOf("await api.answer({ product: item.product, id: item.id, status: 'blocked' });"));
  });
  it('reads "Sam took it back" for whoever held it', async () => {
    const { taskWords } = await import('../renderer/src/team/company.ts');
    const nameOf = (id: string) => ({ sam: 'Sam', theo: 'Theo' })[id] ?? '';
    const product = { slug: 'dm', team: { direct: true, projectId: 'd1', people: ['sam', 'theo'] } };
    const closed = task({ status: 'done', wrote: { status: { by: 'sam', ts: 9 } } });
    expect(taskWords(closed as never, product as never, 'theo', nameOf, true)?.word).toBe('Sam took it back');
    const finished = task({ status: 'done', wrote: { status: { by: 'theo', ts: 9 } } });
    expect(taskWords(finished as never, product as never, 'sam', nameOf, true)?.word).toBe('Theo marked it done');
  });
});

// A live check after the first try: the menu's Take it back ran a plain
// reopen, so Theo kept the task; and every ask read as a hand-over on Theo's
// copy, "Sam handed this thread to you".
describe('the wiring a live check caught', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('the menu row on a handed-on thread runs the take-back, not a plain reopen', () => {
    expect(focus).toContain('onReopen={!canFinish && !agent && !takenBack ? (handedName ? onReopen : onReopenDone) ?? null : null}');
  });
  it('a handed-on thread offers no Mark as shipped', () => {
    expect(focus).toContain('shipped={handedName ? null : shippedMark}');
  });
  it('an ask is not taken for the task a hand-over made', async () => {
    const { taskHandedFrom } = await import('../renderer/src/threads/page-rules.ts');
    const asked = task({ ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' } });
    expect(taskHandedFrom([asked] as never, 'w-1', 'sam')).toBeNull();
    expect(taskHandedFrom([task()] as never, 'w-1', 'sam')).not.toBeNull();
  });
});

describe('the giver\'s Done row', () => {
  it('says who has it, not Done', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toContain(': `Handed to ${handedOnName.split(/\\s+/)[0]}`;');
  });
});

describe('the side that held it', () => {
  it('says Sam took this back on the task page, and offers no Reopen', () => {
    const team = fs.readFileSync(new URL('../renderer/src/team/TeamFocus.tsx', import.meta.url), 'utf8');
    expect(team).toContain("handedFrom(item.body, taskGiver(item)) && closer === taskGiver(item) ? `${closer === team.me ? 'you' : name} took this back`");
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toContain('onReopen={!canFinish && !agent && !takenBack ?');
  });
});

// A regression look: with the task off the lists, Sam's In progress said
// "Nothing is running" while Theo had four of his threads, and Done read as
// finished. The thread itself now stays in In progress while Theo's task is
// open, and says how it stands.
describe('the giver\'s thread while it is out', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  it('is in In progress, not Done, while their task is open', () => {
    expect(app).toContain("return task && task.status !== 'done' ? [r.id] : [];");
    expect(app).toContain('      if (handedOut.has(i.id)) return true;');
    expect(app).toContain("!sentAwayByMe(i, team?.me ?? null) && !handedOut.has(i.id)))");
  });
  it('says With Theo, then Theo finished it', () => {
    expect(pages).toContain('`With ${handedOnName.split(/\\s+/)[0]}`');
    expect(pages).toContain('`${handedOnName.split(/\\s+/)[0]} finished it`');
  });
});

// The regression look: Sam replied on a thread he had handed over, which
// reopened it for him while Theo still held the task, so both owned it.
describe('the reply box on a thread they have', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('makes way for Take it back while their task is open', () => {
    expect(focus).toContain("const outWithThem = !!handedTask && handedTask.status !== 'done';");
    expect(focus).toContain('{outWithThem ? <div className="dock-handed"><span>{handedName!.split(/\\s+/)[0]} has this now.</span>{onReopen && <button type="button" className="ts-done" onClick={onReopen}>Take it back</button>}</div> : <div className="dock-card">');
  });
});
