// A reply to a Codex thread came back as "codex app-server refused turn/steer:
// no active turn to steer", and the words went back into the reply box with
// "did not reach its agent" (overnight tester, 2026-11-16, three times). The
// turn had finished on the server a moment before the app heard so. A reply
// that misses its turn is too late for this one (TURN_CLOSED), which
// main/live-replies.mts saves for the next run rather than refusing.
import { describe, it, expect } from 'vitest';
import { createCodexWorker } from '../main/codex-session.mts';
import { TURN_CLOSED } from '../main/claude-input.mts';

type Handlers = { onNotification: (method: string, params: unknown) => void };

function setup(steerTurn: (...args: unknown[]) => Promise<unknown>) {
  let handlers: Handlers | null = null;
  const server = {
    startThread: async (_p: unknown, h: Handlers) => { handlers = h; return { threadId: 'thread' }; },
    startTurn: async () => ({ turn: { id: 'turn' } }),
    unwatch() {},
    steerTurn,
  };
  const worker = createCodexWorker({ server, turnStartWaitMs: 50 } as Parameters<typeof createCodexWorker>[0]);
  worker.stderr.on('data', () => {});
  return { worker, notify: (m: string, p: unknown) => handlers!.onNotification(m, p) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a reply Codex has no turn for', () => {
  it('is kept for the next turn when the server says there is no active turn', async () => {
    const s = setup(async () => { throw new Error('codex app-server refused turn/steer: no active turn to steer'); });
    await tick(); await tick();
    await expect(s.worker.steer('merge it')).rejects.toMatchObject({ code: TURN_CLOSED });
  });

  it('is kept for the next turn when the turn already completed here', async () => {
    const s = setup(async () => ({ turnId: 'turn' }));
    await tick(); await tick();
    s.notify('turn/completed', { turn: { id: 'turn', status: 'completed' } });
    await expect(s.worker.steer('one more')).rejects.toMatchObject({ code: TURN_CLOSED });
  });

  it('any other refusal is still a failed send', async () => {
    const s = setup(async () => { throw new Error('codex app-server refused turn/steer: input too large'); });
    await tick(); await tick();
    const sent = s.worker.steer('huge');
    await expect(sent).rejects.toThrow(/input too large/);
    await expect(sent).rejects.not.toMatchObject({ code: TURN_CLOSED });
  });
});
