// A REPLY SENT WHILE A CODEX TURN IS STARTING GOES INTO IT (2026-11-15).
//
// What broke: the night before Cloud's launch, a power tester replied to a
// Codex thread, then sent a second line ("keep the response shape backward
// compatible") 17 seconds later while the cloud run was still starting. The
// screen said "The turn is not running. Send again when the conversation is
// ready." and put the words back in the reply box, while the thread said
// Thinking in the cloud. A second tester's follow-up got "did not reach its
// agent" the same way. A cloud start takes 10 to 30 seconds before the turn
// has an id (about one on a Mac), and a reply in that gap was refused.
//
// Now a reply that arrives before the turn has begun waits for it and goes in;
// a turn that never begins hands the reply back as too late for this turn
// (TURN_CLOSED), which main/live-replies.mts saves for the next run.
import { describe, it, expect } from 'vitest';
import { createCodexWorker } from '../main/codex-session.mts';
import { TURN_CLOSED } from '../main/claude-input.mts';

type Handlers = { onNotification: (method: string, params: unknown) => void };

function setup({ turnStartWaitMs = 1000 } = {}) {
  let handlers: Handlers | null = null;
  let startTurn: (v: unknown) => void = () => {};
  const calls: unknown[][] = [];
  const server = {
    startThread: async (_p: unknown, h: Handlers) => { handlers = h; return { threadId: 'thread' }; },
    startTurn: () => new Promise((r) => { startTurn = r; }),
    unwatch() {},
    steerTurn: async (...args: unknown[]) => { calls.push(args); return { turnId: 'turn' }; },
  };
  const worker = createCodexWorker({ server, turnStartWaitMs } as Parameters<typeof createCodexWorker>[0]);
  worker.stderr.on('data', () => {});
  return {
    worker, calls,
    beginTurn: () => startTurn({ turn: { id: 'turn' } }),
    notify: (m: string, p: unknown) => handlers!.onNotification(m, p),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a reply sent before the Codex turn has begun', () => {
  it('waits and goes into the turn once it begins', async () => {
    const s = setup();
    await tick();
    const sent = s.worker.steer('keep the response shape');
    await tick();
    expect(s.calls).toEqual([]);
    s.beginTurn();
    await expect(sent).resolves.toEqual({ turnId: 'turn' });
    expect(s.calls).toEqual([['thread', 'turn', 'keep the response shape', []]]);
  });

  it('goes in when the turn\'s id arrives by notification first', async () => {
    const s = setup();
    await tick();
    const sent = s.worker.steer('also test two requests');
    s.notify('turn/started', { turn: { id: 'turn' } });
    await expect(sent).resolves.toEqual({ turnId: 'turn' });
  });

  it('is saved for the next run when the run ends before its turn began', async () => {
    const s = setup();
    await tick();
    const sent = s.worker.steer('one more thing');
    s.worker.emit('exit', 1, null);
    s.notify('turn/completed', { turn: { id: 'x', status: 'failed', error: { message: 'gone' } } });
    await expect(sent).rejects.toMatchObject({ code: TURN_CLOSED });
  });

  it('is saved for the next run when the turn has not begun by the deadline, never waiting for ever', async () => {
    const s = setup({ turnStartWaitMs: 20 });
    await tick();
    await expect(s.worker.steer('still there?')).rejects.toMatchObject({ code: TURN_CLOSED });
    expect(s.calls).toEqual([]);
  });
});

describe('what does not change', () => {
  it('a reply to a running turn goes straight in', async () => {
    const s = setup();
    await tick();
    s.beginTurn();
    await tick();
    await expect(s.worker.steer('change direction')).resolves.toEqual({ turnId: 'turn' });
  });

  it('a reply after the turn completed is still refused', async () => {
    const s = setup();
    await tick();
    s.beginTurn();
    await tick();
    s.notify('turn/completed', { turn: { id: 'turn', status: 'completed' } });
    await expect(s.worker.steer('x')).rejects.toThrow();
  });
});
