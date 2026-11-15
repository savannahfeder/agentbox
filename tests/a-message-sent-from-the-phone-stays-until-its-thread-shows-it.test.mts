// A MESSAGE SENT FROM THE PHONE STAYS ON SCREEN UNTIL ITS THREAD SHOWS IT.
//
// What broke, 2026-10-31: with her Mac shut she sent "How's it going? Can you
// share any screenshots of progress?" from the phone at 11:41am. Agentbox
// Cloud took it at 11:42, answered at 11:43 and marked it "Answered in
// Agentbox Cloud". The phone stops drawing a sent message once it is marked
// taken, trusting the thread's copy online to show it. That copy had been
// written over by her sleeping Mac's own copy, which did not have it, so the
// message was nowhere: not on the phone at 11:49, and not on the Mac until it
// woke at 3:29pm. Her words: "Sent a message in this thread on mobile and it
// disappeared, nowhere to be found."
//
// Now a message she sent is drawn until the thread's copy holds it, however it
// was taken, for as long as the phone reads taken messages (two days). A
// message the copy does hold is drawn once, from the copy. Measured against
// the real rows of 2026-10-31, read from the cloud by hand.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug, readCommands } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-10-31T21:49:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const SENT = Date.parse('2026-10-31T21:41:20Z');
const TEXT = 'How’s it going? Can you share any screenshots of progress? Note that my computer is off';

// The row as the cloud has it: taken by a cloud run and answered there.
const answeredInCloud = (over = {}) => ({
  id: '16e80a22', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: TEXT },
  created_at: iso(SENT), claimed_at: iso(SENT + 91_000), claimed_by: 'cloud:6b8bca35', taken_at: iso(SENT + 150_000),
  outcome: 'Answered in Agentbox Cloud', ...over,
});
const before = [
  { id: 'w-1', ts: SENT - 3e6, source: 'founder', patch: { answer: 'continue mac is live now' } },
  { id: 'w-1', ts: SENT - 2e6, source: 'agent', patch: { result: 'Moved to the cloud.' } },
];
function rows(commands, history = before, { updated = NOW - 60_000, olderLines = 0 } = {}) {
  const item = { id: 'w-1', title: 'Multiplayer', status: 'claimed', kind: 'directive', labels: ['founder'], priority: 0, createdAt: SENT - 9e6, updatedAt: SENT - 2e6 };
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW - 3e6) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(updated), snapshot: { v: 3, item, history, olderLines } }],
    commands,
  };
}
const hers = (r) => threadOf(r, phoneView(r, NOW), A, 'w-1').events.filter((e) => e.who === 'you' && e.text === TEXT);

describe('a message the cloud answered', () => {
  it('stays on screen when the thread\'s copy does not have it (the reported case)', () => {
    const r = rows([answeredInCloud()]);
    expect(phoneView(r, NOW).waiting).toEqual([expect.objectContaining({ text: TEXT, sent: true })]);
    expect(hers(r)).toHaveLength(1);
  });

  it('is drawn once, from the copy, when the copy has it', () => {
    const r = rows([answeredInCloud()], [...before, { id: 'w-1', ts: SENT, source: 'founder', patch: { answer: TEXT, status: 'open' } }, { id: 'w-1', ts: SENT + 150_000, source: 'agent', patch: { result: 'Going well.' } }]);
    expect(phoneView(r, NOW).waiting).toEqual([]);
    expect(hers(r)).toHaveLength(1);
    expect(hers(r)[0].pending).toBeFalsy();
  });

  it('counts the copy as having it when her Mac put it on the row later, with spaces around it', () => {
    const r = rows([answeredInCloud()], [...before, { id: 'w-1', ts: SENT + 5 * 3600_000, source: 'founder', patch: { answer: `  ${TEXT}\n` } }]);
    expect(phoneView(r, NOW).waiting).toEqual([]);
  });

  it('does not take an earlier message of the same words for this one', () => {
    const r = rows([answeredInCloud()], [{ id: 'w-1', ts: SENT - 86_400_000, source: 'founder', patch: { answer: TEXT } }, ...before]);
    expect(phoneView(r, NOW).waiting).toHaveLength(1);
  });

  it('does not take an agent quoting her words for hers', () => {
    const r = rows([answeredInCloud()], [...before, { id: 'w-1', ts: SENT + 1000, source: 'agent', patch: { result: TEXT } }]);
    expect(phoneView(r, NOW).waiting).toHaveLength(1);
  });

  it('counts a message as shown once the copy has let lines older than it go', () => {
    const r = rows([answeredInCloud()], [{ id: 'w-1', ts: SENT + 60_000, source: 'agent', patch: { result: 'later' } }], { olderLines: 400 });
    expect(phoneView(r, NOW).waiting).toEqual([]);
  });
});

describe('a message her Mac took', () => {
  it('stays until the copy has it, not only until a newer copy arrives', () => {
    const r = rows([answeredInCloud({ claimed_by: null, outcome: 'done' })], before, { updated: NOW - 1000 });
    expect(phoneView(r, NOW).waiting).toHaveLength(1);
  });

  it('with its files linked by her Mac counts as shown by any message of hers after it', () => {
    const files = answeredInCloud({ claimed_by: null, outcome: 'done', payload: { text: `see ![shot](phone-files/${'a'.repeat(64)}.png)` } });
    const r = rows([files], [...before, { id: 'w-1', ts: SENT + 1000, source: 'founder', patch: { answer: 'see designs/shot.png' } }]);
    expect(phoneView(r, NOW).waiting).toEqual([]);
  });
});

describe('what still goes', () => {
  it('a message taken back on the phone', () => {
    expect(phoneView(rows([answeredInCloud({ claimed_by: null, outcome: 'refused: taken back on the phone' })]), NOW).waiting).toEqual([]);
  });

  it('a message turned down still says why', () => {
    expect(phoneView(rows([answeredInCloud({ claimed_by: null, outcome: 'refused: that thread is not on your phone' })]), NOW).waiting)
      .toEqual([expect.objectContaining({ refused: 'that thread is not on your phone' })]);
  });

  it('a message still waiting is not marked sent', () => {
    const view = phoneView(rows([answeredInCloud({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null })]), NOW);
    expect(view.waiting[0].sent).toBeUndefined();
  });
});

describe('the taken messages the phone reads', () => {
  it('are the newest, so a busy day never cuts off the latest', async () => {
    const asked = [];
    await readCommands(async (table, q) => { asked.push(q); return []; }, NOW);
    const taken = asked.find((q) => q.includes('taken_at=gte.'));
    expect(taken).toMatch(/order=created_at\.desc/);
  });
});
