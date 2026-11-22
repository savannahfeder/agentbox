// A teammate's hand-back that landed during a run started a second run on the same words when the run ended, because the run's own status had replaced the hold (power test issues 40, 60: "Nothing new from Priya").
// Measured on the supervisor's exit path and the queue's continuation check, with the run's status written over the hold.
import { it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';
import { isDue } from '../shared/work-items.mts';

function exitWith(after) {
  const s = Object.create(Supervisor.prototype);
  s.held = [];
  s.store = { listItems: () => [after], isDue, answerItem: () => {}, recordSessionResult: (slug, id, o) => s.held.push({ slug, id, ...o }) };
  s.pausedProducts = new Set(); s.sessions = new Map();
  s._handledAnswers = new Set(); s._saveState = () => {}; s.spawned = [];
  s.spawnWorker = (item, options) => s.spawned.push({ item, options });
  return s;
}
const before = { id: 'w-t', product: 'api', status: 'open', answer: 'Drop it.', wrote: { answer: { ts: 100, source: 'system', from: 'Priya', teammate: 'priya' } } };
const handBack = (status, source) => ({
  ...before, status, answer: 'Priya handed this back.\n\nAnswered on your thread. Over to you!',
  wrote: { answer: { ts: 200, source: 'system', from: 'Priya', teammate: 'priya' }, status: { ts: 300, source } },
});

for (const [status, source] of [['open', 'agent'], ['blocked', 'agent'], ['done', 'agent']]) {
  it(`does not start a run on a hand-back once the run wrote ${status} over the hold, and holds it for the owner`, () => {
    const s = exitWith(handBack(status, source));
    s.deliverMidflightReply(before, before.answer);
    expect(s.spawned).toHaveLength(0);
    expect(s.held).toEqual([{ slug: 'api', id: 'w-t', status: 'blocked' }]);
    expect(s._isContinuation(handBack(status, source))).toBe(false);
  });
}

it('leaves a hand-back still held as it is', () => {
  const s = exitWith(handBack('blocked', 'system'));
  s.deliverMidflightReply(before, before.answer);
  expect(s.spawned).toHaveLength(0);
  expect(s.held).toEqual([]);
});

it("still carries a helper's words that are not a hand-back", () => {
  const after = { ...before, answer: 'Also add a test.', wrote: { answer: { ts: 200, source: 'system', from: 'Priya', teammate: 'priya' }, status: { ts: 300, source: 'agent' } } };
  const s = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(s.spawned).toHaveLength(1);
  expect(s._isContinuation(after)).toBe(true);
});

it('still runs on the owner typing the same words themselves', () => {
  const after = { ...handBack('open', 'agent'), wrote: { answer: { ts: 200, source: 'founder' }, status: { ts: 300, source: 'agent' } } };
  const s = exitWith(after);
  s.deliverMidflightReply(before, before.answer);
  expect(s.spawned).toHaveLength(1);
  expect(s._isContinuation(after)).toBe(true);
});
