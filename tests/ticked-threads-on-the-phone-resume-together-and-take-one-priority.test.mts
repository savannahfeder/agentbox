// TICKED THREADS ON THE PHONE RESUME TOGETHER AND TAKE ONE PRIORITY.
//
// The desktop's commands on ticked rows (App.tsx `itemCommands` with a
// selection) include "Resume agents (k of n selected)", counting only the rows
// no worker is on, and the four priorities, each marked current only when every
// ticked row agrees. The phone's More sheet over ticked threads had Later and
// Mark read or unread only, and `thread:resume` was the parity ledger's gap for
// it (measured 2026-11-08 with `node scripts/phone-parity.mjs`). These cases
// hold mobile/src/lib/picked.ts to the desktop's rules and its toasts
// (`putAgentBackOn`, `retag`), which have no Undo there either.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pickedPlan, pickedPriority, pickedResume } from '../mobile/src/lib/picked';

const t = (id, extra = {}) => ({ product: 'alpha@a1b2c3d4e5f6', id, title: `Thread ${id}`, status: 'blocked', ...extra });
const workingOn = (ids) => (i) => ids.includes(i.id);
const idle = workingOn([]);

describe('Resume agents', () => {
  it('is offered for every ticked thread no agent is on, counting those against the ticks', () => {
    expect(pickedResume([t('a'), t('b'), t('c')], workingOn(['b']))).toEqual({ ids: ['a', 'c'], of: 3 });
  });

  it('takes closed threads too, as the desktop does', () => {
    expect(pickedResume([t('a', { status: 'done' })], idle)).toEqual({ ids: ['a'], of: 1 });
  });

  it('is not offered when an agent is on every ticked thread', () => {
    expect(pickedResume([t('a'), t('b')], workingOn(['a', 'b']))).toBeNull();
  });

  it('leaves out what the computer has not made yet and an agent\'s own session', () => {
    expect(pickedResume([t('a', { waitsForMac: true }), t('b', { agent: { tool: 'claude' } }), t('c')], idle)).toEqual({ ids: ['c'], of: 3 });
    expect(pickedResume([t('a', { waitsForMac: true })], idle)).toBeNull();
  });

  it('sends one resume for those threads and says how many, as the desktop\'s toast does', () => {
    const plan = pickedPlan({ kind: 'resume' }, [t('a'), t('b'), t('c')], { working: workingOn(['b']) });
    expect(plan.steps).toEqual([{ door: 'resumeItems', payload: { ids: ['a', 'c'] } }]);
    expect(plan.toast).toBe('2 resumed');
    expect(plan.undo).toBeUndefined();
  });

  it('says they wait for the computer while it is away and nothing else starts them', () => {
    expect(pickedPlan({ kind: 'resume' }, [t('a')], { working: idle, waits: true }).toast).toBe('Up next once your computer is back.');
  });

  it('sends nothing when no ticked thread can resume', () => {
    expect(pickedPlan({ kind: 'resume' }, [t('a')], { working: workingOn(['a']) })).toBeNull();
  });
});

describe('Priority', () => {
  it('is marked at the level every ticked thread shares', () => {
    expect(pickedPriority([t('a', { priority: 9 }), t('b', { priority: 9 })])).toEqual({ value: 9 });
    expect(pickedPriority([t('a'), t('b', { priority: 5 })])).toEqual({ value: 5 });
  });

  it('is marked at no level when they disagree', () => {
    expect(pickedPriority([t('a', { priority: 9 }), t('b', { priority: 2 })])).toEqual({ value: null });
  });

  it('is offered on closed threads too, as the desktop does, but not with only unmade ones ticked', () => {
    expect(pickedPriority([t('a', { status: 'done', priority: 7 })])).toEqual({ value: 7 });
    expect(pickedPriority([t('a', { waitsForMac: true })])).toBeNull();
    expect(pickedPriority([])).toBeNull();
  });

  it('sets the level on each ticked thread and counts them in the toast', () => {
    const plan = pickedPlan({ kind: 'priority', value: 7 }, [t('a'), t('b', { waitsForMac: true }), t('c')], { working: idle });
    expect(plan.steps).toEqual([
      { door: 'threadEdit', payload: { product: 'alpha@a1b2c3d4e5f6', id: 'a', patch: { priority: 7 } } },
      { door: 'threadEdit', payload: { product: 'alpha@a1b2c3d4e5f6', id: 'c', patch: { priority: 7 } } },
    ]);
    expect(plan.toast).toBe('2 set to high');
    expect(plan.undo).toBeUndefined();
  });

  it('names the level alone for one thread', () => {
    expect(pickedPlan({ kind: 'priority', value: 9 }, [t('a')], { working: idle }).toast).toBe('Priority: urgent');
  });
});

describe('the inbox page', () => {
  const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
  it('offers both in the More sheet over ticked threads, and sends them together', () => {
    expect(inbox).toMatch(/pickedResume\(pickedItems, /);
    expect(inbox).toMatch(/pickedPriority\(pickedItems\)/);
    expect(inbox).toMatch(/<PriorityRows /);
    expect(inbox).toMatch(/c\.pressPicked\(/);
    expect(fs.readFileSync('mobile/src/state/cloud.tsx', 'utf8')).toMatch(/pickedPlan\(press, items, /);
  });
});
