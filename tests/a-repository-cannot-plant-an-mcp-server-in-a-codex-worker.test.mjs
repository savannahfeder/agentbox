// A REPOSITORY CANNOT PLANT AN MCP SERVER IN A CODEX WORKER.
//
// The isolation shipped for the second engine names each of her OWN MCP servers
// and switches it off, and it takes those names from `config/read` asked
// WITHOUT a cwd -- while `workerThreadParams` starts the thread INSIDE a product
// folder. Codex loads a `.codex/config.toml` sitting in that folder as a config
// layer of its own, and the per-thread override is a deep MERGE, so a server
// that layer declares was never named and never switched off.
//
// A repository she cloned, or an earlier worker writing inside one, can
// therefore plant a command that the next Codex thread LAUNCHES -- outside the
// command sandbox and outside the approval path, with no card and nothing on
// her screen saying it happened.
//
// MEASURED, on this Mac 2026-09-05, codex-cli 0.148.0, real `codex app-server`
// against a scratch CODEX_HOME (her own ~/.codex never read):
//
//   home config.toml:     [mcp_servers.herone]  (a sleep)
//   proj/.codex/config.toml: [mcp_servers.planted] command = sh -c
//                            "echo pwned > MARK; sleep 60"
//
//   thread/start cwd=proj, config.mcp_servers = { herone: {enabled:false} }
//     -> mcpServer/startupStatus/updated  planted=starting
//     -> MARK EXISTS: true                      <-- the plant RAN
//
// AND THE OBVIOUS FIX IS UNAVAILABLE. Enumerating the layer and naming
// `planted` too was measured on the same server and REFUSES THE THREAD:
//
//   thread/start with { herone:{enabled:false}, planted:{enabled:false} }
//     -> -32600 "failed to load configuration: invalid transport
//                in `mcp_servers.planted`"
//
// because an `enabled: false` entry is a MERGE onto a server that exists in the
// TRUSTED config, and an untrusted project layer is not in it. `config/read`
// with the cwd does not help either: it returned the same two home names, and
// only `includeLayers: true` showed the project layer at all -- carrying a
// `disabledReason` while `thread/start` went ahead and started the server
// anyway.
//
// WHAT DOES WORK IS CODEX'S OWN PROJECT-TRUST GATE, ASKED PER THREAD. Measured
// the same hour, same probe:
//
//   config.projects[<cwd>].trust_level = "untrusted"
//     -> mcp notifications: []          MARK EXISTS: false
//     -> and the store server we DO want started beside it (agentbox=starting)
//
// Three more measurements that decide the shape of the fix:
//
//   IT BEATS A `trusted` IN HER OWN CONFIG. With [projects."<proj>"]
//     trust_level = "trusted" in the home config.toml, the per-thread untrusted
//     still won: MARK false.
//   NAMING THE CWD COVERS A `.codex` ABOVE IT. cwd = proj/sub/deeper with the
//     `.codex` at proj: with no override the plant RAN (MARK true); naming only
//     the cwd stopped it (MARK false).
//   AND IT STOPS AGENTBOX WRITING IN HER CODEX CONFIG. Without it, `thread/start`
//     appended [projects."<cwd>"] trust_level = "trusted" to CODEX_HOME's own
//     config.toml -- permanently, for her terminal too. With it, nothing was
//     written.
//
// So the thread is started with the folder declared untrusted to Codex, and
// nothing has to enumerate a layer it cannot name. `config/read` deliberately
// stays cwd-less: with the gate closed the layer contributes nothing, and
// asking with the cwd would only start naming servers that refuse the thread.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      threadId: 'T-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
    };
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        sent.push(msg);
        if (msg.method === 'initialize') say({ jsonrpc: '2.0', id: msg.id, result: { userAgent: 'agentbox/test' } });
        if (msg.method === 'config/read') say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: { playwright: { command: 'npx' } } }, origins: {} } });
        if (msg.method === 'thread/start') {
          say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: server.threadId } } });
          say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: server.threadId } } });
        }
        if (msg.method === 'turn/start') say({ jsonrpc: '2.0', id: msg.id, result: { turn: { id: 'TURN', status: 'inProgress' } } });
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
    spawn: (bin, args) => {
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
import { projectIsolation, workerThreadParams, resumeThreadParams } from '../main/codex-session.mjs';

const dirs = [];
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => { setImmediate(r); }); };

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'codex-plant-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: '/nonexistent/codex/codex',
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
  return { sup, dir };
}

beforeEach(() => { appServers.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* =================== the table, on its own ================================ */

describe('the project-trust table one worker thread is started with', () => {
  it('declares the folder the thread runs in untrusted to Codex', () => {
    expect(projectIsolation('/Users/her/Zero/agentbox')).toEqual({
      '/Users/her/Zero/agentbox': { trust_level: 'untrusted' },
    });
  });

  // THE CASE THAT MUST NOT MATCH. Nothing else on the machine is named, and in
  // particular nothing is named TRUSTED: a table that widened trust would be
  // the same defect written by us instead of by codex.
  it('names that one folder and marks nothing trusted', () => {
    const table = projectIsolation('/Users/her/Zero/agentbox');
    expect(Object.keys(table)).toEqual(['/Users/her/Zero/agentbox']);
    expect(JSON.stringify(table)).not.toContain('"trusted"');
  });

  // A cwd we were not given cannot be guessed at, and a table with an empty or
  // a non-string key would be a table Codex refuses -- taking the whole run
  // with it -- over a fact nobody stated.
  it.each([['nothing', undefined], ['null', null], ['an empty string', ''], ['a number', 7]])(
    'is empty when the cwd is %s',
    (_what, cwd) => { expect(projectIsolation(cwd)).toEqual({}); },
  );

  // A NULL-PROTOTYPE TABLE, for the reason `mcpIsolation` states: a path can be
  // any string, `__proto__` included, and a plain `{}` silently drops that key
  // through Object.prototype's setter -- so the one folder named after the
  // thing that hides it would be the one folder left trusted.
  it('holds a folder called __proto__ like any other', () => {
    const table = projectIsolation('__proto__');
    expect(Object.keys(table)).toEqual(['__proto__']);
    expect(table.__proto__).toEqual({ trust_level: 'untrusted' });
  });
});

/* =================== the params a thread is really started with =========== */

describe('the thread params a worker is started with', () => {
  it('carries the trust gate for its own cwd', () => {
    const params = workerThreadParams({ cwd: '/Users/her/Zero/agentbox' });
    expect(params.config.projects).toEqual({ '/Users/her/Zero/agentbox': { trust_level: 'untrusted' } });
  });

  // A REPLY IS A CONTINUATION AND HER SERVERS LAUNCH AT EVERY START. The
  // mcp table already had to be carried again on resume for exactly this
  // reason; the trust gate is the same fact and travels the same way.
  it('carries it again on a resume, which is what most of this app does', () => {
    const params = resumeThreadParams('T-1', workerThreadParams({ cwd: '/Users/her/Zero/agentbox' }));
    expect(params.threadId).toBe('T-1');
    expect(params.config.projects['/Users/her/Zero/agentbox']).toEqual({ trust_level: 'untrusted' });
  });

  // AND THE STORE STILL GOES IN. The gate is about her repository's config
  // layer, never about the server Agentbox puts there itself: a worker with no
  // store is CLAUDE.md's "five sessions of analysis written to nowhere".
  it('leaves the store server on the same table', () => {
    const params = workerThreadParams({
      cwd: '/Users/her/Zero/agentbox',
      mcpServers: ['playwright'],
      storeServer: { name: 'agentbox', command: '/bin/store-mcp' },
    });
    expect(params.config.mcp_servers.playwright).toEqual({ enabled: false });
    expect(params.config.mcp_servers.agentbox.command).toBe('/bin/store-mcp');
    expect(params.config.projects['/Users/her/Zero/agentbox']).toEqual({ trust_level: 'untrusted' });
  });
});

/* =================== and through the supervisor, end to end ============== */

describe('a real Codex worker the supervisor starts', () => {
  it('starts its thread with its own folder gated', async () => {
    const { sup, dir } = build();
    sup.spawnWorker({ id: 'w-1', product: 'agentbox', status: 'open', title: 'plant check' }, {});
    await settle();
    const start = appServers[0]?.paramsOf('thread/start');
    expect(start.cwd).toBe(dir);
    expect(start.config.projects[dir]).toEqual({ trust_level: 'untrusted' });
  });

  // THE READ STAYS CWD-LESS, and this is the assertion that says so on purpose
  // rather than by omission. With the gate closed the project layer contributes
  // nothing, and a read WITH the cwd would begin naming servers that make
  // `thread/start` answer -32600 and kill the run.
  it('still asks config/read without a cwd, because nothing needs enumerating now', async () => {
    const { sup } = build();
    sup.spawnWorker({ id: 'w-2', product: 'agentbox', status: 'open', title: 'read check' }, {});
    await settle();
    expect(appServers[0]?.paramsOf('config/read')).toEqual({});
  });
});
