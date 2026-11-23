// REOPENING A DONE THREAD STARTS NOTHING AND SAYS REOPENED (w-34443a206b).
//
// A tester on 2026-11-22 pressed Reopen on a thread they had closed while its
// agent was on their last reply. The thread said "You sent it back" and a run
// started on that old reply again. Closing a running thread hands its reply
// back to the queue (a stop releases the delivery mark), and Reopen wrote a
// plain open, so the queue took the reply as still owed. Measured on the
// supervisor's queue and stopped lists, and on the thread's own history.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';

const T = 1_790_000_000_000;
const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

const reopened = {
  id: 'w-thread', product: 'p', status: 'open', kind: 'task', labels: ['founder'], title: 'Fix the cart',
  answer: 'Use the second layout.',
  wrote: { answer: { ts: T, source: 'founder' }, status: { ts: T + 60_000, source: 'founder' } },
};

const queue = () => {
  const sup = Object.create(Supervisor.prototype) as InstanceType<typeof Supervisor>;
  sup._handledAnswers = new Set();
  sup._saveState = () => {};
  return sup;
};

describe('the reply on a thread you reopen', () => {
  it('is kept as heard, so the queue does not run it again', () => {
    const sup = queue();
    expect(sup._answerDelivered(reopened)).toBe(false);
    sup.keepReplyHeard(reopened);
    expect(sup._answerDelivered(reopened)).toBe(true);
  });

  it('a later reply of yours is new and still runs', () => {
    const sup = queue();
    sup.keepReplyHeard(reopened);
    const replied = { ...reopened, answer: 'Carry on.', wrote: { ...reopened.wrote, answer: { ts: T + 120_000, source: 'founder' } } };
    expect(sup._answerDelivered(replied)).toBe(false);
  });

  it('is what Reopen asks for, and only Reopen', () => {
    const app = read('renderer/src/App.tsx');
    const fn = app.slice(app.indexOf('const reopenDone = useCallback'), app.indexOf('const reopenDone = useCallback') + 600);
    expect(fn).toMatch(/status: 'open', reopen: true/);
    const ipc = read('main/ipc.mts');
    expect(ipc).toMatch(/if \(reopen && status === 'open' && !answer\)/);
    expect(ipc).toMatch(/supervisor\.keepReplyHeard\(/);
  });
});

describe('the thread', () => {
  const lines = [
    { ts: T - 1000, source: 'founder', patch: { title: 'Fix the cart', status: 'open' } },
    { ts: T + 30_000, source: 'founder', patch: { status: 'done' } },
    { ts: T + 60_000, source: 'founder', patch: { status: 'open' } },
  ];
  const said = (ls: unknown[]) => threadEvents(ls as never).map((e) => e.said);

  it('says you reopened it', () => {
    expect(said(lines)).toContain('You reopened it');
    expect(said(lines)).not.toContain('You sent it back');
  });

  it('still says sent it back for a thread that was not done', () => {
    const stopped = [lines[0], { ts: T + 30_000, source: 'founder', patch: { status: 'blocked' } }, lines[2]];
    expect(said(stopped)).toContain('You sent it back');
    expect(said(stopped)).not.toContain('You reopened it');
  });
});
