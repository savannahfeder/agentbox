// A CODEX WORKER REFUSES TO RUN RATHER THAN INHERIT HER OWN MCP SERVERS.
//
// The slice that landed the second engine turned every failure of the
// isolation read into an EMPTY LIST OF NAMES, and an empty list is
// `{mcp_servers: {}}`, which that same slice had already measured as a deep
// MERGE that disables nothing:
//
//   `config: { mcp_servers: {} }` -> all three of her servers still started.
//
// So one failed `config/read` did not degrade to "turn nothing off". It
// degraded to "start every one of her personal MCP servers inside a headless
// worker", silently, with nothing on her screen saying it happened. On this
// Mac that is two `npx` processes per spawn (`playwright` and `context7`, read
// out of her `~/.codex/config.toml`), and the previous slice's own probe had to
// kill a pair of them by hand after resuming a thread without the table.
//
// A worker that did nothing is a worker she can see; a worker that ran her
// whole toolbox is not.
//
// AND THE LIST IS READ AGAIN ON EVERY START. It used to be read once per
// app-server and cached for the life of the process, so a server she added at
// lunchtime was never switched off for the rest of the day. Measured on this
// Mac 2026-09-04, codex-cli 0.148.0, with a table naming a server that is NOT
// in her config:
//
//   config: { mcp_servers: { codex_apps: { enabled: false } } }
//     -> thread/start REFUSED: -32600 "failed to load configuration: invalid
//        transport in `mcp_servers.codex_apps`"
//
// which is the same fact read from the other end: an `enabled: false` entry is
// a MERGE onto a server that already exists in her config, so a stale name is
// not merely useless, it refuses the thread outright. A list read at the moment
// of the start is the only one that is true at the moment of the start.
//
// THE SAME PROBE SETTLES `codex_apps`, WHICH IS THE ONE SERVER THIS CANNOT TURN
// OFF. Measured the same minute, thread start only and no turn: with her two
// named off and `codex_apps` left alone, `mcpServer/startupStatus/updated`
// reported `codex_apps=starting` then `codex_apps=ready` and nothing else at
// all. Codex's own built-in app connector is not in her config, has no
// transport to merge onto, and naming it is the refusal above. So it stays on,
// deliberately, and this file pins that the table never names it -- because the
// version of this code that "disabled" it would have refused every Codex thread
// on the machine.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawns = vi.hoisted(() => []);
const appServers = vi.hoisted(() => []);
// `initialize` is sent inside the same synchronous call that makes the
// transport, so a test cannot reach in and break it afterwards. This is what
// the next app-server is born with.
const armed = vi.hoisted(() => ({ breakInitialize: false }));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');

  /**
   * A `codex app-server` that answers its own protocol, and that a test can
   * break at exactly one step. Not a stub: the framing, the JSON-RPC and the
   * routing are all the shipping transport.
   */
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
      /** null, 'error' (a JSON-RPC error frame) or 'unreadable' (a shape we
       *  cannot take names out of). */
      breakConfigRead: null,
      breakInitialize: armed.breakInitialize,
      threadId: 'T-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
      allParamsOf: (method) => sent.filter((m) => m.method === method).map((m) => m.params),
    };
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        sent.push(msg);
        if (msg.method === 'initialize') {
          if (server.breakInitialize) say({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'the app-server would not shake hands' } });
          else say({ jsonrpc: '2.0', id: msg.id, result: { userAgent: 'agentbox/test' } });
        }
        if (msg.method === 'config/read') {
          if (server.breakConfigRead === 'error') say({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'could not read config.toml' } });
          else if (server.breakConfigRead === 'unreadable') say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: 'playwright' } } });
          else say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: server.mcpServers }, origins: {} } });
        }
        if (msg.method === 'thread/start') {
          say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: server.threadId } } });
          say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: server.threadId } } });
        }
        if (msg.method === 'turn/start') say({ jsonrpc: '2.0', id: msg.id, result: { turn: { id: 'TURN-CODEX', status: 'inProgress' } } });
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

vi.mock('../main/account-tooling.mjs', async (importActual) => ({
  ...(await importActual()),
  linkAccountTooling: () => null,
}));

import { Supervisor } from '../main/supervisor.mjs';
import { mcpIsolation, mcpServerNames } from '../main/codex-session.mjs';

const CODEX_BIN = '/nonexistent/codex/codex';
const dirs = [];

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'codex-isolation-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: CODEX_BIN,
      // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
      // which engine a row runs on; this says the second engine may be run at
      // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
      // it gives Codex a single slot. Opening one and not the other describes a
      // Mac that cannot exist: in the app both come off this same value.
      engineChoice: '2026-09-04T00:00:00Z',
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
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
  sup._engineFor = () => 'codex';
  return sup;
}

const row = (id = 'w-250cd74811') => ({ id, product: 'agentbox', status: 'open', title: 'try the second engine' });

beforeEach(() => { spawns.length = 0; appServers.length = 0; armed.breakInitialize = false; });
afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ================== the names, and what "we could not tell" means ========= */

describe('reading which servers a thread has to switch off', () => {
  it('takes the names out of a config/read result', () => {
    expect(mcpServerNames({
      config: { mcp_servers: { playwright: { command: 'npx' }, context7: { command: 'npx' } } },
      origins: {},
    })).toEqual(['playwright', 'context7']);
  });

  // A machine with no servers in its config really does want an empty table,
  // and that empty table really is a no-op -- correctly, because there is
  // nothing of hers to disable.
  it.each([
    ['an empty table', { config: { mcp_servers: {} } }],
    ['no mcp_servers key at all', { config: { model: 'gpt-5' } }],
    ['a null mcp_servers', { config: { mcp_servers: null } }],
  ])('answers no names for %s, because there is nothing of hers there', (_what, read) => {
    expect(mcpServerNames(read)).toEqual([]);
  });

  // THE CASE THAT USED TO BE ANSWERED [] AND IS THE WHOLE BUG. A shape we
  // cannot take names out of is a shape we know nothing from, and answering it
  // with the empty table starts everything she has.
  it.each([
    ['nothing at all', undefined],
    ['null', null],
    ['an empty result', {}],
    ['a result with no config', { origins: {} }],
    ['a config that is not an object', { config: 'gpt-5' }],
    ['a list where a map was expected', { config: { mcp_servers: ['playwright'] } }],
    ['a string', { config: { mcp_servers: 'playwright' } }],
  ])('refuses to answer at all for %s', (_what, read) => {
    expect(() => mcpServerNames(read)).toThrow(/could not read which MCP servers/i);
  });
});

/* =========================== building the table ========================== */

describe('the table one worker thread is started with', () => {
  it('names each of her servers with enabled false', () => {
    expect(mcpIsolation(['playwright', 'context7'])).toEqual({
      playwright: { enabled: false },
      context7: { enabled: false },
    });
  });

  // A SERVER CALLED `__proto__` IS A SERVER, and a plain `{}` cannot hold one:
  // the assignment reaches Object.prototype's setter and the key is silently
  // not there, so the one server named after the thing that hides it would be
  // the one server left running.
  it('switches off a server named __proto__ like any other', () => {
    const table = mcpIsolation(['__proto__', 'playwright']);
    expect(Object.keys(table).sort()).toEqual(['__proto__', 'playwright']);
    expect(table.__proto__).toEqual({ enabled: false });
    expect(JSON.parse(JSON.stringify(table)).__proto__).toEqual({ enabled: false });
  });

  // THE CASE THAT MUST NOT MATCH, and it is measured rather than reasoned: an
  // entry for `codex_apps` is not a disable, it is a thread/start that fails
  // with "invalid transport in `mcp_servers.codex_apps`". See the header.
  it('never names codex_apps, because naming it refuses the whole thread', () => {
    const table = mcpIsolation(['playwright', 'context7'], { name: 'agentbox', command: '/bin/store' });
    expect(Object.keys(table)).not.toContain('codex_apps');
  });

  it('ignores anything in the list that is not a name', () => {
    expect(mcpIsolation(['playwright', '', null, 42, undefined])).toEqual({ playwright: { enabled: false } });
  });
});

/* ==================== and the worker stops rather than runs =============== */

describe('a worker whose isolation list could not be read', () => {
  it.each([
    ['config/read answered with an error', (s) => { s.breakConfigRead = 'error'; }, null],
    ['config/read answered with a shape we cannot read', (s) => { s.breakConfigRead = 'unreadable'; }, null],
    ['initialize itself was refused', null, () => { armed.breakInitialize = true; }],
  ])('never starts a thread when %s', async (_what, breakIt, arm) => {
    const sup = build();
    arm?.();
    // The app-server is made before the worker is, so a break that is not armed
    // at birth is set by reaching in, then the worker is spawned for real.
    sup._codexServer();
    breakIt?.(appServers[0]);

    sup.spawnWorker(row());
    await settle();

    expect(appServers[0].sent.filter((m) => m.method === 'thread/start')).toHaveLength(0);
    expect(appServers[0].sent.filter((m) => m.method === 'turn/start')).toHaveLength(0);
  });

  it('says why on the pipe the run is diagnosed from, and ends', async () => {
    const sup = build();
    sup._codexServer();
    appServers[0].breakConfigRead = 'error';

    sup.spawnWorker(row());
    await settle();

    // The session is reaped by its own exit handler, so what is left to read is
    // what it said on the way out.
    expect(sup.sessions.has('w-250cd74811')).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: a healthy read still starts a thread, with
  // her two servers off.
  it('starts the thread as usual when the read worked', async () => {
    const sup = build();
    sup.spawnWorker(row());
    await settle();

    expect(appServers[0].paramsOf('thread/start').config.mcp_servers).toEqual({
      playwright: { enabled: false },
      context7: { enabled: false },
    });
  });
});

describe('the list is read again for every start, not once for the process', () => {
  it('switches off a server she added between two spawns', async () => {
    const sup = build();
    sup.spawnWorker(row('w-one'));
    await settle();

    // She adds one at lunchtime. The app-server is the same process.
    appServers[0].mcpServers = { ...appServers[0].mcpServers, linear: { command: 'npx' } };
    sup.spawnWorker(row('w-two'));
    await settle();

    expect(appServers).toHaveLength(1);
    const tables = appServers[0].allParamsOf('thread/start').map((p) => Object.keys(p.config.mcp_servers).sort());
    expect(tables[0]).toEqual(['context7', 'playwright']);
    expect(tables[1]).toEqual(['context7', 'linear', 'playwright']);
  });

  it('asks the server again rather than remembering the first answer', async () => {
    const sup = build();
    sup.spawnWorker(row('w-one'));
    await settle();
    sup.spawnWorker(row('w-two'));
    await settle();

    expect(appServers[0].sent.filter((m) => m.method === 'config/read')).toHaveLength(2);
    // And the handshake is still done exactly once for the process.
    expect(appServers[0].sent.filter((m) => m.method === 'initialize')).toHaveLength(1);
  });
});
