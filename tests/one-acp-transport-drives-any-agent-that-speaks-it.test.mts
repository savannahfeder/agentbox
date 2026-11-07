// 2026-10-09: the second half of the engine work. Grok, pi, Gemini CLI and
// Hermes all speak the Agent Client Protocol, so one transport covers them
// instead of one adapter each (github.com/savannahfeder/agentbox/issues/21).
//
// WHAT IS PINNED HERE IS THE PART THAT CAN BE WRONG WHILE A DEMO STILL LOOKS
// PERFECT, which is every lesson main/codex-app-server.mjs paid for already:
//
// - A permission request must ALWAYS be answered. A promise nobody settles is
//   a worker parked forever with nothing on the row, and on this protocol the
//   agent is blocked on us, so a dropped answer is a hung task.
// - A refusal must be a refusal the agent understands. Option ids are the
//   vendor's own words, so "deny" means finding the option whose KIND is a
//   rejection, and answering `cancelled` when the agent offered none.
// - A method we never advertised must be refused out loud. Silence on a
//   JSON-RPC request is the same hang in the other direction.
// - A frame longer than the limit closes the connection instead of growing a
//   buffer until the app dies.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createAcpClient, ACP_PROTOCOL_VERSION, rejectionOption } from '../main/acp.mts';

// A fake agent: one object per line in, one object per line out.
function fakeAgent() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.sent = [];
  child.stdin = { writable: true, write: (text, cb) => { child.sent.push(JSON.parse(text)); cb?.(); return true; }, end: () => { child.stdin.writable = false; }, on: () => {} };
  child.kill = () => { child.killed = true; };
  child.say = message => child.stdout.emit('data', Buffer.from(`${JSON.stringify(message)}\n`));
  child.reply = (id, result) => child.say({ jsonrpc: '2.0', id, result });
  child.lastCall = method => [...child.sent].reverse().find(m => m.method === method) ?? null;
  return child;
}

const settle = async (child, method, result) => {
  await vi.waitFor(() => expect(child.lastCall(method)).toBeTruthy());
  child.reply(child.lastCall(method).id, result);
};

describe('one transport for every agent that speaks ACP', () => {
  it('introduces itself and remembers what the agent said it can do', async () => {
    const child = fakeAgent();
    const client = createAcpClient({ transport: child });
    const ready = client.initialize();
    await vi.waitFor(() => expect(child.lastCall('initialize')).toBeTruthy());
    expect(child.lastCall('initialize').params.protocolVersion).toBe(ACP_PROTOCOL_VERSION);
    // We do not lend the agent our filesystem or our terminal: it has its own,
    // and anything we advertise here is a door we then have to police.
    expect(child.lastCall('initialize').params.clientCapabilities).toEqual({ fs: { readTextFile: false, writeTextFile: false }, terminal: false });
    child.reply(child.lastCall('initialize').id, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true, promptCapabilities: { image: false } },
      authMethods: [{ id: 'oauth', name: 'Sign in' }],
    });
    const agent = await ready;
    expect(agent.agentCapabilities.loadSession).toBe(true);
    expect(client.can('loadSession')).toBe(true);
    expect(client.can('image')).toBe(false);
    expect(agent.authMethods).toEqual([{ id: 'oauth', name: 'Sign in' }]);
  });

  it('starts a session in the task folder and carries one turn', async () => {
    const child = fakeAgent();
    const client = createAcpClient({ transport: child });
    const turn = (async () => {
      const { sessionId } = await client.newSession({ cwd: '/tmp/task', mcpServers: [] });
      expect(sessionId).toBe('s-1');
      return client.prompt({ sessionId, text: 'do the thing' });
    })();
    await settle(child, 'session/new', { sessionId: 's-1' });
    await settle(child, 'session/prompt', { stopReason: 'end_turn' });
    expect(await turn).toEqual({ stopReason: 'end_turn' });
    expect(child.lastCall('session/prompt').params).toEqual({ sessionId: 's-1', prompt: [{ type: 'text', text: 'do the thing' }] });
  });

  it('refuses to resume on an agent that never said it could', async () => {
    const child = fakeAgent();
    const client = createAcpClient({ transport: child });
    const ready = client.initialize();
    await settle(child, 'initialize', { protocolVersion: ACP_PROTOCOL_VERSION, agentCapabilities: {} });
    await ready;
    const before = child.sent.length;
    await expect(client.loadSession({ sessionId: 's-1', cwd: '/tmp/task' })).rejects.toThrow(/resume/i);
    expect(child.sent.length).toBe(before); // nothing was put on the wire
  });

  it('hands a permission request to the inbox and sends back the option chosen', async () => {
    const child = fakeAgent();
    const asked = [];
    const client = createAcpClient({ transport: child, onPermission: request => { asked.push(request); return Promise.resolve('allow-1'); } });
    child.say({
      jsonrpc: '2.0', id: 7, method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        toolCall: { toolCallId: 't-1', title: 'Run rm -rf build', kind: 'execute' },
        options: [{ optionId: 'allow-1', name: 'Allow once', kind: 'allow_once' }, { optionId: 'no-1', name: 'Reject', kind: 'reject_once' }],
      },
    });
    await vi.waitFor(() => expect(child.sent.find(m => m.id === 7)).toBeTruthy());
    expect(asked[0].toolCall.title).toBe('Run rm -rf build');
    expect(child.sent.find(m => m.id === 7).result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-1' } });
  });

  it('answers a refusal in the agent own words, and cancels when it offered none', async () => {
    // The ids are the vendor's. A refusal is the option whose KIND rejects.
    expect(rejectionOption([{ optionId: 'a', kind: 'allow_once' }, { optionId: 'n', kind: 'reject_once' }])).toBe('n');
    expect(rejectionOption([{ optionId: 'a', kind: 'allow_once' }, { optionId: 'N', kind: 'reject_always' }])).toBe('N');
    expect(rejectionOption([{ optionId: 'a', kind: 'allow_once' }])).toBe(null);

    const child = fakeAgent();
    const client = createAcpClient({ transport: child, onPermission: () => { throw Error('nobody was home'); } });
    child.say({ jsonrpc: '2.0', id: 8, method: 'session/request_permission', params: { sessionId: 's-1', toolCall: { toolCallId: 't' }, options: [{ optionId: 'a', kind: 'allow_once' }, { optionId: 'n', kind: 'reject_once' }] } });
    await vi.waitFor(() => expect(child.sent.find(m => m.id === 8)).toBeTruthy());
    expect(child.sent.find(m => m.id === 8).result).toEqual({ outcome: { outcome: 'selected', optionId: 'n' } });

    child.say({ jsonrpc: '2.0', id: 9, method: 'session/request_permission', params: { sessionId: 's-1', toolCall: { toolCallId: 't' }, options: [{ optionId: 'a', kind: 'allow_once' }] } });
    await vi.waitFor(() => expect(child.sent.find(m => m.id === 9)).toBeTruthy());
    expect(child.sent.find(m => m.id === 9).result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('cancels a turn and answers the question it was parked on', async () => {
    const child = fakeAgent();
    let settleIt;
    const client = createAcpClient({ transport: child, onPermission: () => new Promise(resolve => { settleIt = resolve; }) });
    child.say({ jsonrpc: '2.0', id: 10, method: 'session/request_permission', params: { sessionId: 's-1', toolCall: { toolCallId: 't' }, options: [{ optionId: 'a', kind: 'allow_once' }, { optionId: 'n', kind: 'reject_once' }] } });
    await vi.waitFor(() => expect(client.openPermissions()).toBe(1));
    client.cancel('s-1');
    // The protocol says a cancelled turn MUST answer `cancelled`, so the card
    // the person never pressed cannot land as an approval afterwards.
    await vi.waitFor(() => expect(child.sent.find(m => m.id === 10)).toBeTruthy());
    expect(child.sent.find(m => m.id === 10).result).toEqual({ outcome: { outcome: 'cancelled' } });
    expect(child.lastCall('session/cancel')).toMatchObject({ method: 'session/cancel', params: { sessionId: 's-1' } });
    expect(child.lastCall('session/cancel').id).toBeUndefined(); // a notification
    settleIt?.('a');
    await vi.waitFor(() => expect(child.sent.filter(m => m.id === 10).length).toBe(1)); // and not twice
  });

  it('refuses a door it never opened instead of going quiet', async () => {
    const child = fakeAgent();
    createAcpClient({ transport: child });
    for (const method of ['fs/read_text_file', 'fs/write_text_file', 'terminal/create']) {
      child.say({ jsonrpc: '2.0', id: method, method, params: { sessionId: 's-1' } });
      await vi.waitFor(() => expect(child.sent.find(m => m.id === method)).toBeTruthy());
      expect(child.sent.find(m => m.id === method).error.code).toBe(-32601);
    }
  });

  it('reads one object per line, and closes rather than growing a buffer', async () => {
    const child = fakeAgent();
    const heard = [];
    const client = createAcpClient({ transport: child, onNotification: (method, params) => heard.push([method, params]), maxFrameLength: 64 });
    // Two messages in one chunk, and a message split across two chunks.
    child.stdout.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"session/update","params":{"a":1}}\n{"jsonrpc":"2.0","method":"session/update","params":{"a":2}}\n'));
    child.stdout.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"session/upd'));
    child.stdout.emit('data', Buffer.from('ate","params":{"a":3}}\n'));
    expect(heard.map(([, params]) => params.a)).toEqual([1, 2, 3]);
    // A line that never ends is not a message; it is a leak.
    child.stdout.emit('data', Buffer.from('x'.repeat(200)));
    expect(client.closed()).toMatch(/too long|frame/i);
    expect(child.killed).toBe(true);
  });
});
