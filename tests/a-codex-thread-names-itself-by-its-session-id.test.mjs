// A CODEX THREAD NAMES ITSELF BY ITS SESSION ID — w-e5225b62ba.
//
// THE PROBLEM THIS SOLVES, AND IT ONLY EXISTS ON THE CODEX SIDE. A Claude Code
// worker is a process per work item, so the item rides in its environment
// (AGENTBOX_GATE_ITEM, set by memoryGateEnv). Codex is not: ONE
// `codex app-server` serves every Codex thread of a login, so there is one
// environment for all of them. Putting an item id on it would label every
// Codex thread on the Mac as the same row — the first one that happened to
// start — and the gate would order the queue by that row's rank and charge that
// row's history with every other row's commands.
//
// So the thread says who it is instead. Measured on this Mac 2026-10-04,
// codex-cli 0.160.0: the `session_id` a PreToolUse hook is handed is the
// app-server's own `thread.id`, the same string `thread/started` reports and
// the same one main/codex.mjs already keeps as `session.sessionId`.
//
// AND A SESSION NOBODY CLAIMS IS LET STRAIGHT THROUGH. The user's own
// `codex` in a terminal reads the same hooks.json, so it would ask too. It is
// not ours to hold: it gets an immediate allow, it is counted apart so the
// numbers on the Agents page stay about this app's own work, and it teaches the
// learned history nothing. (In practice it never even asks: the hook exits on
// its first line when AGENTBOX_GATE_SOCK is absent, and only the app's own
// app-server is spawned with it.)

import { describe, it, expect, afterEach } from 'vitest';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';

const pressure = { level: 1, freePct: 90 };
const servers = [];
const make = (over = {}) => {
  const s = new MemoryGateServer({
    socketPath: null,
    readPressure: async () => pressure,
    sampleProcesses: async () => [],
    pollMs: 10_000,
    ...over,
  });
  servers.push(s);
  return s;
};
afterEach(() => { for (const s of servers.splice(0)) try { s.stop?.(); } catch { /* not started */ } });

/** One `/pre` ask, as the hook sends it, answered the way curl would read it. */
const ask = (server, body) => new Promise((resolve) => {
  const res = {
    headers: {}, ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    end(text) { if (!this.ended) { this.ended = true; resolve(String(text ?? '')); } },
    on() {},
  };
  server._pre(body, {}, res);
  setTimeout(() => res.end('\u0000waiting'), 20);
});

const codexAsk = (sessionId, command = 'npx vitest run') => ({
  v: 1, event: 'pre', item: '', product: '', score: 0, ppid: 123,
  hook: {
    session_id: sessionId,
    turn_id: 't1',
    cwd: '/repo',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: `exec-${sessionId}-${command.length}`,
  },
});

describe('whose command is this', () => {
  it('a Codex thread the app knows is charged to that thread`s row', () => {
    const seen = [];
    const server = make({
      ownerOf: (id) => (id === 'thread-aaa' ? { item: 'w-123', product: 'astral' } : null),
      scoreFor: (product, item) => { seen.push([product, item]); return 7; },
    });
    return ask(server, codexAsk('thread-aaa')).then(() => {
      expect(seen).toEqual([['astral', 'w-123']]);
    });
  });

  it('a Claude worker still uses the item on its own environment, not a lookup', () => {
    let asked = 0;
    const server = make({ ownerOf: () => { asked++; return null; } });
    const body = { ...codexAsk('thread-aaa'), item: 'w-env', product: 'astral' };
    delete body.hook.session_id;
    return ask(server, body).then(() => {
      expect(asked).toBe(0);
      expect(server.status().counts.asked).toBe(1);
    });
  });

  it('the environment wins over the session id, so a Claude worker is never relabelled', () => {
    const server = make({ ownerOf: () => ({ item: 'w-other', product: 'other' }) });
    const seen = [];
    server.scoreFor = (product, item) => { seen.push([product, item]); return 1; };
    return ask(server, { ...codexAsk('thread-aaa'), item: 'w-env', product: 'astral' }).then(() => {
      expect(seen).toEqual([['astral', 'w-env']]);
    });
  });
});

describe('a session this app does not own', () => {
  it('is allowed at once, however heavy the command', () => {
    const server = make({ ownerOf: () => null, gate: { slots: 0 } });
    return ask(server, codexAsk('somebody-elses-thread', 'npx vitest run')).then((out) => {
      expect(out).toBe('');
    });
  });

  it('is counted apart, so the Agents page still reads as this app`s own work', () => {
    const server = make({ ownerOf: () => null });
    return ask(server, codexAsk('somebody-elses-thread')).then(() => {
      const { counts } = server.status();
      expect(counts.asked).toBe(0);
      expect(counts.waited).toBe(0);
      expect(counts.refused).toBe(0);
      expect(counts.foreign).toBe(1);
    });
  });

  it('teaches the learned history nothing, because we never measured it', () => {
    const server = make({ ownerOf: () => null });
    return ask(server, codexAsk('somebody-elses-thread')).then(() => {
      server._post(codexAsk('somebody-elses-thread'));
      expect(server.history.toJSON().keys).toEqual([]);
    });
  });

  it('is still let through when there is no lookup wired up at all', () => {
    const server = make({ gate: { slots: 0 } });
    return ask(server, codexAsk('thread-aaa')).then((out) => expect(out).toBe(''));
  });
});

describe('a command with no session id and no item', () => {
  // "Let it through" is only for a thread we POSITIVELY know is somebody else's.
  // An ask naming nothing is gated with no row, exactly as it was before the
  // Codex side existed — otherwise a payload we failed to read would be a way
  // past the gate, and the Claude tests that call `_pre` with no item would be
  // asserting the opposite of what the gate does.
  it('is still gated, with no row, the way it was before any of this', () => {
    const server = make({ ownerOf: () => null, gate: { slots: 0 } });
    const body = codexAsk('x');
    delete body.hook.session_id;
    return ask(server, body).then((out) => {
      expect(out).toBe('\u0000waiting');
      expect(server.status().counts.asked).toBe(1);
      expect(server.status().counts.foreign).toBe(0);
    });
  });
});

describe('a lookup that throws', () => {
  it('lets the command run rather than taking the agent down with it', () => {
    const server = make({ ownerOf: () => { throw new Error('store is busy'); }, gate: { slots: 0 } });
    return ask(server, codexAsk('thread-aaa')).then((out) => expect(out).toBe(''));
  });
});
