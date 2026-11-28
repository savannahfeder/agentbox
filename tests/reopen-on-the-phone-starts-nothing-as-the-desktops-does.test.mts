// Closing a running thread hands its reply back to the queue. On 2026-11-23
// the desktop's Reopen stopped running that reply again: it writes an open
// marked as a reopen, and the computer keeps the reply as heard, so the thread
// waits for a new word. The phone parity round of 2026-11-25 found the phone's
// Reopen still going through the send-back command, which queues the thread,
// so a finished thread reopened from the phone could start its old reply
// again. Send back to agent keeps queuing it, on both apps.
import { describe, it, expect } from 'vitest';
import { planFor } from '../mobile/src/lib/actions';
import { commandFor, phoneSlug } from '../renderer/src/cloud-bridge';
import { checkCommand } from '../shared/phone-snapshot.mts';
import { applyThrough } from '../main/phone-inbox.mts';

const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const done = { product: A, id: 'w-1', status: 'done', title: 'Ship the pricing page' };
const blocked = { ...done, status: 'blocked', productName: 'Alpha' };

describe('Reopen on the phone', () => {
  it('asks for a reopen of a finished thread, and Send back still asks for a send back', () => {
    expect(planFor({ kind: 'reopen' }, done)!.steps).toEqual([{ door: 'reopen', payload: { product: A, id: 'w-1', done: true } }]);
    expect(planFor({ kind: 'send-back' }, blocked)!.steps).toEqual([{ door: 'reopen', payload: { product: A, id: 'w-1' } }]);
  });

  it('leaves the computer a reopen that says so, which the computer accepts', () => {
    const on = (payload: Record<string, unknown>) => ({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reopen', payload });
    expect(commandFor('zero:reopen', { product: A, id: 'w-1', done: true })).toEqual(on({ done: true }));
    expect(commandFor('zero:reopen', { product: A, id: 'w-1' })).toEqual(on({}));
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'reopen', payload: { done: true } }, { projects: ['alpha'], hasItem: () => true })).toBeNull();
  });

  it("is done on the computer by the desktop's own reopen, and a send back by the send-back handler", async () => {
    const calls: unknown[] = [];
    const apply = applyThrough(new Map(['zero:answer', 'zero:reopen'].map((ch) => [ch, async (_e: unknown, args: unknown) => { calls.push([ch, args]); return { ok: true }; }])));
    await apply({ id: 'c1', kind: 'reopen', project: 'alpha', item: 'w-1', payload: { done: true } });
    await apply({ id: 'c2', kind: 'reopen', project: 'alpha', item: 'w-1', payload: {} });
    expect(calls).toEqual([
      ['zero:answer', { product: 'alpha', id: 'w-1', status: 'open', reopen: true }],
      ['zero:reopen', { product: 'alpha', id: 'w-1' }],
    ]);
  });
});
