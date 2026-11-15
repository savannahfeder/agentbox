// A TEAMMATE'S LATER, DONE AND SEND-BACK ARE THEIRS ALONE.
//
// Found 2026-11-07 on the team build. A shared thread showed "Margarette sent
// it back" and "Margarette marked it done" to the other person on it. Those
// are moves in one person's own inbox, and the thread drew every person's.
// Measured by building the thread from a ledger whose lines carry another
// person's `by`, with the reader's id passed as `me`.

import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';

const T0 = Date.parse('2026-11-06T07:20:00-07:00');
const ME = 'p-test-0001';
const MATE = 'p-test-0002';
const line = (ts, source, patch, by) => ({ id: 'w-0a1b2c3d4e', ts, source, patch, by });

const ledger = (by) => [
  line(T0, 'founder', { title: 'Write back to the candidate', body: 'Write back to the candidate', status: 'open' }, ME),
  line(T0 + 60_000, 'agent', { result: 'Here is the reply I would send.' }, ME),
  line(T0 + 120_000, 'founder', { snoozedUntil: T0 + 86_400_000 }, by),
  line(T0 + 180_000, 'founder', { snoozedUntil: 0 }, by),
  line(T0 + 240_000, 'founder', { status: 'open' }, by),
  line(T0 + 300_000, 'founder', { status: 'done' }, by),
];

// The answer is held out as `outcome`, and what came after it is `after`.
const drawn = (t) => [...t.events, ...(t.outcome ? [{ text: t.outcome.text }] : []), ...(t.after ?? [])];
const acts = (t) => drawn(t).filter((e) => e.kind === 'work' && e.yours).map((e) => e.verb);

describe("a teammate's own inbox moves on a shared thread", () => {
  it('are not drawn for the other person', () => {
    const t = itemThread(ledger(MATE), [], null, { whole: true, me: ME });
    expect(acts(t)).not.toContain('You moved it to Later');
    expect(acts(t)).not.toContain('You brought it back');
    expect(acts(t)).not.toContain('You sent it back');
    expect(acts(t)).not.toContain('You marked it done');
  });

  it('are still drawn for the person who made them', () => {
    const t = itemThread(ledger(ME), [], null, { whole: true, me: ME });
    expect(acts(t)).toEqual(expect.arrayContaining(['You moved it to Later', 'You brought it back', 'You sent it back', 'You marked it done']));
  });

  it('leave the conversation itself in place', () => {
    const t = itemThread(ledger(MATE), [], null, { whole: true, me: ME });
    const said = drawn(t).filter((e) => e.kind !== 'work').map((e) => e.text);
    expect(said).toContain('Write back to the candidate');
    expect(said).toContain('Here is the reply I would send.');
  });

  it("keep a teammate's pick, which answers the agent, on screen", () => {
    const picked = [...ledger(MATE).slice(0, 2), line(T0 + 400_000, 'founder', { answer: 'Option 1: Send it as written' }, MATE)];
    const t = itemThread(picked, [], null, { whole: true, me: ME });
    expect(drawn(t).some((e) => e.kind === 'work' && e.yours && e.by === MATE && /picked/.test(e.verb))).toBe(true);
  });

  it('change nothing on the single-person app, where lines carry no writer', () => {
    const solo = ledger(undefined).map(({ by: _by, ...l }) => l);
    const t = itemThread(solo, [], null, { whole: true });
    expect(acts(t)).toEqual(expect.arrayContaining(['You moved it to Later', 'You sent it back', 'You marked it done']));
  });
});
