// A HAND-BACK THAT LANDS DURING A RUN WAITS FOR THE OWNER (2026-11-21).
//
// Theo's words to Sam's agent started a run, and Theo handed back while it
// was still working. A hand-back is held for Sam: nothing should run on it
// until Sam replies, and the queue honours that (heldForHer). But when the
// run ended, the supervisor saw a reply newer than the one it started with
// and began the next run on "Theo handed this back…" without Sam. A "Needs
// changes" review landing mid-run did the same. Found by a code review of the
// shipped Ask or hand off; measured on the supervisor's own exit path. Now
// that path waits on a held or stopped row as the queue does.
import { it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';
import { isDue } from '../shared/work-items.mts';

function exitWith(after) {
  const s = Object.create(Supervisor.prototype);
  s.store = { listItems: () => [after], isDue, answerItem: () => {} };
  s.pausedProducts = new Set(); s.sessions = new Map();
  s._handledAnswers = new Set(); s._saveState = () => {}; s.spawned = [];
  s.spawnWorker = (item, options) => s.spawned.push({ item, options });
  return s;
}
const before = { id: 'w-t', product: 'api', status: 'open', answer: 'Drop it.', wrote: { answer: { ts: 100, source: 'system', from: 'Theo', teammate: 'theo' } } };

it('does not start the next run on a hand-back held for the owner', () => {
  const after = { ...before, status: 'blocked', answer: 'Theo handed this back.', wrote: { answer: { ts: 200, source: 'system', from: 'Theo', teammate: 'theo' }, status: { ts: 201, source: 'system' } } };
  const s = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(s.spawned).toHaveLength(0);
});

it("still carries a helper's new words to the agent when the run ends", () => {
  const after = { ...before, status: 'open', answer: 'Also add a test.', wrote: { answer: { ts: 200, source: 'system', from: 'Theo', teammate: 'theo' } } };
  const s = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(s.spawned).toHaveLength(1);
  expect(s.spawned[0].options).toEqual({ continuation: true });
});
