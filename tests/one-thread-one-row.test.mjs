// The mask reads the CONVERSATION, not what happens to be in the list.
//
// The old rule hid a parent while a child sat in the inbox, so the instant the
// user answered the child the parent stepped forward wearing the words it was
// written with. Replaying several days of real writes and rebuilding both
// inboxes at each one, the returns to the inbox that said nothing new and were
// the system's doing went to zero under the new rule; the only returns left
// were the user's own snoozes coming due, and nothing else moved.
//
// Reachability was asserted at every replayed instant: zero rows masked
// without a live descendant, zero conversations left with no visible row. The
// audit harness was temporary and deleted; the properties it checked are the
// last three tests here, on a fixture cut from a real store.
import { describe, it, expect } from 'vitest';
import { threadMasked } from '../renderer/src/list-rules';

// The old rule, restated so the comparisons below are not asserted on faith.
const oldMask = (candidates) => new Set(
  candidates.filter((i) => candidates.some((c) => c.parent === i.id)).map((i) => i.id),
);

describe('the exhibit: w-55fa688ac8, 2026-08-14 19:44:38', () => {
  // A directive with a question filed under it. The child was answered at
  // 19:44:38 and the parent reappeared in the same instant carrying
  // yesterday's heading, which read as a duplicate.
  const parent = { id: 'w-55fa688ac8' };
  const child = { id: 'w-01666ceb2c', parent: 'w-55fa688ac8' };

  it('hid the parent while the child was in her inbox, and still does', () => {
    const candidates = [parent, child];
    expect(oldMask(candidates).has(parent.id)).toBe(true);
    expect(threadMasked(candidates, candidates).has(parent.id)).toBe(true);
  });

  it('keeps the parent hidden once she answers and the child moves to In progress', () => {
    // The child is no longer an inbox candidate. It is a live row with a
    // worker on it, which is the whole difference.
    const candidates = [parent];
    const live = [parent, child];
    expect(oldMask(candidates).has(parent.id)).toBe(false); // what she saw
    expect(threadMasked(candidates, live).has(parent.id)).toBe(true);
  });

  it('keeps it hidden while the child sits in Scheduled, which is where her snooze puts it', () => {
    expect(threadMasked([parent], [parent, child]).has(parent.id)).toBe(true);
  });

  it('gives the parent back when the conversation is genuinely over', () => {
    // Nothing of the thread is in any of her three lists any more. The parent
    // is the live row again and must be reachable.
    expect(threadMasked([parent], [parent]).has(parent.id)).toBe(false);
  });
});

describe('what it must not do', () => {
  it('does not hide a row behind a sibling', () => {
    // Two asks under one root are not each other's continuation.
    const rows = [
      { id: 'root' },
      { id: 'a', parent: 'root' },
      { id: 'b', parent: 'root' },
    ];
    const masked = threadMasked(rows, rows);
    expect(masked.has('a')).toBe(false);
    expect(masked.has('b')).toBe(false);
    expect(masked.has('root')).toBe(true); // represented by its children
  });

  it('stops at the first ancestor that is not live: the thread is the NEAREST live chain', () => {
    // Many rows of a real product hang off one founding directive. Masking the
    // whole chain would hide most of a product behind one of them, which is the
    // trap flagged before this was built.
    const founding = { id: 'w-a7deb87a7e' };
    const settled = { id: 'w-settled', parent: 'w-a7deb87a7e' }; // done and filed: not live
    const fresh = { id: 'w-fresh', parent: 'w-settled' };
    const masked = threadMasked([founding, fresh], [founding, fresh]);
    expect(masked.has(founding.id)).toBe(false);
    expect(masked.has(fresh.id)).toBe(false);
  });

  it('survives a parent cycle rather than hanging on it', () => {
    const rows = [{ id: 'x', parent: 'y' }, { id: 'y', parent: 'x' }];
    expect(() => threadMasked(rows, rows)).not.toThrow();
  });

  it('ignores a parent that is not a row at all', () => {
    const rows = [{ id: 'orphan', parent: 'w-deleted' }];
    expect(threadMasked(rows, rows).size).toBe(0);
  });
});

// THE REQUIREMENT, as a property. The fixture is the Agentbox thread shape at
// 2026-08-14T01:20:22.730Z, the same 18 rows the bulk-snooze test is cut from,
// with the live lists split three ways: what was in the inbox, what a worker
// was on, and what she had snoozed.
const INBOX = [
  { id: 'w-601a208c26' },
  { id: 'w-37275f9c1f' },
  { id: 'w-2b734d6717', parent: 'w-a2680a019e' },
  { id: 'w-cb27e36edb', parent: 'w-bd4c8dc60a' },
  { id: 'w-fb6e90e5b3', parent: 'w-d8e2dde6f2' },
  { id: 'w-01666ceb2c', parent: 'w-55fa688ac8' },
  { id: 'w-d453a9632d', parent: 'w-2674aa6801' },
  { id: 'w-c88f00d032', parent: 'w-07a132463c' },
  { id: 'w-a25b524ded' },
  { id: 'w-04969d9cc6', parent: 'w-02d809707e' },
  { id: 'w-a79d1b4a98' },
  { id: 'w-18b063a72f', parent: 'w-420daf897f' },
  { id: 'w-02d809707e', parent: 'w-6d21470b94' },
  { id: 'w-55fa688ac8' },
  { id: 'w-d8e2dde6f2' },
  { id: 'w-07a132463c' },
  { id: 'w-420daf897f', parent: 'w-6b243c81f7' },
  { id: 'w-6b243c81f7' },
];
const ELSEWHERE = [
  { id: 'w-8ec62bd656', parent: 'w-a25b524ded' }, // a worker on the zoom readout
  { id: 'w-d2b0cc128d', parent: 'w-fb6e90e5b3' }, // the lane row, in progress
];
const LIVE = [...INBOX, ...ELSEWHERE];

const chainUp = (row, byId, liveIds) => {
  const out = [];
  let cur = row;
  const seen = new Set([cur.id]);
  while (cur.parent && liveIds.has(cur.parent) && !seen.has(cur.parent)) {
    seen.add(cur.parent);
    out.push(cur.parent);
    cur = byId.get(cur.parent);
  }
  return out;
};

describe('no thread loses its access', () => {
  const byId = new Map(LIVE.map((r) => [r.id, r]));
  const liveIds = new Set(LIVE.map((r) => r.id));
  const masked = threadMasked(INBOX, LIVE);
  const shown = INBOX.filter((r) => !masked.has(r.id));

  it('hides every row only BEHIND a row she can see', () => {
    for (const id of masked) {
      const held = LIVE.some((l) => chainUp(l, byId, liveIds).includes(id));
      expect(held, `${id} was hidden by nothing live`).toBe(true);
    }
  });

  it('leaves every conversation with at least one row somewhere she looks', () => {
    const visible = new Set([...shown, ...ELSEWHERE].map((r) => r.id));
    const rootOf = (r) => {
      let cur = r;
      const seen = new Set([cur.id]);
      while (cur.parent && byId.has(cur.parent) && !seen.has(cur.parent)) { seen.add(cur.parent); cur = byId.get(cur.parent); }
      return cur.id;
    };
    const roots = new Set(LIVE.map(rootOf));
    for (const root of roots) {
      const reachable = LIVE.some((l) => rootOf(l) === root && visible.has(l.id));
      expect(reachable, `conversation ${root} had nowhere to be reached`).toBe(true);
    }
  });

  it('hides more than the old rule did, and never less', () => {
    const before = oldMask(INBOX);
    for (const id of before) expect(masked.has(id)).toBe(true);
    // The two rows the old rule left showing: their threads moved on without
    // them and both are represented by a live row.
    expect([...masked].filter((id) => !before.has(id)).sort()).toEqual(['w-fb6e90e5b3', 'w-a25b524ded'].sort());
  });
});
