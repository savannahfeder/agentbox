// The desktop's close, reopen and do-it-here toasts, and what Undo says after
// them, stopped naming a thread by the first words typed and use the name its
// row shows (2026-11-22). The phone parity round of 2026-11-25 found the
// phone's toasts still on `item.title`: a thread renamed "Pricing page" closed
// as "Done: make the pricing page say monthly and yearly…".
import { describe, it, expect } from 'vitest';
import { planFor } from '../mobile/src/lib/actions';

const NOW = Date.UTC(2026, 10, 25, 12);
const renamed = { product: 'p', id: 'w-1', status: 'blocked', title: 'make the pricing page say monthly and yearly prices', label: 'Pricing page', wrote: { label: { ts: NOW - 1000 } } };
const plain = { product: 'p', id: 'w-2', status: 'blocked', title: 'Fix the sign-in link' };

describe("the phone's toasts", () => {
  it('name a renamed thread by its name when it is closed, and when Undo reopens it', () => {
    const plan = planFor({ kind: 'close' }, renamed, NOW)!;
    expect(plan.toast).toMatch(/^Done: Pricing page/);
    expect(plan.undone!({})).toBe('Reopened: Pricing page');
  });

  it('name it by its name when it is reopened', () => {
    expect(planFor({ kind: 'reopen' }, { ...renamed, status: 'done' }, NOW)!.toast).toBe('Reopened: Pricing page');
  });

  it('name it by its name when a send that never reached the computer is withdrawn', () => {
    const plan = planFor({ kind: 'close' }, { ...renamed, status: 'open', waitsForMac: true }, NOW)!;
    expect(plan.toast).toMatch(/^Withdrawn: Pricing page\./);
    expect(plan.undone!({})).toBe('Sent again: Pricing page');
  });

  it('still use the first words when nobody renamed it', () => {
    expect(planFor({ kind: 'close' }, plain, NOW)!.toast).toMatch(/^Done: Fix the sign-in link/);
  });
});
