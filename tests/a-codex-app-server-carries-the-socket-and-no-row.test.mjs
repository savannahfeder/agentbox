// A CODEX APP-SERVER CARRIES THE SOCKET AND NO ROW — w-e5225b62ba.
//
// THE MISTAKE THIS EXISTS TO PREVENT, and it is the easy one to make. The Claude
// side puts the work item on each worker's environment, because a Claude Code
// worker is one process per item. Copying that onto the Codex app-server looks
// right and is wrong: ONE `codex app-server` serves every Codex thread of a
// login, so AGENTBOX_GATE_ITEM there would name whichever row happened to start
// first and then charge every other row's commands to it — the queue ordered by
// the wrong rank, the learned history taught under the wrong name, and nothing on
// any screen to show it. So the app-server gets the socket and nothing else, and
// each thread says who it is through the `session_id` in its hook payload.
//
// AND IT STILL SHIPS OFF. With the switch off a Codex app-server carries no
// socket at all, which is also what keeps the user's own terminal `codex` out of
// this: it reads the same hooks.json, and the hook exits on its first line when
// AGENTBOX_GATE_SOCK is absent.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const made = [];
afterEach(() => { for (const s of made.splice(0)) s.stopMemoryGate?.(); });

function makeSupervisor(memoryGate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-sup-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const sup = new Supervisor(
    { storeRoot: tmp, home: tmp, memoryGate, memoryGateSocket: path.join(tmp, 'g.sock'), memoryGateLockPort: 0 },
    store, root, tmp, tmp,
  );
  made.push(sup);
  return sup;
}

describe('what rides on the Codex app-server', () => {
  it('the socket, and not one word about which row', () => {
    const sup = makeSupervisor(true);
    const env = sup.codexMemoryGateEnv();
    expect(env.AGENTBOX_GATE_SOCK).toBe(sup.config.memoryGateSocket);
    expect(env.AGENTBOX_GATE_ITEM).toBeUndefined();
    expect(env.AGENTBOX_GATE_PRODUCT).toBeUndefined();
    expect(env.AGENTBOX_GATE_SCORE).toBeUndefined();
    expect(Object.keys(env)).toEqual(['AGENTBOX_GATE_SOCK']);
  });

  it('nothing at all while the switch is off', () => {
    expect(makeSupervisor(false).codexMemoryGateEnv()).toEqual({});
  });

  it('a Claude worker still carries all four, which is how it says who it is', () => {
    const sup = makeSupervisor(true);
    const env = sup.memoryGateEnv({ id: 'w-1', product: 'demo', priority: 7 });
    expect(env.AGENTBOX_GATE_SOCK).toBe(sup.config.memoryGateSocket);
    expect(env.AGENTBOX_GATE_ITEM).toBe('w-1');
    expect(env.AGENTBOX_GATE_PRODUCT).toBe('demo');
  });
});

describe('turning a Codex session id back into a row', () => {
  const liveCodex = (sup, itemId, sessionId, product = 'demo') => {
    sup.sessions.set(itemId, { engine: 'codex', sessionId, product });
  };

  it('finds the row whose thread it is', () => {
    const sup = makeSupervisor(true);
    liveCodex(sup, 'w-1', 'thread-aaa');
    liveCodex(sup, 'w-2', 'thread-bbb', 'other');
    expect(sup.memoryGateOwner('thread-bbb')).toEqual({ item: 'w-2', product: 'other' });
  });

  it('answers null for a thread this app is not running, so it is let through', () => {
    const sup = makeSupervisor(true);
    liveCodex(sup, 'w-1', 'thread-aaa');
    expect(sup.memoryGateOwner('thread-zzz')).toBe(null);
    expect(sup.memoryGateOwner('')).toBe(null);
    expect(sup.memoryGateOwner(undefined)).toBe(null);
  });

  it('never answers with a Claude session, whatever id it happens to hold', () => {
    // A Claude worker has no Codex thread, and its own id namespace is not this
    // one. Matching it here would hand a Codex command the wrong row.
    const sup = makeSupervisor(true);
    sup.sessions.set('w-claude', { engine: 'claude', sessionId: 'thread-aaa', product: 'demo' });
    expect(sup.memoryGateOwner('thread-aaa')).toBe(null);
  });

  it('answers null when no Codex thread has reported its id yet', () => {
    const sup = makeSupervisor(true);
    sup.sessions.set('w-1', { engine: 'codex', sessionId: null, product: 'demo' });
    expect(sup.memoryGateOwner(null)).toBe(null);
    expect(sup.memoryGateOwner('thread-aaa')).toBe(null);
  });
});
