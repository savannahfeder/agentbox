// A CODEX WORKER GETS HER STORE, OR IT DOES NOT RUN AT ALL.
//
// CLAUDE.md records what a worker with no store tools costs, and it is the
// most expensive incident in this file: 2026-08-05, "five sessions of analysis
// written to nowhere", because `sessionArgs` did not carry the grant and every
// store tool call was silently refused. The sessions ran, they thought, they
// finished, and nothing they did reached a row.
//
// The Codex harness landed with EXACTLY that hole. `workerThreadParams` turned
// her own MCP servers off by name and added nothing back, so a Codex worker
// held no store server at all: it could not claim, checkpoint or finish
// anything. This file is the fix, and the shape of the fix is decided by four
// things measured on this Mac on 2026-09-04 against codex-cli 0.148.0, by
// driving a real `codex app-server` (the probes are in the slice's notes):
//
// 1. A THREAD-SCOPED `mcp_servers` ENTRY REALLY DOES START. `thread/start`
//    with `config.mcp_servers[nameSlug] = {command, args, env}` produced
//    `mcpServer/startupStatus/updated` name=agentbox status=starting and then
//    status=ready, while `playwright` and `context7` -- both switched off by
//    name in the SAME table -- produced nothing at all. So adding one server
//    beside the `enabled: false` entries does not undo the isolation. Only
//    `codex_apps`, Codex's own built-in, starts either way.
//
// 2. THE `env` BLOCK IS HOW THE STORE SERVER IS TOLD WHERE THE STORE IS, and
//    it is the ONLY way. The probe server dumped its own environment: 14 keys,
//    being the five we named plus HOME, LANG, LOGNAME, PATH, SHELL, TERM,
//    TMPDIR, USER and __CF_USER_TEXT_ENCODING. Nothing else of the app-server's
//    environment reaches it. A Claude Code worker gets STORE_ACCOUNT_ID and
//    ASTRAL_HOME on the MCP server and ZERO_PRODUCT / ZERO_ITEM inherited
//    from its own process (supervisor.mjs, `mcpServers` and the spawn env);
//    there is no per-item process here, so all four are named on the server.
//
// 3. A STORE SERVER THAT FAILS TO START FAILS IN SILENCE. Pointed at a command
//    that does not exist, `thread/start` still RESOLVED and the turn was free
//    to run; the only sign was a notification, "status":"failed", with
//    "MCP client for `agentbox` failed to start: MCP startup failed:
//    handshaking with MCP server failed: connection closed: initialize
//    response". Codex then retried it and it failed again. A worker whose turn
//    starts anyway is 2026-08-05 happening a second time on a second engine, so
//    the turn now WAITS for `ready` and the run dies loudly without it.
//
// 4. AND THE HALF NOBODY HAD LOOKED AT: `thread/resume` WITHOUT THE CONFIG
//    BRINGS HER OWN SERVERS BACK. Measured on one thread, three connections.
//    Resumed WITH the override: the store server started and reported ready, hers
//    stayed off. Resumed with `{threadId}` alone -- which is what the harness
//    did -- `playwright` and `context7` both started and reported ready, and
//    there was no store server on the thread at all. Two npx processes of hers
//    were left running on this Mac by that probe and had to be killed by hand.
//    Continuations are most of what this app does, so the isolation the first
//    slice measured held only for a row's first turn.
//
// The last block is the case that must NOT match: an install with no store MCP
// configured, which is every downloaded copy of Agentbox (`storeMcpCommand` is
// null in main/config.mjs). There is nothing to wait for there, so the worker
// must start exactly as it does today rather than hang on a server nobody
// asked for.
//
// AND THE WHOLE CHAIN WAS RUN AGAINST THE REAL BINARY BEFORE THIS WAS CALLED
// DONE, because a scripted app-server can only prove what the script says. The
// shipping `createCodexAppServer` + `createCodexWorker` + `workerThreadParams`,
// driving `codex app-server` 0.148.0 on this Mac, twice:
//
//   a store server that works    -> ready, the env block delivered to it, the
//                                   worker emitted `spawn`, the turn ran and
//                                   the worker exited 0.
//   a store server that does not -> no `spawn`, exit 1, and on stderr "the
//                                   the store server did not start (MCP
//                                   client for `agentbox` failed to start: MCP
//                                   startup failed: No such file or directory
//                                   (os error 2))".

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { storeRootEnv } from '../main/store/home.mjs';
import { join } from 'node:path';

// The one seam, the same one tests/the-supervisor-can-run-a-codex-worker uses:
// `main/supervisor.mjs` imports `spawn` at module scope, so this is where a
// test can stand between the app's choice of executable and a real process.
// The app-server it hands back answers its own protocol, so everything from
// `spawnWorker` down to the wire is the shipping code.
const spawns = vi.hoisted(() => []);
const appServers = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');

  const scriptedAppServer = () => {
    const child = new Emitter();
    child.stdout = new Emitter();
    child.stderr = new Emitter();
    const sent = [];
    const stdin = new Emitter();
    const say = (msg) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`));
    const server = {
      child,
      sent,
      say,
      mcpServers: { playwright: { command: 'npx' }, context7: { command: 'npx' } },
      threadId: 'T-CODEX',
      turnId: 'TURN-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
      // Every server request the app answered, so a refusal can be read back.
      sentFor: (method) => sent.filter((m) => m.method === method),
      /** One `mcpServer/startupStatus/updated`, as the real server frames it. */
      startup: (name, status, error = null) => say({
        jsonrpc: '2.0',
        method: 'mcpServer/startupStatus/updated',
        params: { threadId: server.threadId, name, status, error, failureReason: null },
      }),
    };
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        sent.push(msg);
        if (msg.method === 'initialize') say({ jsonrpc: '2.0', id: msg.id, result: { userAgent: 'agentbox/test' } });
        if (msg.method === 'config/read') say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: server.mcpServers }, origins: {} } });
        if (msg.method === 'thread/start') {
          say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: server.threadId } } });
          say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: server.threadId } } });
        }
        if (msg.method === 'thread/resume') say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: server.threadId } } });
        if (msg.method === 'turn/start') say({ jsonrpc: '2.0', id: msg.id, result: { turn: { id: server.turnId, status: 'inProgress' } } });
        if (msg.method === 'turn/interrupt') say({ jsonrpc: '2.0', id: msg.id, result: {} });
      }
      cb?.(null);
      return true;
    };
    stdin.end = () => {};
    child.stdin = stdin;
    child.kill = () => true;
    return server;
  };

  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      if (Array.isArray(args) && args[0] === 'app-server') {
        const server = scriptedAppServer();
        appServers.push(server);
        return server.child;
      }
      return { stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

import { Supervisor } from '../main/supervisor.mjs';
import { workerThreadParams, resumeThreadParams } from '../main/codex-session.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
// The store server answers to the app's own name since 2026-09-22. This file
// spelled it 'agentbox' throughout, which is the name it carried while it lived
// in another product's repo.
import { nameSlug } from '../shared/product-name.mjs';

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';
const ACCOUNT = '00000000-82fb-4df2-9868-0b1c00000000';
const dirs = [];

/** Everything the app-server chain hangs off resolves on microtasks and one
 *  immediate; several rounds cover start, the readiness wait, and the turn. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

function build({ store = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-store-'));
  dirs.push(dir);
  // `storeMcpCommand` is only honoured when the file is really there
  // (Supervisor.storeMcpCommand), so a machine that lost the launcher does not
  // hand its workers a server that cannot run.
  const launcher = join(dir, `${nameSlug}-mcp.sh`);
  if (store) writeFileSync(launcher, '#!/bin/sh\nexec store-mcp\n');
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      accountId: ACCOUNT,
      claudeBin: CLAUDE_BIN,
      codexBin: CODEX_BIN,
      // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
      // which engine a row runs on; this says the second engine may be run at
      // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
      // it gives Codex a single slot. Opening one and not the other describes a
      // Mac that cannot exist: in the app both come off this same value.
      engineChoice: '2026-09-04T00:00:00Z',
      storeMcpCommand: store ? launcher : null,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
      // Her fifteen minutes are far too long to wait for in a test, and the
      // deadline is the thing under test, so it is a knob rather than a const.
      // Positive readiness tests must not race a 40ms deadline under a full
      // suite (one false failure observed September 18). Timeout cases opt in.
      codexStoreReadyMs: 5_000,
    },
    {
      listItems: () => [],
      listProducts: () => [product],
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  sup.launcher = launcher;
  sup.dir = dir;
  return sup;
}

const codexRow = () => {
  const item = foldWorkItems([
    JSON.parse(JSON.stringify({
      id: 'w-250cd74811',
      ts: 1,
      source: 'founder',
      patch: { title: 'try the second engine', status: 'open', engine: 'codex' },
    })),
  ]).get('w-250cd74811');
  return { ...item, product: 'agentbox' };
};

/** The gate is closed and nothing routes to Codex; `_engineFor` is the single
 *  line that decides, so overriding it is overriding exactly the decision. */
const onCodex = (sup) => { sup._engineFor = () => 'codex'; return sup; };

// A session the team app started carries AGENTBOX_PERSON_ID, and the
// supervisor hands it on to the store server, so the env below gained a fifth
// key and went red on every run from inside the team app (2026-10-01). These
// tests are about a worker nobody is signed in on; the shell's value comes back
// afterwards.
const shellPersonId = process.env.AGENTBOX_PERSON_ID;
beforeEach(() => { spawns.length = 0; appServers.length = 0; delete process.env.AGENTBOX_PERSON_ID; });
afterAll(() => {
  if (shellPersonId !== undefined) process.env.AGENTBOX_PERSON_ID = shellPersonId;
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ==================== the table a worker thread starts with ================ */

describe('the MCP servers a codex worker thread is given', () => {
  it('adds her store server while every server of her own stays off', () => {
    const params = workerThreadParams({
      cwd: '/repo',
      mcpServers: ['playwright', 'context7'],
      storeServer: { name: nameSlug, command: '/bin/store-mcp', env: storeRootEnv('/Zero') },
    });

    expect(params.config.mcp_servers).toEqual({
      playwright: { enabled: false },
      context7: { enabled: false },
      [nameSlug]: { command: '/bin/store-mcp', env: storeRootEnv('/Zero') },
    });
  });

  // THE CASE THAT MUST NOT MATCH. A server of hers sharing the store's name
  // would otherwise be switched off by her half of the table and switched on
  // again by ours, or the other way round depending on key order. Ours is
  // written last and wins, deliberately: the store is not optional and hers is.
  it('gives the store the last word when a server of hers shares its name', () => {
    const params = workerThreadParams({
      cwd: '/repo',
      mcpServers: [nameSlug, 'playwright'],
      storeServer: { name: nameSlug, command: '/bin/store-mcp', env: {} },
    });

    expect(params.config.mcp_servers[nameSlug]).toEqual({ command: '/bin/store-mcp', env: {} });
    expect(params.config.mcp_servers.playwright).toEqual({ enabled: false });
  });

  it('turns everything off and adds nothing when there is no store server', () => {
    const params = workerThreadParams({ cwd: '/repo', mcpServers: ['playwright'] });
    expect(params.config.mcp_servers).toEqual({ playwright: { enabled: false } });
  });

  // Agentbox's own launcher takes no arguments -- `storeMcpCommand` is one
  // executable, the same thing the Claude path passes -- and this is here
  // because the first version dropped a caller's argv in silence. Measured
  // against a real app-server while writing this: the server process came up,
  // sat on stdin waiting for a script it was never given, never handshook, and
  // the only symptom was a run that stopped saying the store never reported
  // ready. A field that is quietly discarded is worse than one that is refused.
  it('carries the store command arguments when there are any, and no key when there are none', () => {
    const withArgs = workerThreadParams({
      cwd: '/repo',
      storeServer: { name: nameSlug, command:'/usr/bin/node', args: ['/bin/store-mcp.mjs'], env: {} },
    });
    expect(withArgs.config.mcp_servers[nameSlug]).toEqual({
      command: '/usr/bin/node', args: ['/bin/store-mcp.mjs'], env: {},
    });

    const without = workerThreadParams({
      cwd: '/repo',
      storeServer: { name: nameSlug, command:'/bin/store-mcp', env: {}, args: [] },
    });
    expect('args' in without.config.mcp_servers[nameSlug]).toBe(false);
  });

  // Measured: `thread/resume` takes cwd, sandbox, approvalPolicy, config and
  // developerInstructions, and has no `ephemeral` at all. Sending a key the
  // method does not take is how a resume gets refused, which on this path is
  // every reply she writes.
  it('carries the same table into a resume, without the key resume does not take', () => {
    const start = workerThreadParams({
      cwd: '/repo',
      mcpServers: ['playwright'],
      storeServer: { name: nameSlug, command:'/bin/store-mcp', env: {} },
    });
    const resume = resumeThreadParams('T-1', start);

    expect(resume.threadId).toBe('T-1');
    expect(resume.config).toEqual(start.config);
    expect(resume.cwd).toBe('/repo');
    expect(resume.sandbox).toBe(start.sandbox);
    expect(resume.approvalPolicy).toBe(start.approvalPolicy);
    expect('ephemeral' in resume).toBe(false);
  });
});

/* ======================== the whole path, end to end ====================== */

describe('a codex worker that has her store', () => {
  it('names the store server, its command, and the four things it needs to find her store', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    const servers = appServers[0].paramsOf('thread/start').config.mcp_servers;
    expect(servers.playwright).toEqual({ enabled: false });
    expect(servers.context7).toEqual({ enabled: false });
    expect(servers[nameSlug].command).toBe(sup.launcher);
    // The store root goes under EVERY name this app has had, because a store
    // server or a script written against an older one is still out there
    // reading it (main/store/home.mjs).
    expect(servers[nameSlug].env).toEqual({
      STORE_ACCOUNT_ID: ACCOUNT,
      ...storeRootEnv(sup.dir),
      ZERO_PRODUCT: 'agentbox',
      ZERO_ITEM: 'w-250cd74811',
    });
  });

  // The turn is the thing that spends her subscription and writes to her repo,
  // so it is the thing that waits.
  it('does not start the turn until the store server says it is ready', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    expect(appServers[0].paramsOf('turn/start')).toBeUndefined();

    appServers[0].startup(nameSlug,'ready');
    await settle();

    expect(appServers[0].paramsOf('turn/start').threadId).toBe('T-CODEX');
    expect(sup.sessions.get('w-250cd74811')).toBeTruthy();
  });

  // A `ready` arrives more than once on a live thread (measured: the store server
  // reported ready again during the turn), so the wait must settle once.
  it('starts exactly one turn however many times ready arrives', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();
    for (let i = 0; i < 3; i += 1) appServers[0].startup(nameSlug,'ready');
    await settle();

    expect(appServers[0].sentFor('turn/start')).toHaveLength(1);
  });

  // Codex retries a failed server, so one `failed` is not the verdict; the
  // deadline is. What must never happen is the turn running anyway.
  it('recovers when the server fails once and then comes up', async () => {
    const sup = onCodex(build());
    sup.config.codexStoreReadyMs = 5_000;
    sup.spawnWorker(codexRow());
    await settle();

    appServers[0].startup(nameSlug, 'failed',`MCP client for \`${nameSlug}\` failed to start`);
    await settle();
    expect(appServers[0].paramsOf('turn/start')).toBeUndefined();

    appServers[0].startup(nameSlug,'ready');
    await settle();
    expect(appServers[0].paramsOf('turn/start')).toBeTruthy();
  });
});

describe('a codex worker whose store server never starts', () => {
  // The session is deleted from the map when the run exits, so the tail is
  // taken by reference while the run is still alive; it is the same array the
  // exit handler goes on writing to.
  const died = async (sup) => {
    sup.config.codexStoreReadyMs = 40;
    sup.spawnWorker(codexRow());
    await settle();
    const session = sup.sessions.get('w-250cd74811');
    appServers[0].startup(nameSlug, 'failed',`MCP client for \`${nameSlug}\` failed to start: connection closed: initialize response`);
    // The deadline is 40ms and its timer is a real one.
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    await settle();
    return session;
  };

  it('never runs the turn', async () => {
    const sup = onCodex(build());
    await died(sup);
    expect(appServers[0].paramsOf('turn/start')).toBeUndefined();
  });

  // Loud, on the one pipe a dead run is read from: `sayTheRunDied` classifies
  // a run by the `stderr:` lines on the session tail, so a failure that never
  // reaches it is a failure filed as 'unknown'.
  it('says the store is missing, in words that name the server and the reason', async () => {
    const sup = onCodex(build());
    const session = await died(sup);
    const said = session.tail.join('\n');

    expect(said).toContain(nameSlug);
    expect(said).toContain('store');
    expect(said).toContain('connection closed: initialize response');
  });

  it('ends the session rather than leaving a worker running with no store', async () => {
    const sup = onCodex(build());
    const session = await died(sup);
    expect(sup.sessions.get('w-250cd74811')).toBeUndefined();
    expect(session.tail.join('\n')).toContain('session exited (1)');
  });
});

/* A personal task was the case that must not match here: it never learned the
   store existed, on either engine. Personal projects are deleted
   (w-d19d6d387c, 2026-09-22), and an install with no store MCP, below, is the
   case that stands. */

describe('an install with no store MCP at all', () => {
  // Agentbox ships `storeMcpCommand: null`, so this is every downloaded copy.
  // There is nothing to wait for, and a worker that waited would never run.
  it('starts the turn straight away and adds no store server', async () => {
    const sup = onCodex(build({ store: false }));
    sup.spawnWorker(codexRow());
    await settle();

    const servers = appServers[0].paramsOf('thread/start').config.mcp_servers;
    expect(servers).toEqual({ playwright: { enabled: false }, context7: { enabled: false } });
    expect(appServers[0].paramsOf('turn/start')).toBeTruthy();
  });
});
