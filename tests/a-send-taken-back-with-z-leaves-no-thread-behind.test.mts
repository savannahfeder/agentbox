// A SEND TAKEN BACK WITH Z LEAVES NO THREAD BEHIND.
//
// What broke (power test round 2, #31): N, a task sent to the wrong project, Z
// on the "Started in Infra" toast (the words came back), the task sent again to
// the right project, then B. The board's Done today held a second copy of the
// task, closed, reading "Undid sending it" with a Reopen button, and counted in
// Done today's number. The withdrawal is written as a close
// (`api.answer({ status: 'done' })` in App.tsx's send undo), and Done lists
// every closed thread, so the task you took back sat beside the one you sent.
//
// Measured on the real pieces: the rule App.tsx filters its rows through, given
// the row a withdrawal leaves (closed in your hand at the moment Z ran) and the
// mark the same Z leaves on this Mac. Nothing is deleted: the row stays on the
// ledger, and once anybody writes its status again it is an ordinary thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { withdrawnSend, withoutWithdrawnSends, UNDID_SENDING } from '../renderer/src/withdraw-send';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const SENT = 1_791_800_000_000;
const Z = SENT + 4_000;
const row = (patch = {}) => ({
  id: 'w-0000000001', product: 'infra', title: 'Add a /health endpoint to the web app',
  status: 'done', labels: ['founder'], createdAt: SENT, updatedAt: Z - 20,
  wrote: { body: { ts: SENT, source: 'founder' }, status: { ts: Z - 20, source: 'founder' } },
  ...patch,
});
const mark = (patch = {}) => ({ product: 'infra', id: 'w-0000000001', from: Z - 50, at: Z, words: UNDID_SENDING, ...patch });

describe('a thread Z took back straight after sending it', () => {
  it('the reported case: closed by the withdrawal, with its mark, it is in no list', () => {
    expect(withdrawnSend(row(), [mark()])).toBe(true);
    const kept = row({ id: 'w-0000000002', product: 'web-app' });
    expect(withoutWithdrawnSends([row(), kept], [mark()])).toEqual([kept]);
  });

  it('reopened afterwards, it is an ordinary open thread again', () => {
    const reopened = row({ status: 'open', wrote: { ...row().wrote, status: { ts: Z + 60_000, source: 'founder' } } });
    expect(withdrawnSend(reopened, [mark()])).toBe(false);
  });

  it('reopened and closed again later, it is in Done like any closed thread', () => {
    const closedAgain = row({ wrote: { ...row().wrote, status: { ts: Z + 120_000, source: 'founder' } } });
    expect(withdrawnSend(closedAgain, [mark()])).toBe(false);
  });

  it('what must not match: a close taken back, a plain close, another thread, a row with no status record', () => {
    expect(withdrawnSend(row(), [mark({ words: 'Undid closing it' })])).toBe(false);
    expect(withdrawnSend(row(), [])).toBe(false);
    expect(withdrawnSend(row(), [mark({ id: 'w-0000000009' })])).toBe(false);
    expect(withdrawnSend(row(), [mark({ product: 'web-app' })])).toBe(false);
    expect(withdrawnSend(row({ wrote: { body: { ts: SENT, source: 'founder' } } }), [mark()])).toBe(false);
  });

  it('hands the same list back when it hides nothing, so nothing downstream redraws for it', () => {
    const rows = [row({ status: 'open' }), row({ id: 'w-0000000002' })];
    expect(withoutWithdrawnSends(rows, [mark()])).toBe(rows);
    expect(withoutWithdrawnSends(rows, [])).toBe(rows);
  });
});

describe('the wiring in App.tsx', () => {
  it('the send undo leaves the mark the rule reads', () => {
    const at = app.indexOf("'take back the task you just made'");
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at, at + 900)).toMatch(/words: UNDID_SENDING/);
  });

  it('every row the window lists comes through the rule, the board and the counts included', () => {
    expect(app).toMatch(/const listed = useMemo\(\(\) => withoutWithdrawnSends\(itemsWithOlder, undoMarks\)/);
    expect(app).toMatch(/const items = walkRows\(listed, run\)/);
    // The marks are read again whenever an undo leaves one.
    expect(app).toMatch(/addEventListener\(UNDO_MARKS_EVENT/);
  });
});
