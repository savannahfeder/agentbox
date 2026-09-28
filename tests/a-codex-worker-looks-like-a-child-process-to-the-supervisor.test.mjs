// A CODEX WORKER HAS TO LOOK LIKE A CHILD PROCESS, BECAUSE THE SUPERVISOR HAS
// ONLY EVER SEEN ONE.
//
// Agentbox spawns one child per work item. `main/supervisor.mjs` is 4,299 lines
// and `session.child` appears in exactly ONE of them (`session.child.kill`),
// while the local `child` handle inside `spawnWorker` is used in exactly five
// ways: `once('spawn')`, `stdout.on('data')`, `stderr.on('data')`,
// `on('exit')`, `kill`. Measured against the file on 2026-09-04 with `grep -n
// 'session\.child\|child\.' main/supervisor.mjs`.
//
// A Codex worker has no process of its own. It is one thread inside a shared
// `codex app-server`, proven the same day by running several concurrently:
// independent thread ids, interleaved progress, no head-of-line blocking. So
// main/codex-session.mjs is a facade over one thread that satisfies that
// five-method contract, and this file is the contract written down.
//
// THE ONE THAT IS NOT A CONVENIENCE IS THE SIGNAL.
//
// THE OTHER MEASUREMENTS THIS FILE PINS, all taken on codex-cli 0.148.0 on
// 2026-09-04 by running it:
//
//   - A bare `thread/start` launched her `playwright` and `context7` MCP
//     servers unbidden. `config: { mcp_servers: {} }` did NOT stop them (the
//     override is a deep merge), `mcp_servers: null` was REFUSED outright, and
//     only naming each server with `enabled: false` worked -- after which the
//     single remaining server was `codex_apps`, which is Codex's own built-in
//     and is not in her config at all.
//   - `thread/resume` fails `no rollout found` on an ephemeral thread, so
//     `ephemeral: false` is what makes a reply on a row reach the same worker.
//   - Codex writes `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`.
//     There were 1,700 of them on this machine (`find ~/.codex/sessions -name
//     'rollout-*.jsonl' | wc -l`), which is why the search is bounded and
//     newest-first, and why matching on a substring of the filename would
//     eventually hand `thread/resume` a stranger's conversation.

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createCodexWorker,
  workerThreadParams,
  mcpIsolation,
  mcpServerNames,
  codexTranscriptFile,
  WORKER_APPROVAL_POLICY,
  WORKER_SANDBOX,
} from '../main/codex-session.mjs';
import { createCodexAppServer } from '../main/codex-app-server.mjs';

/**
 * Let every queued microtask and immediate run, which is where this facade
 *  lives: `thread/start` resolves on a promise and the supervisor's listeners
 *  are attached synchronously before any of it. */
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

/**
 * A notepad in the shape of the app-server client, so this file tests the
 * facade rather than the transport underneath it. The one end-to-end block at
 * the bottom uses the real client, so nothing here is only true of the notepad.
 */
function fakeServer() {
  const calls = [];
  const state = { handlers: null, threadId: 'T-1', startFails: null, resumeFails: null };
  return {
    calls,
    state,
    /**
     * Deliver a notification the way the transport does: straight to the
     *  handlers this worker registered when it started its thread. */
    notify: (method, params) => state.handlers?.onNotification?.(method, params),
    closed: (gone) => state.handlers?.onClosed?.(gone),
    server: {
      startThread: (params, handlers) => {
        calls.push({ method: 'thread/start', params });
        state.handlers = handlers;
        if (state.startFails) return Promise.reject(new Error(state.startFails));
        return Promise.resolve({ threadId: state.threadId, thread: { id: state.threadId } });
      },
      resumeThread: (params, handlers) => {
        calls.push({ method: 'thread/resume', params });
        state.handlers = handlers;
        if (state.resumeFails) return Promise.reject(new Error(state.resumeFails));
        return Promise.resolve({ thread: { id: params.threadId } });
      },
      startTurn: (threadId, params) => {
        calls.push({ method: 'turn/start', threadId, params });
        return Promise.resolve({ turn: { id: 'TURN-1', status: 'inProgress' } });
      },
      interruptTurn: vi.fn((threadId, turnId) => {
        calls.push({ method: 'turn/interrupt', threadId, turnId });
        return Promise.resolve({});
      }),
      unwatch: vi.fn((threadId) => { calls.push({ method: 'unwatch', threadId }); return true; }),
    },
  };
}

function build(options = {}) {
  const fake = fakeServer();
  const worker = createCodexWorker({ server: fake.server, ...options });
  const exits = [];
  const said = [];
  const events = [];
  let spawned = 0;
  worker.once('spawn', () => { spawned += 1; });
  worker.on('exit', (code, signal) => exits.push({ code, signal }));
  worker.on('event', (method, params) => events.push({ method, params }));
  worker.stderr.on('data', (text) => said.push(String(text)));
  return { fake, worker, exits, said, events, spawnCount: () => spawned };
}

const turnEnded = (status, error = null) => ['turn/completed', { threadId: 'T-1', turn: { id: 'TURN-1', status, error } }];

/* ===================== the five-method contract itself ==================== */

describe('a codex worker answers every call the supervisor makes on a child', () => {
  it('emits spawn once the thread exists, and not before', async () => {
    const { fake, worker, spawnCount } = build();
    // Synchronously after the call there is no thread yet: `spawnWorker` is
    // allowed to attach its listeners before anything can fire, exactly as it
    // is with a real ChildProcess.
    expect(spawnCount()).toBe(0);
    expect(fake.calls).toEqual([]);

    await settle();

    expect(spawnCount()).toBe(1);
    expect(worker.threadId).toBe('T-1');
    expect(fake.calls.map((c) => c.method)).toEqual(['thread/start', 'turn/start']);
  });

  // The supervisor writes `stderr: <text>` into the session tail and
  // `troubleCause` classifies a dead run off those lines. An emitter that is
  // missing is a TypeError on the spawn path.
  it('has a real stderr, and deliberately no stdout', async () => {
    const { worker } = build();
    await settle();
    expect(typeof worker.stderr.on).toBe('function');
    expect(typeof worker.once).toBe('function');
    expect(typeof worker.kill).toBe('function');
    // NOT faked. The supervisor swaps its readers per session instead; see the
    // header of main/codex-session.mjs.
    expect(worker.stdout).toBeUndefined();
  });

  it('forwards every notification on its thread, unchanged', async () => {
    const { fake, events } = build();
    await settle();

    fake.notify('item/agentMessage/delta', { threadId: 'T-1', delta: 'half a ' });
    fake.notify('item/completed', { threadId: 'T-1', item: { type: 'agentMessage', text: 'done', phase: 'final_answer' } });

    expect(events.map((e) => e.method)).toEqual(['item/agentMessage/delta', 'item/completed']);
    expect(events[0].params.delta).toBe('half a ');
    expect(events[1].params.item.phase).toBe('final_answer');
  });
});

/* =========================== how a turn ends ============================= */

describe('what a codex worker reports when its turn ends', () => {
  it('exits 0 when the turn completed', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify(...turnEnded('completed'));
    expect(exits).toEqual([{ code: 0, signal: null }]);
  });

  it('exits non-zero when the turn failed', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify(...turnEnded('failed', { message: 'the model refused' }));
    expect(exits).toHaveLength(1);
    expect(exits[0].code).not.toBe(0);
  });

  // `TurnStatus` has four values and `interrupted` is a run with no answer
  // exactly as much as `failed` is. A zero here would tell the supervisor the
  // work finished and take the row out of the retry machinery's reach.
  it('exits non-zero when the turn was interrupted', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify(...turnEnded('interrupted'));
    expect(exits).toHaveLength(1);
    expect(exits[0].code).not.toBe(0);
  });

  // `turn/failed` appears in no schema file in 0.148.0 -- failure arrives as
  // `turn/completed` with `status: "failed"` -- but dropping a notification
  // means a run that reads as unfinished forever, and being wrong that way is
  // free.
  it('still ends on a turn/failed notification, which this version never sends', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify('turn/failed', { threadId: 'T-1', turn: { id: 'TURN-1' } });
    expect(exits).toHaveLength(1);
    expect(exits[0].code).not.toBe(0);
  });

  // THE CASE THAT MUST NOT MATCH. `turn/start` resolves the instant the turn is
  // ACCEPTED, with `status: "inProgress"`, and a client that reads that as an
  // ending reports every run as finished the moment it starts.
  it('does not end on a turn that is still in progress', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify('turn/completed', { threadId: 'T-1', turn: { id: 'TURN-1', status: 'inProgress' } });
    expect(exits).toEqual([]);
  });

  it('says why on stderr when the turn did not finish, so the cause can be named', async () => {
    const { fake, said } = build();
    await settle();
    fake.notify(...turnEnded('failed', {
      message: 'Not inside a trusted directory and --skip-git-repo-check was not specified.',
    }));
    expect(said.join('\n')).toMatch(/not inside a trusted directory/i);
  });

  it('says nothing on stderr when the turn completed', async () => {
    const { fake, said } = build();
    await settle();
    fake.notify(...turnEnded('completed'));
    expect(said).toEqual([]);
  });

  it('ends once, however many endings arrive', async () => {
    const { fake, exits } = build();
    await settle();
    fake.notify(...turnEnded('completed'));
    fake.notify(...turnEnded('failed', { message: 'late' }));
    fake.closed({ reason: 'exit', code: 1, stderr: '' });
    expect(exits).toHaveLength(1);
  });
});

/* ================= our kill, and the thing it protects =================== */

describe('a kill of ours is tellable from a death', () => {
  // THE CASE. `settleDelivery` reads `signal || session.stoppedByUs`, and this
  // is the half this file owes it.
  it('sets a signal when we killed it', async () => {
    const { fake, worker, exits } = build();
    await settle();

    expect(worker.kill()).toBe(true);

    expect(exits).toHaveLength(1);
    expect(exits[0].signal).toBe('SIGTERM');
    expect(exits[0].code).not.toBe(0);
    expect(fake.server.interruptTurn).toHaveBeenCalledWith('T-1', 'TURN-1');
  });

  // THE CASE THAT MUST NOT MATCH, and the one that actually costs her work: a
  // real death must report NO signal, or every ordinary failure would read as
  // an interruption and would be retried forever instead of capping at three.
  it.each([
    ['a failed turn', (fake) => fake.notify(...turnEnded('failed', { message: 'died' }))],
    ['an interrupted turn nobody asked for', (fake) => fake.notify(...turnEnded('interrupted'))],
    ['the app-server dying under it', (fake) => fake.closed({ reason: 'exit', code: 1, signal: null, stderr: 'boom' })],
  ])('leaves the signal null when %s ended it', async (_what, die) => {
    const { fake, exits } = build();
    await settle();

    die(fake);

    expect(exits).toHaveLength(1);
    expect(exits[0].signal).toBeNull();
  });

  // `turn/interrupt` takes BOTH ids -- a turn is not identified by either one
  // alone -- and the turn id arrives on `turn/started` before `turn/start`
  // resolves, so the earliest honest place to read it is the notification.
  it('interrupts with the turn id it learned from the notification', async () => {
    const { fake, worker } = build();
    await settle();
    fake.notify('turn/started', { threadId: 'T-1', turn: { id: 'TURN-LATER' } });

    worker.kill();

    expect(fake.server.interruptTurn).toHaveBeenCalledWith('T-1', 'TURN-LATER');
  });

  // A kill before there is a turn to interrupt still has to END, or the app
  // hangs on quit waiting for a worker that never started.
  it('still ends when there is no turn to interrupt yet', async () => {
    const fake = fakeServer();
    fake.state.startFails = null;
    const worker = createCodexWorker({ server: fake.server, threadParams: { cwd: '/tmp/p' } });
    const exits = [];
    worker.on('exit', (code, signal) => exits.push({ code, signal }));

    expect(worker.kill()).toBe(true);
    await settle();

    expect(exits).toEqual([{ code: 143, signal: 'SIGTERM' }]);
    expect(fake.server.interruptTurn).not.toHaveBeenCalled();
  });

  // A late `turn/completed` saying `interrupted` must not overwrite the ending
  // we already gave, because that ending is the one carrying the signal.
  it('is not undone by the interrupted turn that follows it', async () => {
    const { fake, worker, exits } = build();
    await settle();
    worker.kill();

    fake.notify(...turnEnded('interrupted'));

    expect(exits).toEqual([{ code: 143, signal: 'SIGTERM' }]);
  });

  it('refuses a second kill rather than ending twice', async () => {
    const { worker, exits } = build();
    await settle();
    expect(worker.kill()).toBe(true);
    expect(worker.kill()).toBe(false);
    expect(exits).toHaveLength(1);
  });
});

/* ======================= the thread is let go ============================ */

describe('a finished worker stops holding its thread', () => {
  // A watch left installed hands every later line carrying that id to a
  // listener for a session that does not exist, and keeps the whole client
  // alive holding it.
  it.each([
    ['it completed', (fake) => fake.notify(...turnEnded('completed'))],
    ['we killed it', (_fake, worker) => worker.kill()],
    ['it failed', (fake) => fake.notify(...turnEnded('failed', { message: 'x' }))],
  ])('releases the thread when %s', async (_what, end) => {
    const { fake, worker } = build();
    await settle();

    end(fake, worker);

    expect(fake.server.unwatch).toHaveBeenCalledWith('T-1');
  });
});

/* ==================== a worker that never got started ==================== */

describe('a worker whose thread never started says so and ends', () => {
  it('carries the refusal on stderr and exits non-zero', async () => {
    const fake = fakeServer();
    fake.state.startFails = 'thread/start: codex app-server exited (code 1, signal null): Not inside a trusted directory';
    const worker = createCodexWorker({ server: fake.server, threadParams: { cwd: '/tmp/p' } });
    const exits = [];
    const said = [];
    worker.on('exit', (code, signal) => exits.push({ code, signal }));
    worker.stderr.on('data', (t) => said.push(String(t)));

    await settle();

    expect(exits).toHaveLength(1);
    expect(exits[0].code).not.toBe(0);
    expect(exits[0].signal).toBeNull();
    expect(said.join('\n')).toMatch(/not inside a trusted directory/i);
  });

  it('never says it spawned', async () => {
    const fake = fakeServer();
    fake.state.startFails = 'no';
    const worker = createCodexWorker({ server: fake.server, threadParams: { cwd: '/tmp/p' } });
    let spawned = 0;
    worker.once('spawn', () => { spawned += 1; });
    worker.on('exit', () => {});

    await settle();

    expect(spawned).toBe(0);
  });

  // A resume is the continuation path: her reply on a finished row. A refused
  // resume must not look like a running worker either.
  it('reports a refused resume the same way', async () => {
    const fake = fakeServer();
    fake.state.resumeFails = 'thread/resume: no rollout found for thread id';
    const worker = createCodexWorker({ server: fake.server, resumeThreadId: 'T-OLD' });
    const exits = [];
    const said = [];
    worker.on('exit', (c, s) => exits.push({ code: c, signal: s }));
    worker.stderr.on('data', (t) => said.push(String(t)));

    await settle();

    expect(fake.calls[0]).toMatchObject({ method: 'thread/resume', params: { threadId: 'T-OLD' } });
    expect(exits[0].code).not.toBe(0);
    expect(said.join('\n')).toMatch(/no rollout found/);
  });

  it('resumes the thread it was given rather than starting a new one', async () => {
    const fake = fakeServer();
    const worker = createCodexWorker({ server: fake.server, resumeThreadId: 'T-OLD' });
    worker.on('exit', () => {});
    await settle();

    expect(fake.calls.map((c) => c.method)).toEqual(['thread/resume', 'turn/start']);
    expect(worker.threadId).toBe('T-OLD');
  });
});

/* ===================== what a worker thread is told ====================== */

describe('the params a worker thread is started with', () => {
  // MEASURED: `thread/resume` fails `no rollout found` on an ephemeral thread,
  // and continuation-on-reply is most of what this app does.
  it('is never ephemeral, so her reply can reach the same worker', () => {
    expect(workerThreadParams({ cwd: '/tmp/p' }).ephemeral).toBe(false);
  });

  it('runs under the approval policy that actually raises cards', () => {
    const params = workerThreadParams({ cwd: '/tmp/p' });
    expect(params.approvalPolicy).toBe(WORKER_APPROVAL_POLICY);
    expect(params.sandbox).toBe(WORKER_SANDBOX);
    expect(params.cwd).toBe('/tmp/p');
  });

  it('carries the model and the instructions only when there are any', () => {
    const bare = workerThreadParams({ cwd: '/tmp/p' });
    expect(bare.model).toBeUndefined();
    expect(bare.developerInstructions).toBeUndefined();

    const full = workerThreadParams({ cwd: '/tmp/p', model: 'gpt-5.6-sol', instructions: 'her standing rules' });
    expect(full.model).toBe('gpt-5.6-sol');
    expect(full.developerInstructions).toBe('her standing rules');
  });

  // THE MEASUREMENT THIS EXISTS FOR. A bare start launched her `playwright` and
  // `context7`; naming each with `enabled: false` was the only thing that
  // stopped them.
  it('switches every one of her own MCP servers off, by name', () => {
    const params = workerThreadParams({ cwd: '/tmp/p', mcpServers: ['playwright', 'context7'] });
    expect(params.config.mcp_servers).toEqual({
      playwright: { enabled: false },
      context7: { enabled: false },
    });
  });

  // THE CASE THAT MUST NOT MATCH, and it is the one that was tried first: an
  // empty table is a deep MERGE and turned nothing off. So a worker on a Mac
  // with servers must never be sent one.
  it('does not send an empty table when she has servers, because that is a no-op', () => {
    const params = workerThreadParams({ cwd: '/tmp/p', mcpServers: ['playwright'] });
    expect(params.config.mcp_servers).not.toEqual({});
    // And null is refused outright by the server, so it is never sent either.
    expect(params.config.mcp_servers).not.toBeNull();
  });

  it('sends an empty override when she has no servers, because there is nothing to turn off', () => {
    expect(workerThreadParams({ cwd: '/tmp/p' }).config.mcp_servers).toEqual({});
    expect(mcpIsolation([])).toEqual({});
  });

  it('ignores anything in the list that is not a name', () => {
    expect(mcpIsolation(['playwright', '', null, 42, undefined])).toEqual({ playwright: { enabled: false } });
  });
});

describe('reading her MCP server names off the server own config', () => {
  it('takes the names out of a config/read result', () => {
    expect(mcpServerNames({
      config: { mcp_servers: { playwright: { command: 'npx' }, context7: { command: 'npx' } } },
      origins: {},
    })).toEqual(['playwright', 'context7']);
  });

  // A CONFIG WITH NO SERVERS IN IT IS THE ONLY "NO NAMES" THERE IS.
  //
  // Four other cases used to live here -- undefined, {}, a list, a string --
  // all answered [] on the reading that a read we cannot parse should degrade
  // to "turn nothing off". It degrades to the opposite: [] builds `{}`, and
  // `{}` is the deep merge the block above measures as a no-op, so every
  // unparseable read silently ran her whole toolbox inside a worker. They throw
  // now, and the rest of that rule is pinned in
  // tests/a-codex-worker-refuses-to-run-rather-than-inherit-her-mcp-servers.
  it.each([
    ['no servers configured', { config: {} }],
    ['an empty table', { config: { mcp_servers: {} } }],
  ])('answers no names for %s', (_what, read) => {
    expect(mcpServerNames(read)).toEqual([]);
  });

  it('refuses to answer at all for a shape it cannot take names out of', () => {
    expect(() => mcpServerNames({ config: { mcp_servers: 'playwright' } })).toThrow(/could not read which MCP servers/i);
  });
});

/* ==================== where codex put the transcript ===================== */

describe('finding the rollout one codex session wrote', () => {
  const rollouts = (...files) => {
    const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
    for (const [y, m, d, name] of files) {
      const dir = join(home, 'sessions', y, m, d);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), '{}\n');
    }
    return home;
  };
  const ID = '01a06882-1a46-7872-a189-f1de3d5c3761';
  const NEIGHBOUR = '01a068cb-384a-7eb1-a53d-fee287e14397';

  it('finds the file whose name ends in that id', () => {
    const home = rollouts(
      ['2026', '09', '03', `rollout-2026-09-03T22-22-32-${ID}.jsonl`],
      ['2026', '09', '03', `rollout-2026-09-03T23-42-23-${NEIGHBOUR}.jsonl`],
    );
    try {
      expect(codexTranscriptFile(ID, { home }))
        .toBe(join(home, 'sessions', '2026', '09', '03', `rollout-2026-09-03T22-22-32-${ID}.jsonl`));
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  // THE CASE THAT MUST NOT MATCH, and it is the expensive one. `includes(id)`
  // would match a neighbouring rollout, and handing `thread/resume` the wrong
  // thread resumes a stranger's conversation onto her row -- which is worse
  // than finding nothing, because finding nothing only briefs a stranger.
  it('does not match a neighbouring rollout from the same day', () => {
    const home = rollouts(['2026', '09', '03', `rollout-2026-09-03T23-42-23-${NEIGHBOUR}.jsonl`]);
    try {
      expect(codexTranscriptFile(ID, { home })).toBeNull();
      // Nor one whose id merely ENDS with the one we asked for.
      const near = rollouts(['2026', '09', '03', `rollout-2026-09-03T23-42-23-zz${ID}.jsonl`]);
      try { expect(codexTranscriptFile(ID, { home: near })).toBeNull(); }
      finally { rmSync(near, { recursive: true, force: true }); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('looks in the newest folders first and gives up rather than reading the lot', () => {
    const home = rollouts(
      ['2026', '01', '01', `rollout-2026-01-01T09-00-00-${ID}.jsonl`],
      ['2026', '09', '04', `rollout-2026-09-04T09-00-00-${NEIGHBOUR}.jsonl`],
      ['2026', '09', '03', `rollout-2026-09-03T09-00-00-${NEIGHBOUR}.jsonl`],
    );
    try {
      // Three day-folders exist; a bound of two never reaches January.
      expect(codexTranscriptFile(ID, { home, days: 2 })).toBeNull();
      expect(codexTranscriptFile(ID, { home, days: 60 })).toContain(join('2026', '01', '01'));
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it.each([
    ['no id at all', null],
    ['an empty id', ''],
    ['something that is not a string', 42],
  ])('answers nothing for %s rather than guessing', (_what, id) => {
    expect(codexTranscriptFile(id, { home: '/nonexistent' })).toBeNull();
  });

  it('answers nothing when there is no codex home, rather than throwing', () => {
    expect(codexTranscriptFile(ID, { home: join(tmpdir(), 'no-such-codex-home-at-all') })).toBeNull();
  });

  // A stray file or a folder Codex renames under us must not stop the walk or
  // reorder it: the tree is walked by DATE, so only dated names count.
  it('walks past a folder that is not a date', () => {
    const home = rollouts(['2026', '09', '03', `rollout-2026-09-03T22-22-32-${ID}.jsonl`]);
    mkdirSync(join(home, 'sessions', 'archive'), { recursive: true });
    try {
      expect(codexTranscriptFile(ID, { home })).toContain(`${ID}.jsonl`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
});

/* ============ and all of it against the real transport, once ============= */

// Everything above runs on a notepad in the client's shape. This block proves
// the same facade works over main/codex-app-server.mjs itself, so nothing here
// is only true of the notepad: a real JSON-RPC frame off a real stdout pipe
// reaches `event`, and a real `turn/completed` ends the worker.
describe('the same worker, over the real app-server client', () => {
  function fakeCodex() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const sent = [];
    const stdin = new EventEmitter();
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
      cb?.(null);
      return true;
    };
    stdin.end = () => {};
    child.stdin = stdin;
    child.kill = () => true;
    return {
      child,
      sent,
      say: (msg) => child.stdout.emit('data', Buffer.from(JSON.stringify(msg) + '\n')),
      idOf: (method) => sent.find((m) => m.method === method)?.id,
    };
  }

  it('starts a thread, streams its events and ends on the turn', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({
      server: client,
      threadParams: workerThreadParams({ cwd: '/tmp/product', mcpServers: ['playwright'] }),
      turnParams: { input: [{ type: 'text', text: 'the brief' }] },
    });
    const events = [];
    const exits = [];
    worker.on('event', (method, params) => events.push({ method, params }));
    worker.on('exit', (code, signal) => exits.push({ code, signal }));
    await settle();

    const start = codex.sent.find((m) => m.method === 'thread/start');
    expect(start.params.ephemeral).toBe(false);
    expect(start.params.config.mcp_servers).toEqual({ playwright: { enabled: false } });

    codex.say({ jsonrpc: '2.0', id: start.id, result: { thread: { id: 'T-REAL' } } });
    await settle();

    const turn = codex.sent.find((m) => m.method === 'turn/start');
    expect(turn.params).toMatchObject({ threadId: 'T-REAL', input: [{ type: 'text', text: 'the brief' }] });
    codex.say({ jsonrpc: '2.0', id: turn.id, result: { turn: { id: 'TURN-REAL', status: 'inProgress' } } });
    await settle();

    codex.say({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'T-REAL', delta: 'typing' } });
    expect(events.map((e) => e.method)).toContain('item/agentMessage/delta');

    codex.say({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-REAL', turn: { id: 'TURN-REAL', status: 'completed' } } });
    expect(exits).toEqual([{ code: 0, signal: null }]);
    expect(client.stats().threads).toBe(0);
  });

  it('sends a real turn/interrupt carrying both ids when we kill it', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, threadParams: workerThreadParams({ cwd: '/tmp/product' }) });
    const exits = [];
    worker.on('exit', (code, signal) => exits.push({ code, signal }));
    await settle();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-REAL' } } });
    await settle();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('turn/start'), result: { turn: { id: 'TURN-REAL', status: 'inProgress' } } });
    await settle();

    worker.kill();

    expect(codex.sent.find((m) => m.method === 'turn/interrupt').params)
      .toEqual({ threadId: 'T-REAL', turnId: 'TURN-REAL' });
    expect(exits).toEqual([{ code: 143, signal: 'SIGTERM' }]);
  });

  // The app-server dying under a worker is a real death: no signal, and the
  // tracing tail comes through so `troubleCause` has something to read.
  it('reports the app-server dying under it as a death, not as our kill', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, threadParams: workerThreadParams({ cwd: '/tmp/product' }) });
    const exits = [];
    const said = [];
    worker.on('exit', (code, signal) => exits.push({ code, signal }));
    worker.stderr.on('data', (t) => said.push(String(t)));
    await settle();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-REAL' } } });
    await settle();

    codex.child.stderr.emit('data', Buffer.from('Not inside a trusted directory\n'));
    codex.child.emit('exit', 1, null);
    await settle();

    expect(exits).toHaveLength(1);
    expect(exits[0].signal).toBeNull();
    expect(said.join('\n')).toMatch(/not inside a trusted directory/i);
  });
});
