// A THREAD READS THE SAME DATE IN THE PHONE'S INBOX AND IN SEARCH (QA M-51,
// native Android, 2026-11-12).
//
// "Todo completion counting function" read Nov 4 in In progress and NOV 5 in
// search. The list dates a row by when you last wrote (sentAt) or when it was
// closed; search used updatedAt, which an agent's note moves. Measured from
// the tester's dumps and by reading phoneTabs and phoneSearch.
import { describe, it, expect } from 'vitest';
import { phoneSearch, rowTime } from '../mobile/src/lib/tabs';
import { stamp } from '../renderer/src/format';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 12, 20);
const sent = now - 8 * DAY;
const touched = now - 7 * DAY;
const view = (item: object) => ({ products: [{ slug: 'todo', name: 'Todo' }], items: [{ product: 'todo', productName: 'Todo', kind: 'directive', ...item }], running: [] });

describe('the date on a thread', () => {
  const open = { id: 'w-1', title: 'Todo completion counting function', body: 'countDone', status: 'claimed', createdAt: sent, updatedAt: touched, wrote: { body: { ts: sent, source: 'founder' }, note: { ts: touched, source: 'agent' } } };

  it('in search is when you last wrote, as in the list, not when an agent last touched it', () => {
    expect(rowTime(open as never)).toBe(sent);
    const [hit] = phoneSearch(view(open) as never, 'countDone', now);
    expect(hit.when).toBe(stamp(sent, now));
    expect(hit.when).not.toBe(stamp(touched, now));
  });

  it('on a closed thread is when it was closed, in both', () => {
    const closed = { ...open, status: 'done', updatedAt: now - DAY, wrote: { ...open.wrote, status: { ts: touched, source: 'founder' } } };
    expect(rowTime(closed as never)).toBe(touched);
    expect(phoneSearch(view(closed) as never, 'countDone', now)[0].when).toBe(stamp(touched, now));
  });
});
