// "We might want to build a queuing system like Claude Code and Codex do, where
// messages wait their turn unless you send it now. And also when you send it
// now it behaves better than it currently does, actually responding."
// (w-f37a34def6, 2026-10-02)
//
// A message to a working agent waits for its current step to end: Claude Code
// takes queued input only between steps. MEASURED with a real headless session
// on one 45-second command: the message waited 43 s and was answered at 53.5 s.
// With an `interrupt` control request the step was cut at once and the same
// message was answered 1.4 s later, as a turn of its own rather than a note
// slipped in between steps. A message already waiting in line when the
// interrupt is sent survives it and is answered 1.2 s later.
//
// The interrupt is only ever sent while a message of hers is waiting: with
// none, the interrupted turn's result would close the session's input and end
// the run.
import { it, expect, describe } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mjs';
import { submitReply } from '../main/live-replies.mjs';
import { Supervisor } from '../main/supervisor.mjs';

function fake() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.frames = [];
  c.stdin = { writable: true, write: (s) => { c.frames.push(JSON.parse(s)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, event) => c.stdout.emit('data', JSON.stringify(event) + '\n');
const ackControl = (c) => { const f = c.frames.find((x) => x.type === 'control_request'); say(c, { type: 'control_response', response: { subtype: 'success', request_id: f.request_id, response: {} } }); };

describe('the session input', () => {
  it('cuts the current step when a message is waiting', async () => {
    const c = fake(); attachClaudeInput(c);
    c.steer('show me what you have');
    const p = c.interrupt();
    expect(c.frames.at(-1)).toMatchObject({ type: 'control_request', request: { subtype: 'interrupt' } });
    ackControl(c);
    await expect(p).resolves.toEqual({ interrupted: true });
  });

  it('does nothing when no message is waiting, so it cannot end the run', async () => {
    const c = fake(); attachClaudeInput(c);
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
    expect(c.frames.some((f) => f.type === 'control_request')).toBe(false);
  });

  it('does nothing once the agent has already taken the message', async () => {
    const c = fake(); attachClaudeInput(c);
    const p = c.steer('x');
    say(c, { type: 'user', uuid: c.frames[0].uuid });
    await p;
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
  });

  it('the cut step ends in an error result, and the input stays open for her message', async () => {
    const c = fake(); attachClaudeInput(c);
    const sent = c.steer('show me');
    c.interrupt(); ackControl(c);
    say(c, { type: 'result', subtype: 'error_during_execution', is_error: true });
    expect(c.stdin.writable).toBe(true);
    say(c, { type: 'user', uuid: c.frames[0].uuid });
    await sent;
    say(c, { type: 'result', subtype: 'success', is_error: false, result: 'Here it is.' });
    expect(c.stdin.writable).toBe(false);
  });
});

function supervisorWith(child, extra = {}) {
  return { sessions: new Map([['w', { product: 'p', child, ...extra }]]), _handledAnswers: new Set(), _answerKey: (i) => i.answer, _saveState() {} };
}

describe('sending a reply now', () => {
  it('puts her words in line first, then cuts the step', async () => {
    const c = fake(); attachClaudeInput(c);
    const s = supervisorWith(c);
    const done = submitReply(s, { product: 'p', id: 'w', answer: 'stop and show me', now: true }, () => ({ answer: 'stop and show me' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(c.frames.map((f) => f.type)).toEqual(['user', 'control_request']);
    ackControl(c);
    say(c, { type: 'user', uuid: c.frames[0].uuid });
    await expect(done).resolves.toMatchObject({ answer: 'stop and show me' });
  });

  it('an ordinary reply waits its turn and cuts nothing', async () => {
    const c = fake(); attachClaudeInput(c);
    const s = supervisorWith(c);
    const done = submitReply(s, { product: 'p', id: 'w', answer: 'when you can' }, () => ({ answer: 'when you can' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(c.frames.map((f) => f.type)).toEqual(['user']);
    say(c, { type: 'user', uuid: c.frames[0].uuid });
    await done;
  });
});

describe('the Send now on a message already waiting', () => {
  const sup = (sessions) => Object.assign(Object.create(Supervisor.prototype), { sessions });

  it('cuts the step of the running session it was sent to', async () => {
    const c = fake(); attachClaudeInput(c);
    c.steer('waiting');
    const run = sup(new Map([['w', { product: 'p', child: c }]])).sendNow('p', 'w');
    ackControl(c);
    await expect(run).resolves.toEqual({ ok: true, interrupted: true });
  });

  it('says so when nothing is running on that row', async () => {
    await expect(sup(new Map()).sendNow('p', 'w')).resolves.toEqual({ ok: false, interrupted: false });
  });

  it('never reaches a row of the same id in another project', async () => {
    const c = fake(); attachClaudeInput(c);
    c.steer('waiting');
    await expect(sup(new Map([['w', { product: 'other', child: c }]])).sendNow('p', 'w')).resolves.toEqual({ ok: false, interrupted: false });
    expect(c.frames.some((f) => f.type === 'control_request')).toBe(false);
  });

  it('an engine that cannot be interrupted is left to take it at its next step', async () => {
    const codex = { steer: async () => ({}) };
    await expect(sup(new Map([['w', { product: 'p', child: codex }]])).sendNow('p', 'w')).resolves.toEqual({ ok: true, interrupted: false });
  });
});
