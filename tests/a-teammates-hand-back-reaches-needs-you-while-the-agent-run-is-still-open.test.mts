// A TEAMMATE'S HAND-BACK REACHES NEEDS YOU WHILE THE AGENT'S RUN IS STILL OPEN.
//
// In the 2026-11-27 collaboration test, Lena asked Theo for help on a step of
// a Codex thread whose run was still open, waiting on the answer. Theo answered
// and handed it back within a minute, and the app wrote his words and held the
// thread blocked for Lena's yes. Ten minutes later Lena read all 15 rows of
// Needs you and it was not there: the run was still live, and a live run kept
// the thread in In progress (`belongsInInbox`'s `live` branch). Measured from
// her copy's ledger: hand-back at 16:24:22, run open until 16:36:03.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { belongsInInbox, belongsInProgress, inProgressTab } from '../renderer/src/list-rules.ts';

const now = 1_795_797_000_000;
const handedBack = {
  id: 'w-1', product: 'web-app', kind: 'directive', status: 'blocked', labels: ['founder'],
  createdAt: now - 20 * 60_000, updatedAt: now - 10 * 60_000,
  answer: 'Theo handed this back.\n\nLena had asked: “Could you answer the agent’s question?”\n\nKeep the booking for retry.',
  wrote: { answer: { ts: now - 10 * 60_000, source: 'system', from: 'Theo', teammate: 't-theo' }, status: { ts: now - 10 * 60_000, source: 'system' } },
} as never;

describe("a teammate's hand-back on a thread whose run is still open", () => {
  it('is in Needs you', () => {
    expect(belongsInInbox(handedBack, { now, live: true })).toBe(true);
  });
  it('is counted in Needs you, not In progress', () => {
    expect(belongsInProgress(handedBack, { now, live: true })).toBe(true);
    expect(inProgressTab([handedBack as { id: string }], [handedBack as { id: string }])).toEqual([]);
  });
  it('is in Needs you once the run has ended too, as before', () => {
    expect(belongsInInbox(handedBack, { now, live: false })).toBe(true);
  });
});

// The rerun still missed it: the window checks for a live run itself before it
// asks the rule (App.tsx `inboxCandidates`), so the exception has to be there too.
describe('the window', () => {
  it('lets a hand-back through before its own live-run check', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    const handBack = app.indexOf("if (i.status !== 'done' && handBackWaits(i)) return true;");
    const liveVeto = app.indexOf('if (liveIds.has(i.id) && !stillAsksYou(i) && !asking(i)) return false;');
    expect(handBack).toBeGreaterThan(0);
    expect(handBack).toBeLessThan(liveVeto);
  });
});

describe('what stays as it was', () => {
  it('your own reply after the hand-back hands the thread to the run again', () => {
    const replied = { ...(handedBack as object), status: 'open', answer: 'Go with Theo’s answer.', wrote: { answer: { ts: now, source: 'founder' } } } as never;
    expect(belongsInInbox(replied, { now, live: true })).toBe(false);
  });
  it("an answer from your own agent's run is not a hand-back", () => {
    const own = { ...(handedBack as object), status: 'claimed', answer: 'Theo handed this back.', wrote: { answer: { ts: now, source: 'founder' } } } as never;
    expect(belongsInInbox(own, { now, live: true })).toBe(false);
  });
  it('a hand-back on a thread you closed stays closed', () => {
    const closed = { ...(handedBack as object), status: 'done', wrote: { ...(handedBack as { wrote: object }).wrote, status: { ts: now, source: 'founder' } } } as never;
    expect(belongsInInbox(closed, { now, live: true })).toBe(false);
  });
});
