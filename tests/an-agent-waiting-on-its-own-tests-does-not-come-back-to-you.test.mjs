// AN AGENT WAITING ON ITS OWN TESTS DOES NOT COME BACK TO YOU.
//
// What broke (2026-10-01, the Threads polish thread): a worker started the
// full suite, Claude Code moved the command to the background past its time
// limit, and the worker ended its turn with "the full suite is running on it
// now; I'll report once it finishes". `attachClaudeInput` closes stdin at every
// `result`, so the CLI exited 6 seconds later (trace: result 02:04:11, exit
// 02:04:17), killing the suite. The row came back to her as an answer that was
// only a promise, and the promised report could never arrive.
//
// Measured on Claude Code 2.1.287 with a scratch probe: with stdin left open,
// a background command announces itself with `background_tasks_changed`
// (`tasks: [...]`), announces its end with `background_tasks_changed`
// (`tasks: []`), and the CLI then wakes the agent on its own for a new turn
// and a new `result` (14 s later for a 15 s sleep). A command stopped at its
// time limit wakes it the same way. So the fix is to keep listening while
// anything is out, and close at the first result with nothing out.

import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mjs';
import { claudeActivity, currentActivity } from '../main/agent-activity.mjs';

function fake() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stdin = { writable: true, write: () => true, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, ...events) => c.stdout.emit('data', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
const out = (...ids) => ({ type: 'system', subtype: 'background_tasks_changed', tasks: ids.map((task_id) => ({ task_id, task_type: 'local_bash', description: 'npx vitest run' })) });
const turn = { type: 'assistant', message: { content: [{ type: 'text', text: 'The suite is green.' }] } };

it('keeps the session open at a turn that ends with the suite still running', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out('b1'), { type: 'result', result: "I'll report once it finishes." });
  expect(c.stdin.writable).toBe(true);
});

it('closes at the result the agent gives once the suite has finished', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out('b1'), { type: 'result' });
  say(c, out(), turn, { type: 'result', result: 'The suite is green.' });
  expect(c.stdin.writable).toBe(false);
});

it('waits for every job, not only the first to finish', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out('b1', 'b2'), { type: 'result' });
  say(c, out('b2'), turn, { type: 'result' });
  expect(c.stdin.writable).toBe(true);
  say(c, out(), turn, { type: 'result' });
  expect(c.stdin.writable).toBe(false);
});

it('still closes at once when the job finished inside the turn', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out('b1'), out(), turn, { type: 'result' });
  expect(c.stdin.writable).toBe(false);
});

it('still closes at once when nothing was ever started', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, turn, { type: 'result' });
  expect(c.stdin.writable).toBe(false);
});

it('closes after a grace period if the job ends and the agent is never woken', async () => {
  vi.useFakeTimers();
  try {
    const c = fake();
    attachClaudeInput(c);
    say(c, out('b1'), { type: 'result' });
    say(c, out());
    expect(c.stdin.writable).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(c.stdin.writable).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it('does not close under the agent once it has woken up and is working', async () => {
  vi.useFakeTimers();
  try {
    const c = fake();
    attachClaudeInput(c);
    say(c, out('b1'), { type: 'result' });
    say(c, out(), turn);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(c.stdin.writable).toBe(true);
    say(c, { type: 'result' });
    expect(c.stdin.writable).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

// THE ROW SAYS SO WHILE IT WAITS. A turn's result clears the live activity
// line, so without this the row would read as idle for the whole suite.
it('keeps the running row saying what it is waiting for after the turn ends', () => {
  const session = {};
  const line = (e) => claudeActivity(session, JSON.stringify(e));
  line(out('b1'));
  line({ type: 'result' });
  expect(currentActivity(session).map((a) => a.label)).toEqual(['Running the tests']);
  line(out());
  expect(currentActivity(session)).toEqual([]);
});

it('names a job it cannot put in words by what it is', () => {
  const session = {};
  claudeActivity(session, JSON.stringify({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b9', task_type: 'local_bash', description: 'Start the app on port 5173' }] }));
  claudeActivity(session, JSON.stringify({ type: 'result' }));
  expect(currentActivity(session).map((a) => a.label)).toEqual(['Waiting on: Start the app on port 5173']);
});

it('says what it is waiting on, so the row can show it', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out('b1'), { type: 'result' });
  expect(c.waitingOn()).toEqual([{ task_id: 'b1', task_type: 'local_bash', description: 'npx vitest run' }]);
  say(c, out(), turn, { type: 'result' });
  expect(c.waitingOn()).toEqual([]);
});
