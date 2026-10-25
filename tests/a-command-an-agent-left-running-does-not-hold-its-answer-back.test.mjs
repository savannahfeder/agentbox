// A COMMAND AN AGENT LEFT RUNNING DOES NOT HOLD ITS ANSWER BACK.
//
// What broke (2026-10-20, the multiplayer design thread): the agent started a
// wait loop, `while pgrep -f "vite build"; do sleep 3; done`, which matches its
// own shell and so never ends. Claude Code moved it to the background at its
// 600 s limit (11:29:55). The agent never stopped it, wrote its final answer at
// 11:51:05, and the run then stayed open until Claude Code killed the loop at
// its 30-minute background limit (11:59:55). For nine minutes the answer was
// written and the run still read as working. The session stays open while
// anything is out (tests/an-agent-waiting-on-its-own-tests-does-not-come-back-
// to-you), and only the agent knows whether it is waiting on a job or forgot
// it. So at a turn that ends with a job out, the agent is told once, by name,
// and asked to stop what it no longer needs.

import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mjs';

function fake() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.written = [];
  c.stdin = { writable: true, write: (line) => { c.written.push(JSON.parse(line)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, ...events) => c.stdout.emit('data', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
const out = (...jobs) => ({ type: 'system', subtype: 'background_tasks_changed', tasks: jobs.map(([task_id, description]) => ({ task_id, task_type: 'local_bash', description })) });
const turn = { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } };
const told = (c) => c.written.filter((m) => m.type === 'user').map((m) => m.message.content);

it('tells the agent, by name, what it left running when its turn ends', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b2ojorzne', 'Wait for the first install and build']), turn, { type: 'result', result: 'Should I go with my picks?' });
  expect(told(c)).toHaveLength(1);
  expect(told(c)[0]).toMatch(/"Wait for the first install and build"/);
  expect(told(c)[0]).toMatch(/[Ss]top/);
  expect(c.stdin.writable).toBe(true);
});

it('closes at the next result once the agent has stopped it', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'Wait for the build']), turn, { type: 'result' });
  say(c, out(), turn, { type: 'result' });
  expect(c.stdin.writable).toBe(false);
});

it('says it once per job, not at every turn the job outlives', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'npx vitest run']), turn, { type: 'result', result: "I'll report once it finishes." });
  say(c, turn, { type: 'result', result: 'Still waiting on the suite.' });
  expect(told(c)).toHaveLength(1);
  expect(c.stdin.writable).toBe(true);
});

it('says it again for a job started after the first was named', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'npx vitest run']), turn, { type: 'result' });
  say(c, out(['b1', 'npx vitest run'], ['b2', 'npm run build']), turn, { type: 'result' });
  expect(told(c)).toHaveLength(2);
  expect(told(c)[1]).toMatch(/"npm run build"/);
});

it('says nothing at a turn that ends with nothing out', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'npx vitest run']), out(), turn, { type: 'result' });
  expect(told(c)).toEqual([]);
});

it('says nothing while a message of hers is waiting to be taken: that is the next turn', () => {
  const c = fake();
  attachClaudeInput(c);
  void c.steer('one more thing').catch(() => {});
  c.written.length = 0;
  say(c, out(['b1', 'npx vitest run']), turn, { type: 'result' });
  expect(told(c)).toEqual([]);
});

it('says nothing into a session she is driving herself', () => {
  const c = fake();
  attachClaudeInput(c);
  c.holdInput(true);
  say(c, out(['b1', 'npx vitest run']), turn, { type: 'result' });
  expect(told(c)).toEqual([]);
});

// A cloud run's relay uploads any file outside the task folder that a line
// on its input names (main/cloud/run.mjs `filesNamedIn`), and would send the
// Mac's copy over the agent's own. So a job is named without its paths.
it('names a job without the paths in it', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'Copy /Users/someone/store/designs/w-1/round20.html into place']), turn, { type: 'result' });
  expect(told(c)[0]).toMatch(/"Copy round20\.html into place"/);
  expect(told(c)[0]).not.toMatch(/\/Users/);
});

it('never takes its own words, said back by Claude Code, for hers', () => {
  const c = fake();
  attachClaudeInput(c);
  say(c, out(['b1', 'npx vitest run']), turn, { type: 'result' });
  c.holdInput(true);
  const heard = [];
  c.on('remote-user', (e) => heard.push(e));
  const ours = c.written.find((m) => m.type === 'user');
  say(c, { type: 'user', uuid: ours.uuid, message: ours.message, parent_tool_use_id: null });
  expect(heard).toEqual([]);
});
