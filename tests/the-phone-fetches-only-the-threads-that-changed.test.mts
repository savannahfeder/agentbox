// THE PHONE FETCHES ONLY THE THREADS THAT CHANGED.
//
// What broke (found reading the code, 2026-10-19): every five seconds the
// hosted phone fetched every thread's whole copy, up to a thousand of them at
// up to 900 KB each, over a phone's network; and the thousand was a silent
// ceiling on how many threads it could show.
//
// Now each read asks for the list of threads and when each last changed, and
// fetches the copies only of the ones that are new or changed since it last
// had them. A thread gone from the list is gone from the screen.
import { describe, it, expect } from 'vitest';
import { readThreads } from '../renderer/src/cloud-bridge';

const at = (n) => new Date(Date.UTC(2026, 9, 19, 12, 0, n)).toISOString();
const row = (item, n, extra = {}) => ({ device: 'a1b2c3d4e5f6', project: 'alpha', item, updated_at: at(n), ...extra });

function database(rows) {
  const asked = [];
  const select = async (table, query) => {
    asked.push(query);
    const q = new URLSearchParams(query);
    let out = rows.map((r) => ({ ...r }));
    const since = q.get('updated_at');
    if (since) out = out.filter((r) => r.updated_at >= decodeURIComponent(since.replace(/^gte\./, '')));
    if (!q.get('select').includes('snapshot')) out = out.map(({ snapshot, ...light }) => light);
    return out;
  };
  return { select, asked };
}

describe('a read of her threads', () => {
  it('fetches every copy the first time, then none when nothing changed', async () => {
    const db = database([row('w-1', 1, { snapshot: { v: 3, n: 1 } }), row('w-2', 2, { snapshot: { v: 3, n: 2 } })]);
    const cache = new Map();
    const first = await readThreads(db.select, cache);
    expect(first.map((t) => [t.item, t.snapshot.n])).toEqual([['w-1', 1], ['w-2', 2]]);
    db.asked.length = 0;
    const second = await readThreads(db.select, cache);
    expect(second.map((t) => t.item)).toEqual(['w-1', 'w-2']);
    expect(db.asked).toHaveLength(1);
    expect(db.asked[0]).not.toMatch(/snapshot/);
  });

  it('fetches only the copies changed since, and drops a thread gone from the list', async () => {
    const rows = [row('w-1', 1, { snapshot: { v: 3, n: 1 } }), row('w-2', 2, { snapshot: { v: 3, n: 2 } }), row('w-3', 3, { snapshot: { v: 3, n: 3 } })];
    const db = database(rows);
    const cache = new Map();
    await readThreads(db.select, cache);
    rows[0] = row('w-1', 9, { snapshot: { v: 3, n: 10 } });
    rows.splice(1, 1);
    db.asked.length = 0;
    const next = await readThreads(db.select, cache);
    expect(next.map((t) => [t.item, t.snapshot.n])).toEqual([['w-1', 10], ['w-3', 3]]);
    expect(db.asked[1]).toMatch(/updated_at=gte\./);
    expect(cache.size).toBe(2);
  });
});
