// A MESSAGE STILL SENDING LANDS BEFORE THE STOP, SO THE STOP HOLDS.
//
// "I stopped this task and it just randomly resumed after a minute or so.
// Stopped means stopped, not stopped for a minute." Measured on the row's own
// ledger, 2026-10-05:
//
//   14:54:07.6  a worker picks the row up
//   ~14:54:12   she sends "DO NOT SHIP" to it; the message is HELD for the
//               three seconds Z can take it back (UNDO_GRACE_MS)
//   14:54:14.9  she presses stop: the run is killed, the row written blocked
//   14:54:15.3  the window closes and the held message is written, AFTER the
//               stop. A reply on a blocked row reopens it (store.answerItem),
//               and a reply newer than her stop is what wakes a stopped row
//               (shared/answers.mjs, stoppedByHer).
//   14:56:39    a new worker starts on the row she stopped.
//
// The stop never looked at the message in its window. Every other action in
// the app writes what is held first ("a new action commits the previous one
// immediately", deferCommit); stop did not, so her own earlier words arrived
// as if she had said them after stopping. Now stop writes what is held, then
// stops, so the message is on the thread and older than the stop.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stoppedByHer } from '../shared/answers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

// stopAgent, from its declaration to the end of its useCallback.
function stopAgent() {
  const from = app.indexOf('const stopAgent = useCallback(');
  expect(from).toBeGreaterThan(-1);
  const to = app.indexOf('}, [', from);
  expect(to).toBeGreaterThan(from);
  return app.slice(from, to);
}

describe('stop writes the held message first', () => {
  it('flushes the grace window before it kills the run', () => {
    const body = stopAgent();
    const flush = body.indexOf('await flushPending();');
    const stop = body.indexOf('stopSession?.(');
    expect(flush).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(flush);
  });

  it('lists flushPending among its dependencies, so it never calls a stale one', () => {
    const from = app.indexOf('const stopAgent = useCallback(');
    const deps = app.slice(app.indexOf('}, [', from), app.indexOf(']);', from));
    expect(deps).toMatch(/flushPending/);
  });

  it('leaves an agent row alone before touching anything held', () => {
    // An agent row has no stop at all; returning first means pressing stop
    // there does not send a message held on some other row.
    const body = stopAgent();
    expect(body.indexOf('if (item.agent')).toBeLessThan(body.indexOf('await flushPending();'));
  });
});

// What the order buys, on the row as the ledger holds it either way.
describe('the row that results', () => {
  const STOP = 1_791_237_254_925; // 14:54:14.9
  const row = (answerTs) => ({
    id: 'w-2e13752a85', status: 'blocked', answer: 'DO NOT SHIP',
    wrote: { answer: { ts: answerTs, source: 'founder' }, status: { ts: STOP, source: 'founder' } },
  });

  it('stays stopped when her message landed before the stop (the fix)', () => {
    expect(stoppedByHer(row(STOP - 400))).toBe(true);
  });

  it('stays stopped when they land in the same millisecond', () => {
    expect(stoppedByHer(row(STOP))).toBe(true);
  });

  it('still wakes on a reply written after the stop, which is how she resumes it', () => {
    expect(stoppedByHer(row(STOP + 401))).toBe(false);
  });
});
