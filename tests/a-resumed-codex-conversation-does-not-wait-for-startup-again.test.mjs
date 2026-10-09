// On 2026-10-07, 11 resumed launches of one task timed out after 30 seconds.
// Codex's lifecycle log confirmed the conversation was already loaded. Its MCP
// startup signal is a change notification, not a readiness response on resume.
import { describe, expect, it, vi } from 'vitest';
import { createCodexWorker } from '../main/codex-session.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
const tool = { name: 'claim_work_item', inputSchema: {} };
const connected = (extra = {}) => ({ name: 'agentbox', runtimeStatus: 'connected', tools: { claim_work_item: tool }, ...extra });

function build({ inventory = { data: [connected()] }, resume = true, required = 'agentbox' } = {}) {
  let handlers;
  const server = {
    startThread: vi.fn(async (_params, h) => { handlers = h; return { threadId: 'T' }; }),
    resumeThread: vi.fn(async (_params, h) => { handlers = h; return { thread: { id: 'T' } }; }),
    request: vi.fn(async () => typeof inventory === 'function' ? inventory() : inventory),
    startTurn: vi.fn(async () => ({ turn: { id: 'TURN' } })),
    unwatch: vi.fn(),
  };
  const worker = createCodexWorker({ server, resumeThreadId: resume ? 'T' : null, requireMcpServer: required, mcpReadyMs: 25 });
  const exits = [];
  const said = [];
  worker.on('exit', (...args) => exits.push(args));
  worker.stderr.on('data', line => said.push(line));
  const notify = params => handlers.onNotification('mcpServer/startupStatus/updated', params);
  return { server, worker, exits, said, notify };
}

describe('resuming Codex checks the existing store connection', () => {
  it('starts without another startup notification when the store is connected', async () => {
    const { server, worker } = build();
    await settle();
    expect(server.request).toHaveBeenCalledWith('mcpServerStatus/list', {
      threadId: 'T', serverName: 'agentbox', detail: 'toolsAndAuthOnly',
    });
    expect(server.startTurn).toHaveBeenCalledTimes(1);
    worker.kill();
  });

  it('accepts discovered tools on older Codex versions without runtime status', async () => {
    const { server, worker } = build({ inventory: { data: [connected({ runtimeStatus: null })] } });
    await settle();
    expect(server.startTurn).toHaveBeenCalledTimes(1);
    worker.kill();
  });

  it.each([
    { data: [] },
    { data: [connected({ name: 'another-server' })] },
    { data: [connected({ runtimeStatus: 'failed' })] },
    { data: [connected({ runtimeStatus: 'starting' })] },
    { data: [connected({ runtimeStatus: null, tools: {} })] },
  ])('does not mistake missing, failed, or unproven stores for readiness: %j', async inventory => {
    const { server, exits } = build({ inventory });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(server.startTurn).not.toHaveBeenCalled();
    expect(exits).toHaveLength(1);
    expect(exits[0][0]).toBe(1);
  });

  it('still recovers from starting when the ready notification arrives', async () => {
    const { server, worker, notify } = build({ inventory: { data: [connected({ runtimeStatus: 'starting' })] } });
    await settle();
    expect(server.startTurn).not.toHaveBeenCalled();
    notify({ name: 'agentbox', status: 'ready' });
    await settle();
    expect(server.startTurn).toHaveBeenCalledTimes(1);
    worker.kill();
  });

  it('keeps the deadline when the inventory request hangs', async () => {
    const { server, exits } = build({ inventory: () => new Promise(() => {}) });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(server.startTurn).not.toHaveBeenCalled();
    expect(exits).toHaveLength(1);
  });

  it('finds the store on a later inventory page', async () => {
    let page = 0;
    const { server, worker } = build({ inventory: () => ++page === 1
      ? { data: [connected({ name: 'another-server' })], nextCursor: 'next' }
      : { data: [connected()] } });
    await settle();
    expect(server.request).toHaveBeenLastCalledWith('mcpServerStatus/list', {
      threadId: 'T', serverName: 'agentbox', detail: 'toolsAndAuthOnly', cursor: 'next',
    });
    expect(server.startTurn).toHaveBeenCalledTimes(1);
    worker.kill();
  });

  it('stops reading when pagination repeats instead of looping forever', async () => {
    const { server, said } = build({ inventory: { data: [], nextCursor: 'same' } });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(server.request).toHaveBeenCalledTimes(2);
    expect(server.startTurn).not.toHaveBeenCalled();
    expect(said.join('\n')).toContain('repeated its pagination cursor');
  });

  it('starts only once when startup wins the race with inventory', async () => {
    let answer;
    const { server, worker, notify } = build({ inventory: () => new Promise(resolve => { answer = resolve; }) });
    await settle();
    notify({ name: 'agentbox', status: 'ready' });
    await settle();
    answer({ data: [connected()] });
    await settle();
    expect(server.startTurn).toHaveBeenCalledTimes(1);
    worker.kill();
  });

  it('keeps the actual inventory error when the request fails', async () => {
    const { server, said } = build({ inventory: () => { throw new Error('inventory unavailable'); } });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(server.startTurn).not.toHaveBeenCalled();
    expect(said.join('\n')).toContain('inventory unavailable');
  });

  it('does not start after Stop while the inventory response is pending', async () => {
    let answer;
    const { server, worker, exits } = build({ inventory: () => new Promise(resolve => { answer = resolve; }) });
    await settle();
    worker.kill();
    answer({ data: [connected()] });
    await settle();
    expect(server.startTurn).not.toHaveBeenCalled();
    expect(exits).toEqual([[143, 'SIGTERM', null]]);
  });

  it('does not query inventory for a fresh conversation or an install without a store', async () => {
    for (const options of [{ resume: false }, { required: null }]) {
      const { server, worker } = build(options);
      await settle();
      expect(server.request).not.toHaveBeenCalled();
      worker.kill();
    }
  });
});
