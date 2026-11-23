// A reply on its way when a cloud Codex turn ends is kept for the next turn.
//
// What broke: in the overnight Cloud test (2026-11-16, round three) a reply
// sent as a cloud Codex turn finished came back into the reply box with
// "turn/steer: codex app-server was closed by Agentbox (the cloud run finished
// its turn)". The steer was already sent; then the turn ended, and ending a
// cloud turn closes the connection (main/cloud/codex-cloud.mts), which rejects
// whatever was still waiting. Tonight's earlier fix only knew Codex's own
// "no active turn" wording, so this one was a failed send.
//
// The rule: a steer that fails after this worker's turn has ended is too late
// for the turn (TURN_CLOSED), whatever the error says, and live-replies saves
// it for the next run. One that fails while the turn still runs stays a
// failed send.
import { describe, it, expect } from 'vitest';
import { createCodexWorker } from '../main/codex-session.mts';
import { TURN_CLOSED } from '../main/claude-input.mts';

type Handlers = { onNotification: (method: string, params: unknown) => void };

function setup() {
  let handlers: Handlers | null = null;
  let refuse: ((e: Error) => void) | null = null;
  const server = {
    startThread: async (_p: unknown, h: Handlers) => { handlers = h; return { threadId: 'thread' }; },
    startTurn: async () => ({ turn: { id: 'turn' } }),
    unwatch() {},
    steerTurn: () => new Promise((_resolve, reject) => { refuse = reject; }),
  };
  const worker = createCodexWorker({ server, turnStartWaitMs: 50 } as Parameters<typeof createCodexWorker>[0]);
  worker.stderr.on('data', () => {});
  return {
    worker,
    endTurn: () => handlers!.onNotification('turn/completed', { turn: { id: 'turn', status: 'completed' } }),
    closeConnection: () => refuse!(new Error('turn/steer: codex app-server was closed by Agentbox (the cloud run finished its turn)')),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a reply on its way as a cloud Codex turn ends', () => {
  it('is kept for the next turn when the connection closes behind the ended turn', async () => {
    const s = setup();
    await tick(); await tick();
    const sent = s.worker.steer('and the exit code?');
    await tick();
    s.endTurn();
    s.closeConnection();
    await expect(sent).rejects.toMatchObject({ code: TURN_CLOSED });
  });

  it('is still a failed send when the connection closes while the turn runs', async () => {
    const s = setup();
    await tick(); await tick();
    const sent = s.worker.steer('and the exit code?');
    await tick();
    s.closeConnection();
    await expect(sent).rejects.toThrow(/was closed by Agentbox/);
    await expect(sent).rejects.not.toMatchObject({ code: TURN_CLOSED });
  });
});
