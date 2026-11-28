// The thread you look for is most often one you had open in the last hour, so
// the desktop's search puts what you opened in the last two hours first, then
// the last day (2026-11-22, shared/opened-lately). The phone parity round of
// 2026-11-25 found the phone's search ordering by match alone, though the
// phone keeps when it opened each thread for its unread dots.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSearch } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const H = 3_600_000;
const item = (id: string, title: string) => ({ id, product: 'alpha', title, kind: 'directive', status: 'blocked', labels: ['founder'], priority: 5, createdAt: NOW - 10 * 24 * H, updatedAt: NOW - (id === 'w-new' ? H : 9 * 24 * H) });
const view = { items: [item('w-new', 'Pricing page copy'), item('w-old', 'Pricing table for the launch')], products: [{ slug: 'alpha', name: 'Alpha' }] } as never;

describe('search on the phone', () => {
  it('puts a thread you opened in the last two hours first', () => {
    const ids = phoneSearch(view, 'pricing', NOW, undefined, { 'alpha/w-old': NOW - 30 * 60_000 }).map((h) => h.id);
    expect(ids[0]).toBe('w-old');
  });

  it('orders by match as before when you opened neither lately', () => {
    const plain = phoneSearch(view, 'pricing', NOW).map((h) => h.id);
    expect(phoneSearch(view, 'pricing', NOW, undefined, { 'alpha/w-old': NOW - 3 * 24 * H }).map((h) => h.id)).toEqual(plain);
  });

  it('is given the times this phone opened each thread', () => {
    expect(fs.readFileSync(new URL('../mobile/src/app/search.tsx', import.meta.url), 'utf8')).toMatch(/phoneSearch\(c\.view, q, c\.now, c\.tabs, c\.openedAt\)/);
  });
});
