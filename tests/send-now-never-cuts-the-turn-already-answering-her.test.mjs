// "The message that I flagged send now seems to not have actually interrupted
// the agent because it's still not returning anything." (w-0202576e73)
//
// The agent had ended its turn and sat waiting on two background jobs. Her
// message started a new turn at once (Claude Code's own log: taken 21:48:25),
// but Claude Code echoes a message back only when that turn first speaks, so
// the app still counted it as waiting and drew Send now. She pressed it, and
// the interrupt (21:48:26, "[Request interrupted by user]") cut the very turn
// that was answering her. Nothing ran again until a background job woke the
// agent 37 s later.
//
// MEASURED on the real CLI (scripts/scratch/send-now-race.mjs, haiku): idle
// with a `sleep 120` out, message sent, Send now 1 s later. The turn was cut,
// and the answer came at 125 s, when the sleep ended. Without the cut it came
// 1.0 s after sending. A turn starts with `system/init`, and that is what
// marks the message as taken.
import { it, expect, describe } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mjs';

function fake() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.frames = [];
  c.stdin = { writable: true, write: (s) => { c.frames.push(JSON.parse(s)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, event) => c.stdout.emit('data', JSON.stringify(event) + '\n');
const cuts = (c) => c.frames.filter((f) => f.type === 'control_request' && f.request?.subtype === 'interrupt').length;
const ack = (c) => { const f = c.frames.findLast((x) => x.type === 'control_request'); say(c, { type: 'control_response', response: { subtype: 'success', request_id: f.request_id, response: {} } }); };

// A session that has finished a turn and is waiting on a background job:
// the shape of the session in the report.
function idleWithAJobOut() {
  const c = fake(); attachClaudeInput(c);
  const first = c.steer('start the renders');
  say(c, { type: 'system', subtype: 'init' });
  say(c, { type: 'user', uuid: c.frames[0].uuid, message: { content: 'start the renders' } });
  say(c, { type: 'assistant', message: { content: [{ type: 'text', text: 'Started.' }] } });
  say(c, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ id: 'b1' }] });
  say(c, { type: 'result', subtype: 'success', is_error: false, result: 'Started.' });
  return { c, first };
}

// A session inside a turn, on a command that may run for minutes.
function midStep() {
  const c = fake(); attachClaudeInput(c);
  c.steer('run the suite');
  say(c, { type: 'system', subtype: 'init' });
  say(c, { type: 'user', uuid: c.frames[0].uuid, message: { content: 'run the suite' } });
  say(c, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } });
  return c;
}

describe('Send now on an agent that was idle', () => {
  it('does not cut the turn her message started (the reported case)', async () => {
    const { c } = idleWithAJobOut();
    c.steer('show them to me now');
    say(c, { type: 'system', subtype: 'init' });
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
    expect(cuts(c)).toBe(0);
  });

  it('does not cut it when pressed before the new turn has said it started', async () => {
    const { c } = idleWithAJobOut();
    c.steer('show them to me now');
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
    expect(cuts(c)).toBe(0);
  });

  it('does not cut an idle agent with no background work either', async () => {
    const c = fake(); attachClaudeInput(c);
    c.holdInput(true);
    c.steer('first');
    say(c, { type: 'system', subtype: 'init' });
    say(c, { type: 'user', uuid: c.frames[0].uuid, message: { content: 'first' } });
    say(c, { type: 'result', subtype: 'success', is_error: false, result: 'ok' });
    c.steer('second');
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
  });
});

describe('Send now on an agent in the middle of a step', () => {
  it('still cuts the step her message is waiting behind', async () => {
    const c = midStep();
    c.steer('stop and show me');
    const p = c.interrupt();
    expect(cuts(c)).toBe(1);
    ack(c);
    await expect(p).resolves.toEqual({ interrupted: true });
  });

  it('cuts nothing once the next turn has picked her message up', async () => {
    const c = midStep();
    c.steer('stop and show me');
    say(c, { type: 'result', subtype: 'success', is_error: false, result: 'Suite green.' });
    say(c, { type: 'system', subtype: 'init' });
    await expect(c.interrupt()).resolves.toEqual({ interrupted: false });
    expect(cuts(c)).toBe(0);
  });

  it('cuts for a second message sent while the turn the first one started is working', async () => {
    const { c } = idleWithAJobOut();
    c.steer('show them to me');
    say(c, { type: 'system', subtype: 'init' });
    say(c, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } });
    c.steer('actually, now please');
    const p = c.interrupt();
    expect(cuts(c)).toBe(1);
    ack(c);
    await expect(p).resolves.toEqual({ interrupted: true });
  });
});
