// Bulk select acts on ALL of it, including the rows the list is hiding.
//
// Every write landed. What she saw was a row APPEARING where she had just
// cleared. The inbox shows a thread as one row (`hasChildHere` in App.tsx: a
// parent whose child ask is also here is represented by that child), so
// snoozing the child UNMASKS the parent, and the parent arrives on the same
// refresh looking exactly like a row the action skipped.
//
// Her own ledger recorded her working around it, and this is the case pinned
// below. agentbox, 2026-08-14 01:20 UTC, nine seconds, three snoozes:
//
//   01:20:22   12 rows   the whole visible inbox
//   01:20:26    5 rows   the parents that appeared when those 12 left
//   01:20:31    1 row, which appeared when its child left in pass 2
//
// Three passes to clear one inbox, and the last row is a GRANDparent, which is
// why the walk cannot stop at the first hidden ancestor it finds.
//
// The fixture is those 18 rows as they were folded out of
// 00000000-/agentbox/work-items.jsonl at 01:20:22.730, one millisecond before her
// first write. Only id and parent are kept, because only id and parent are what
// the rule reads; which 18 belonged in the inbox at that instant is
// belongsInInbox's job and is pinned by its own tests.
import { describe, it, expect } from 'vitest';
import { maskedAncestors } from '../renderer/src/list-rules';

// The inbox candidates at 2026-08-14T01:20:22.730Z, measured.
const BURST = [
  { id: 'w-601a208c26' },
  { id: 'w-37275f9c1f' },
  { id: 'w-2b734d6717', parent: 'w-a2680a019e' }, // parent not in the inbox: nothing to drag
  { id: 'w-cb27e36edb', parent: 'w-bd4c8dc60a' },
  { id: 'w-fb6e90e5b3', parent: 'w-d8e2dde6f2' },
  { id: 'w-01666ceb2c', parent: 'w-55fa688ac8' },
  { id: 'w-d453a9632d', parent: 'w-2674aa6801' },
  { id: 'w-c88f00d032', parent: 'w-07a132463c' },
  { id: 'w-a25b524ded' },
  { id: 'w-04969d9cc6', parent: 'w-02d809707e' },
  { id: 'w-a79d1b4a98' },
  { id: 'w-18b063a72f', parent: 'w-420daf897f' },
  // Hidden behind the twelve above.
  { id: 'w-02d809707e', parent: 'w-6d21470b94' },
  { id: 'w-55fa688ac8' },
  { id: 'w-d8e2dde6f2' },
  { id: 'w-07a132463c' },
  { id: 'w-420daf897f', parent: 'w-6b243c81f7' },
  { id: 'w-6b243c81f7' },
];

// The list's own rule, restated here so the fixture's split is not asserted on
// faith: a row is shown unless some other candidate calls it parent.
const shownOf = (candidates) => candidates.filter((i) => !candidates.some((c) => c.parent === i.id));

describe('her bulk snooze of 2026-08-14 01:20', () => {
  it('showed her twelve rows out of eighteen', () => {
    const shown = shownOf(BURST);
    expect(shown.length).toBe(12);
    expect(shown.map((i) => i.id)).toContain('w-18b063a72f');
    expect(shown.map((i) => i.id)).not.toContain('w-420daf897f');
  });

  it('takes the six hidden rows with them, in ONE pass', () => {
    const shown = shownOf(BURST);
    const alsoGoing = maskedAncestors(shown, BURST);
    // Exactly the rows she had to snooze again at 01:20:26 and 01:20:31.
    expect(new Set(alsoGoing.map((i) => i.id))).toEqual(new Set([
      'w-d8e2dde6f2', 'w-55fa688ac8', 'w-07a132463c', 'w-02d809707e', 'w-420daf897f', 'w-6b243c81f7',
    ]));
    // Which is the whole point: nothing is left in the inbox to come back.
    expect(new Set([...shown, ...alsoGoing].map((i) => i.id)).size).toBe(BURST.length);
  });

  it('reaches the grandparent she needed a third pass for', () => {
    // hides, which hides. Stopping at the first hidden ancestor is what left
    // her one more row at 01:20:31.
    const ids = maskedAncestors([{ id: 'w-18b063a72f', parent: 'w-420daf897f' }], BURST).map((i) => i.id);
    expect(ids).toEqual(['w-420daf897f', 'w-6b243c81f7']);
  });

  it('never names the same row twice, however many children lead to it', () => {
    const candidates = [
      { id: 'kid-a', parent: 'mum' }, { id: 'kid-b', parent: 'mum' }, { id: 'mum', parent: 'gran' }, { id: 'gran' },
    ];
    const out = maskedAncestors([candidates[0], candidates[1]], candidates);
    expect(out.map((i) => i.id)).toEqual(['mum', 'gran']);
  });
});

describe('what it must NOT drag along', () => {
  it('leaves a row with nothing behind it alone', () => {
    expect(maskedAncestors([{ id: 'a' }], [{ id: 'a' }])).toEqual([]);
  });

  it('leaves an ancestor the inbox was never showing', () => {
    // The parent is done, or filed, or already deferred: it is not a candidate,
    // so her row was not hiding it and snoozing her row must not touch it.
    const candidates = [{ id: 'kid', parent: 'finished-parent' }];
    expect(maskedAncestors(candidates, candidates)).toEqual([]);
  });

  it('adds nothing when she acts from Scheduled', () => {
    // Rows in Scheduled are not inbox candidates, so there is no mask and
    // nothing hiding behind them. Re-snoozing one moves exactly that one.
    const scheduled = [{ id: 'kid', parent: 'mum' }];
    expect(maskedAncestors(scheduled, [])).toEqual([]);
  });

  it('does not name a row she already picked herself', () => {
    const candidates = [{ id: 'kid', parent: 'mum' }, { id: 'mum' }];
    expect(maskedAncestors(candidates, candidates)).toEqual([]);
  });

  it('stops on a parent cycle instead of hanging', () => {
    // Corrupt data, not a real thread. It must not spin the render loop.
    const candidates = [{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }];
    expect(maskedAncestors([candidates[0]], candidates).map((i) => i.id)).toEqual(['b']);
  });
});
