// THE SUPERVISOR CAN NOW HOLD A CODEX WORKER, AND STILL SENDS IT NOTHING.
//
// This is the slice that makes `spawnWorker` able to run the second engine:
// one branch at the top picks the readers, the child handle is a facade over a
// `codex app-server` thread (main/codex-session.mjs), and everything after it
// is the code that already existed. It is also the slice with the most
// regression risk so far, because it edits the one file every row goes
// through, so the file below is written in two halves:
//
//   1. THE CODEX PATH ACTUALLY WORKS. Reached by overriding `_engineFor` on one
//      supervisor instance, which is the honest way to test a branch nothing
//      can route to yet: the branch is real code and would otherwise ship
//      unrun. `_engineFor` is deliberately the single line that decides, so
//      overriding it is overriding exactly the decision and nothing else.
//
//   2. AND NOTHING ROUTES TO IT. The gate in shared/engines.mjs is closed --
//      `engineFor` answers Claude Code unless the caller hands it a capability
//      Symbol no file under main/ holds -- so a row she marked `engine: "codex"`
//      between 2026-08-25 and 08-27 still spawns Claude Code, and now that is
//      asserted on a machine where the Codex binary IS configured, which is the
//      one case the older tripwire could not make.
//
// WHY EACH OF THE SMALL CHANGES IS HERE, since they look unrelated and are not:
//
//   ENGINE ON BOTH SESSION RECORDS. `_liveSessions` and `_rowSessions` are the
//   two maps that survive a restart, both record a bare session id, and the two
//   engines keep their transcripts in places with nothing in common. Without
//   the engine, `transcriptFile` looks for a Codex rollout under
//   `~/.claude/projects`, finds nothing, and the wake sweep reads that as a
//   session that vanished -- which leaves the row stranded waiting for her,
//   exactly the shape of the 2026-08-06 incident in CLAUDE.md.
//
//   THE ENV SCRUB. CLAUDE.md: workers run on the user's subscription, NEVER
//   an API key. A Codex signed in with `auth_mode: "chatgpt"` is billed to that
//   subscription, so an inherited
//   `OPENAI_API_KEY` moves that charge to a metered key exactly as an inherited
//   `ANTHROPIC_API_KEY` would, and `CODEX_HOME` names which login bills the run
//   in the same way `CLAUDE_CONFIG_DIR` does. This is a billing-safety
//   requirement, not a nicety.
//
//   `linkAccountTooling`. It symlinks `~/.claude/{skills,commands,agents}` into
//   an account folder. A Codex worker reads none of the three and has no
//   account folder, so running it there writes into a Claude home on behalf of
//   a session that will never open it.
//
//   THE TROUBLE REGEXES. Measured 2026-08-27 on codex-cli 0.144.0, Codex's
//   refusal is "Not inside a trusted directory and --skip-git-repo-check was
//   not specified." It contains neither "untrusted" nor "git repository", so
//   every dead Codex spawn was filed 'unknown' and drew the generic sentence,
//   which for this cause is actively wrong: it tells her the run will keep
//   failing until something is fixed, without naming the folder that is the fix.
//   The two lines went out with the engine in 258d71d and are back BEFORE
//   anything can route to Codex, because a cause classified only after the first
//   Codex run dies is a cause not classified when the first Codex run dies.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The one seam, exactly as tests/a-codex-row-from-august-still-runs-on-claude
// uses it: `main/supervisor.mjs` imports `spawn` at module scope, so this is
// the only place a test can stand between the app's choice of executable and a
// real process. A Codex spawn returns a scripted app-server rather than a stub,
// so the whole transport runs for real.
const spawns = vi.hoisted(() => []);
const appServers = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');

  /**
   * A `codex app-server` that answers its own protocol.
   *
   * Not a stub: it frames real newline-delimited JSON-RPC, answers
   * `initialize`, `config/read`, `thread/start` and `turn/start`, and lets a
   * test push notifications back. So everything between `spawnWorker` and the
   * wire is the shipping code.
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
      // The user's own MCP servers, as `config/read` really reports them.
      mcpServers: { playwright: { command: 'npx' }, context7: { command: 'npx' } },
      threadId: 'T-CODEX',
      turnId: 'TURN-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
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
      return { stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

const toolingCalls = vi.hoisted(() => []);
vi.mock('../main/account-tooling.mjs', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    linkAccountTooling: (profile) => { toolingCalls.push(profile); return null; },
  };
});

import { Supervisor, readersFor } from '../main/supervisor.mjs';
import { captureCodexEvent, codexStreamingText, summarizeCodexEvent, traceCodexEvent } from '../main/codex.mjs';
import { troubleCause, deadRunSentence } from '../shared/spawn-trouble.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { NAME } from '../shared/product-name.mjs';

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';
const dirs = [];

/**
 * Everything the app-server chain hangs off resolves on microtasks and one
 *  immediate; two rounds cover start-then-turn. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

/**
 * THE MOMENT SHE OPENED THE GATE, which is the second half of what `onCodex`
 *  below pretends. That override says which engine a ROW runs on; this says the
 *  second engine may be run at all, and `_capacityFor` asks it (through
 *  `engineChoices`) before it gives Codex a single slot. Opening one and not the
 *  other describes a Mac that cannot exist: in the app both come off this one
 *  value. The last block passes null for it, which is the shut gate. */
const OPT_IN = '2026-09-04T00:00:00Z';

function build({ codexBin = CODEX_BIN, storeRoot = null, engineChoice = OPT_IN } = {}) {
  const dir = storeRoot ?? mkdtempSync(join(tmpdir(), 'codex-supervisor-'));
  if (!storeRoot) dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const written = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      codexBin,
      engineChoice,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
    },
    {
      listItems: () => [],
      listProducts: () => [product],
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult: (slug, id, patch) => { written.push({ slug, id, patch }); },
    },
    '/nonexistent-app',
  );
  sup.written = written;
  sup.storeRoot = dir;
  return sup;
}

/**
 * The row as it comes off her ledger, folded rather than written as a literal:
 *  if the fold ever stopped preserving `engine` this fixture would quietly stop
 *  being a Codex row and the tests would pass for the wrong reason. */
const codexRow = () => {
  const item = foldWorkItems([
    JSON.parse(JSON.stringify({
      id: 'w-250cd74811',
      ts: 1,
      source: 'founder',
      patch: { title: 'try the second engine', status: 'open', engine: 'codex' },
    })),
  ]).get('w-250cd74811');
  expect(item.engine).toBe('codex');
  return { ...item, product: 'agentbox' };
};

/**
 * ONE SUPERVISOR WITH THE DECISION OVERRIDDEN, and this is the only line in
 * this file that pretends the gate is open.
 *
 * `_engineFor` exists as a method precisely so that there is one place where
 * the engine is decided; a test that overrides it is testing the branch below
 * it and nothing else. The gate itself is asserted closed in the last block,
 * on an untouched supervisor.
 */
const onCodex = (sup) => { sup._engineFor = () => 'codex'; return sup; };

beforeEach(() => { spawns.length = 0; appServers.length = 0; toolingCalls.length = 0; });
afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ==================== the readers, swapped per session =================== */

describe('which readers a session output is read with', () => {
  it('reads a codex session with the codex readers', () => {
    expect(readersFor('codex')).toEqual({
      capture: captureCodexEvent,
      stream: codexStreamingText,
      summarize: summarizeCodexEvent,
      trace: traceCodexEvent,
    });
  });

  it('reads a claude session with a different four', () => {
    const claude = readersFor('claude');
    const codex = readersFor('codex');
    for (const which of ['capture', 'stream', 'summarize', 'trace']) {
      expect(typeof claude[which]).toBe('function');
      expect(claude[which]).not.toBe(codex[which]);
    }
  });

  // THE CASE THAT MUST NOT MATCH. Every session that is not Codex is read with
  // Claude Code's eyes, including one carrying a name nothing recognises: a
  // fleet that stops because of a bug in a name is worse than one that reads a
  // stream with the default engine's readers.
  it.each([['claude'], [null], [undefined], ['cursor'], [''], ['CODEX']])('reads %s with the claude readers', (engine) => {
    expect(readersFor(engine)).toEqual(readersFor('claude'));
  });
});

/* ======================= running a codex worker ========================== */

describe('a codex worker runs on the app-server, in the session shape everything else uses', () => {
  it('starts one app-server and no claude', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    expect(spawns.map((s) => s.bin)).toEqual([CODEX_BIN]);
    expect(spawns[0].args).toEqual(['app-server']);
    expect(appServers).toHaveLength(1);
  });

  it('starts a thread that is not ephemeral and that turns her own MCP servers off', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    const params = appServers[0].paramsOf('thread/start');
    expect(params.ephemeral).toBe(false);
    expect(params.cwd).toBe(sup.store.listProducts()[0].dir);
    expect(params.config.mcp_servers).toEqual({
      playwright: { enabled: false },
      context7: { enabled: false },
    });
  });

  it('hands the turn the same brief the claude path puts behind -p', async () => {
    const sup = onCodex(build());
    const item = codexRow();
    sup.spawnWorker(item);
    await settle();

    const turn = appServers[0].paramsOf('turn/start');
    expect(turn.threadId).toBe('T-CODEX');
    expect(turn.input[0].type).toBe('text');
    expect(turn.input[0].text).toContain(item.title);
  });

  it('keeps the session in the same map, with its engine on it', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    const session = sup.sessions.get('w-250cd74811');
    expect(session.engine).toBe('codex');
    expect(typeof session.child.kill).toBe('function');
  });

  // The reader swap, observed where it actually shows: `item/completed` with an
  // agentMessage is a shape only `summarizeCodexEvent` understands, and only
  // `captureCodexEvent` turns a `final_answer` into the session's result.
  it('reads the turn with codex eyes, so the answer and the tail are hers', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    appServers[0].say({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        threadId: 'T-CODEX',
        item: { type: 'agentMessage', id: 'msg_1', text: 'I read the file and patched it.', phase: 'final_answer' },
      },
    });

    const session = sup.sessions.get('w-250cd74811');
    expect(session.result).toBe('I read the file and patched it.');
    expect(session.resultIsError).toBe(false);
    expect(session.tail.join('\n')).toContain('I read the file and patched it.');
  });

  it('never asks the claude account for its tooling', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    expect(toolingCalls).toEqual([]);
  });

  // THE CASE THAT MUST NOT MATCH: a Claude worker still gets its three
  // symlinks, or a second account runs with none of her own skills.
  it('still gives a claude worker its tooling', async () => {
    const sup = build();
    sup.spawnWorker(codexRow());
    await settle();

    expect(toolingCalls).toEqual(['default']);
  });
});

/* ================= our kill, through the whole stack ===================== */

describe('stopping a codex worker is tellable from one that died', () => {
  it('interrupts the turn with both ids and reports a signal', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();
    const exits = [];
    sup.sessions.get('w-250cd74811').child.on('exit', (code, signal) => exits.push({ code, signal }));

    expect(sup.stopSession('w-250cd74811')).toBe(true);

    expect(appServers[0].paramsOf('turn/interrupt')).toEqual({ threadId: 'T-CODEX', turnId: 'TURN-CODEX' });
    expect(exits).toEqual([{ code: 143, signal: 'SIGTERM' }]);
  });

  // `_kill` writes `stoppedByUs`, the facade writes the signal. `settleDelivery`
  // reads `signal || session.stoppedByUs` and both halves must be true, because
  // either one alone has been the bug before.
  it('marks the session as ours, so the row does not spend a delivery attempt', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    sup.stopSession('w-250cd74811');

    expect(sup.sessions.get('w-250cd74811')?.stoppedByUs ?? true).toBe(true);
  });

  // ASKED OF THE CLIENT RATHER THAN OF THE HANDLE THE SUPERVISOR KEEPS. This
  // read `sup._codex === null`, which stopped meaning anything the moment there
  // was one app-server per Codex login rather than one for the whole Mac: a
  // field being cleared is not a process going away, and it is the process that
  // keeps her workers running under permission rules no new spawn would
  // produce (2026-08-06).
  it('takes the app-server down when the app quits', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();
    const running = [...sup._codexServers.values()];
    expect(running).toHaveLength(1);

    sup.killAll();

    expect(running.every((s) => s.client.isClosed())).toBe(true);
    expect([...sup._codexServers.values()]).toEqual([]);
  });
});

/* ================= the engine survives a restart ========================= */

describe('which engine a remembered session belongs to', () => {
  it('is written on both records and is still there after a restart', async () => {
    const sup = onCodex(build());
    sup.spawnWorker(codexRow());
    await settle();

    expect(sup._liveSessions['w-250cd74811']).toMatchObject({ sessionId: 'T-CODEX', engine: 'codex' });
    expect(sup._rowSessions['w-250cd74811']).toMatchObject({ sessionId: 'T-CODEX', engine: 'codex' });

    // A restart is a fresh Supervisor over the same store root, reading the
    // state file the first one wrote.
    const after = build({ storeRoot: sup.storeRoot });
    expect(after._liveSessions['w-250cd74811'].engine).toBe('codex');
    expect(after._rowSessions['w-250cd74811'].engine).toBe('codex');
  });

  // THE CASE THAT MUST NOT MATCH: a Claude row is not quietly labelled Codex,
  // and its records read exactly as they did before this slice.
  it('is claude on a claude session, on both records', async () => {
    const sup = build();
    sup.spawnWorker(codexRow());
    await settle();
    // The Claude path learns its id from its own stream, which the stub does
    // not produce, so the records are written here the way the stream would.
    sup._liveSessions['x'] = { sessionId: 's', product: 'agentbox', engine: 'claude' };
    sup.rememberRowSession({ id: 'x', product: 'agentbox' }, { sessionId: 's', cwd: '/tmp', profile: 'default', engine: 'claude', startedAt: 1 });

    expect(sup._rowSessions.x.engine).toBe('claude');
    expect(sup._rowSessions.x.engine).not.toBe('codex');
  });
});

/* ================== where each engine transcript lives =================== */

describe('finding the transcript of a remembered session', () => {
  const ID = '01a06882-1a46-7872-a189-f1de3d5c3761';
  const NEIGHBOUR = '01a068cb-384a-7eb1-a53d-fee287e14397';

  const codexHome = (...ids) => {
    const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
    dirs.push(home);
    const dir = join(home, 'sessions', '2026', '09', '03');
    mkdirSync(dir, { recursive: true });
    for (const id of ids) writeFileSync(join(dir, `rollout-2026-09-03T22-22-32-${id}.jsonl`), '{}\n');
    return home;
  };

  it('looks under the codex home for a codex session', () => {
    const sup = build();
    sup.config.codexHome = codexHome(ID, NEIGHBOUR);

    expect(sup.transcriptFile({ sessionId: ID, engine: 'codex' })).toContain(`${ID}.jsonl`);
  });

  // THE CASE THAT MUST NOT MATCH, and the one that would resume a stranger's
  // conversation onto her row.
  it('does not settle for a neighbouring rollout', () => {
    const sup = build();
    sup.config.codexHome = codexHome(NEIGHBOUR);

    expect(sup.transcriptFile({ sessionId: ID, engine: 'codex' })).toBeNull();
  });

  // An entry with no engine predates this slice, and every one of those was
  // Claude Code. It must keep taking the Claude path exactly as it did.
  it('takes a record with no engine down the claude path, as it always did', () => {
    const sup = build();
    sup.config.codexHome = codexHome(ID);

    expect(sup.transcriptFile({ sessionId: ID, profile: 'default', cwd: '/tmp/x' })).toBeNull();
    expect(sup.transcriptFile({ sessionId: ID, engine: 'claude', profile: 'default', cwd: '/tmp/x' })).toBeNull();
  });

  it('answers nothing for a record with no session id at all', () => {
    const sup = build();
    expect(sup.transcriptFile({ engine: 'codex' })).toBeNull();
    expect(sup.transcriptFile(null)).toBeNull();
  });
});

/* ========================= the env a worker gets ========================= */

describe('what a worker is never handed', () => {
  const withEnv = (extra, run) => {
    const saved = {};
    for (const [k, v] of Object.entries(extra)) { saved[k] = process.env[k]; process.env[k] = v; }
    try { return run(); } finally {
      for (const k of Object.keys(extra)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  };

  // THE BILLING RULE, as CLAUDE.md states it: workers run on the user's
  // subscription, NEVER an API key. A Codex signed in with
  // `auth_mode: "chatgpt"` bills that subscription, so OPENAI_* is the
  // identical hazard and not a new one.
  //
  // THIS BLOCK USED TO ASSERT ONE SCRUB FOR BOTH ENGINES, AND THAT WAS THE
  // DEFECT (changed deliberately, 2026-09-05). The claim in the code was that
  // "a scrub with a branch in it is a scrub that can be reached down the wrong
  // side", and the price of avoiding that branch was paid by the engine she
  // actually uses: `OPENAI_API_KEY` and `OPENAI_BASE_URL` cannot redirect
  // Claude Code's billing -- the Anthropic scrub beside them is what protects
  // that -- so stripping them bought nothing and broke every Claude worker on a
  // project whose tests or tooling need them. It works in her shell and fails
  // only under Agentbox, which is the worst shape a bug can have here.
  //
  // The old test enshrined it: it asserted all eight keys gone from one call
  // and never once exercised a Claude project that needs the OpenAI ones. So
  // each engine's scrub is on its own spawn now, and both halves are below.
  it('strips every key that could redirect who pays for a Claude Code run', () => {
    const sup = build();
    const env = withEnv({
      ANTHROPIC_API_KEY: 'sk-ant',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CONFIG_DIR: '/somewhere',
      CLAUDECODE: '1',
      CLAUDE_PID: '999',
      CLAUDE_EFFORT: 'high',
    }, () => sup._workerEnv('claude'));

    for (const gone of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CONFIG_DIR',
      'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT']) {
      expect(env[gone]).toBeUndefined();
    }
    // AND THE DEFAULT IS THE CLAUDE ANSWER, because every caller written before
    // there was a second engine passes nothing.
    expect(withEnv({ ANTHROPIC_API_KEY: 'sk-ant' }, () => sup._workerEnv()).ANTHROPIC_API_KEY).toBeUndefined();
  });

  // THE REGRESSION SHE WOULD HAVE HIT, and the reason the shared scrub had to
  // go. A project of hers with an OpenAI-backed test suite or an SDK in its
  // tooling passes in her terminal and fails only inside Agentbox's Claude
  // worker, with nothing on the row naming the variable that went missing.
  it('leaves a Claude Code worker the OpenAI variables her projects need', () => {
    const sup = build();
    const env = withEnv({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://her-proxy',
      CODEX_HOME: '/her/codex',
    }, () => sup._workerEnv('claude'));

    expect(env.OPENAI_API_KEY).toBe('sk-openai');
    expect(env.OPENAI_BASE_URL).toBe('https://her-proxy');
    expect(env.CODEX_HOME).toBe('/her/codex');
  });

  it('carries them all the way onto the Claude Code spawn, which is the one she runs', () => {
    const sup = build();
    withEnv({ OPENAI_API_KEY: 'sk-openai', ANTHROPIC_API_KEY: 'sk-ant' }, () => {
      sup.spawnWorker({ id: 'w-1', product: 'agentbox', title: 'do a thing', status: 'open' });
    });

    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect(spawns[0].options.env.OPENAI_API_KEY).toBe('sk-openai');
    expect(spawns[0].options.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  // THE OTHER HALF OF THE SAME RULE, on the spawn it belongs to. `CODEX_HOME`
  // names which login pays exactly as `CLAUDE_CONFIG_DIR` does, so an inherited
  // one is removed and the home Agentbox itself decided is written back on top.
  it('strips every key that could redirect who pays for a Codex run', () => {
    const sup = build();
    const env = withEnv({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://not-hers',
      CODEX_HOME: '/somebody-elses-codex',
      CODEX_API_KEY: 'sk-codex',
    }, () => sup._workerEnv('codex'));

    for (const gone of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_HOME', 'CODEX_API_KEY']) {
      expect(env[gone]).toBeUndefined();
    }
  });

  // AND IT IS NOT SYMMETRIC, WHICH IS THE PART WORTH ASSERTING RATHER THAN
  // ASSUMING. The mirror argument -- an Anthropic key cannot redirect a Codex
  // run's billing either -- is true and does not win: CLAUDE.md is durable law
  // and says that scrub runs "before EVERY spawn", with "never pass an API key
  // into a worker's env" beside it. The OpenAI half was added by the Codex
  // slice and never asked for; the Anthropic half is a settled rule.
  it('still keeps the Anthropic keys out of a Codex worker, which is CLAUDE.md\'s rule', () => {
    const sup = build();
    const env = withEnv({ ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_CONFIG_DIR: '/somewhere' }, () => sup._workerEnv('codex'));

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  // THE CASE THAT MUST NOT MATCH. A scrub that took the whole environment would
  // break every worker: PATH is how the CLI finds git, and the store variables
  // are how it finds her work.
  it('leaves everything else exactly where it was, on either engine', () => {
    const sup = build();
    for (const engine of ['claude', 'codex']) {
      const env = withEnv({
        PATH: '/usr/bin:/bin',
        HOME: '/Users/you',
        OPENAPI_SPEC: 'keep me',
        MY_CODEX_NOTES: 'keep me too',
        ASTRAL_HOME: '/Users/you/Zero',
      }, () => sup._workerEnv(engine));

      expect(env.PATH).toBe('/usr/bin:/bin');
      expect(env.HOME).toBe('/Users/you');
      // Not a prefix match on a substring: OPENAPI_ and MY_CODEX_ are not
      // OPENAI_ and not CODEX_.
      expect(env.OPENAPI_SPEC).toBe('keep me');
      expect(env.MY_CODEX_NOTES).toBe('keep me too');
      expect(env.ASTRAL_HOME).toBe('/Users/you/Zero');
    }
  });

  it(`hands the app-server the Codex scrub, and the home ${NAME} chose`, async () => {
    const sup = onCodex(build());
    await withEnv({ OPENAI_API_KEY: 'sk-openai', CODEX_HOME: '/somebody-elses-codex' }, async () => {
      sup.spawnWorker(codexRow());
      await settle();
    });

    const server = spawns.find((s) => s.args?.[0] === 'app-server');
    expect(server.options.env.OPENAI_API_KEY).toBeUndefined();
    expect(server.options.env.CODEX_HOME).toBe(sup._codexHome());
  });

  // AND THE INVARIANT THAT SCRUB EXISTS FOR. `_codexHome` reads its env branch
  // through the Codex scrub, so an inherited `CODEX_HOME` is dead by
  // construction: Settings, the model refusal, the rollout search and the
  // app-server all answer one value from one method.
  it('never lets an inherited CODEX_HOME decide which login the app reads', () => {
    const sup = build();
    const home = withEnv({ CODEX_HOME: '/somebody-elses-codex' }, () => sup._codexHome());

    expect(home).not.toBe('/somebody-elses-codex');
  });
});

/* ==================== what a dead run says it was ======================== */

describe('a dead run is reported in the words of the engine that died', () => {
  it('names Codex when a codex session died', () => {
    const sup = build();
    sup.sayTheRunDied({ product: 'agentbox', id: 'w-1' }, {
      engine: 'codex',
      tail: ['stderr: Not inside a trusted directory and --skip-git-repo-check was not specified.'],
    });

    expect(sup.written).toHaveLength(1);
    expect(sup.written[0].patch.result).toContain('Codex');
    expect(sup.written[0].patch.result).not.toContain('Claude Code');
  });

  // THE CASE THAT MUST NOT MATCH, and the reason `engineLabel` is used rather
  // than a ternary: every session written before this slice has no engine on it
  // and must read exactly as it always did.
  it.each([['claude'], [undefined]])('still names Claude Code for engine %s', (engine) => {
    const sup = build();
    sup.sayTheRunDied({ product: 'agentbox', id: 'w-1' }, { engine, tail: ['stderr: OAuth session expired'] });

    expect(sup.written[0].patch.result).toContain('Claude Code');
  });

  it('is the same sentence the reporter would write by hand', () => {
    const sup = build();
    sup.sayTheRunDied({ product: 'agentbox', id: 'w-1' }, { engine: 'codex', tail: ['stderr: You have hit your session limit'] });

    expect(sup.written[0].patch.result)
      .toBe(deadRunSentence({ engineWord: 'Codex', cause: 'at-limit', runs: 1, resetsAt: null }));
  });
});

/* ============== a codex failure cannot strike a claude account =========== */

describe('what a fast codex exit does to her claude subscriptions', () => {
  // `_strikeProfile` and the fleet-wide cooldown are per Claude account, and a
  // fast exit with no healthy sibling arms a spawn cooldown of up to thirty
  // minutes. A Codex worker never touched that subscription. Charging its death
  // to one would take her working engine down over a failure in the other,
  // which is the 2026-08-24 shape: one signed-out subscription halting the one
  // that was fine.
  //
  // HOW THIS IS BOUGHT HAS MOVED, AND THE GUARANTEE HAS NOT. When this file was
  // written `noteExitForBackoff` returned early for a Codex session, so the
  // maps stayed empty -- safe, but it left Codex with no account health at all,
  // and a Codex login that had run out was hammered by every tick with nothing
  // keeping count. The capacity slice gave it its own books under a `codex:`
  // key instead, so what this test asserts is the thing that actually mattered:
  // HER CLAUDE ACCOUNT IS UNTOUCHED, and the brake is not armed.
  // tests/a-codex-failure-is-not-her-claude-account.test.mjs is the whole of
  // it.
  it('leaves them alone, because the run never used one', () => {
    const sup = build();
    sup.noteExitForBackoff(
      { engine: 'codex', profile: 'default', startedAt: Date.now(), tail: ['stderr: it died at once'] },
      { personal: false },
    );

    expect(Object.keys(sup._profileTrouble)).toEqual(['codex:default']);
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._profileCooldown?.default ?? 0).toBe(0);
    expect(sup._healthyProfiles()).toContain('default');
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
  });

  // THE CASE THAT MUST NOT MATCH: a fast Claude exit still strikes, or the
  // backoff ladder this file just walked past stops working entirely.
  it('still notes a claude account that died on arrival', () => {
    const sup = build();
    sup.noteExitForBackoff(
      { engine: 'claude', profile: 'default', startedAt: Date.now(), tail: ['stderr: OAuth session expired'] },
      { personal: false },
    );

    expect(Object.keys(sup._profileTrouble)).toEqual(['default']);
  });
});

/* ================ codex own refusal has a name again ===================== */

describe('a codex spawn that died in an untrusted folder', () => {
  // MEASURED 2026-08-27 on codex-cli 0.144.0. Neither half of this sentence
  // matches any of the three patterns that were left behind after 258d71d.
  it.each([
    ['the whole sentence', 'Not inside a trusted directory and --skip-git-repo-check was not specified.'],
    ['the directory half', 'not inside a trusted directory'],
    ['the flag half', 'pass --skip-git-repo-check to run anyway'],
  ])('is classified as a folder problem from %s', (_what, said) => {
    expect(troubleCause(said)).toBe('workspace');
  });

  it('still classifies the wording Claude Code uses', () => {
    expect(troubleCause('this folder is untrusted')).toBe('workspace');
    expect(troubleCause('not a git repository')).toBe('workspace');
  });

  // THE CASE THAT MUST NOT MATCH. The new patterns are specific enough that
  // ordinary text does not become a folder problem, and an account or a limit
  // still outranks one, which is the order `troubleCause` tests in.
  it.each([
    ['ordinary prose', 'the agent wrote a directory listing to the trusted notes file', 'unknown'],
    ['a signed-out account', 'OAuth session expired in an untrusted directory', 'signed-out'],
    ['a limit', 'you have hit your weekly limit', 'at-limit'],
    ['nothing at all', '', 'unknown'],
  ])('does not call %s a folder problem', (_what, said, cause) => {
    expect(troubleCause(said)).toBe(cause);
  });
});

/* ===================== and the gate is still closed ====================== */

// The older tripwire (tests/a-codex-row-from-august-still-runs-on-claude) makes
// this claim on a Mac with no Codex configured. This block makes it on one
// where the binary IS configured and the whole Codex path is wired up, which is
// the case that slice could not build and the only one that could actually go
// wrong now.
describe('a persisted codex row still spawns Claude Code, on a Mac that has Codex', () => {
  // `engineChoice: null` IS THE SHUT GATE, and it has to be said out loud now
  // rather than left as the harness default. Every other block in this file
  // describes a Mac where she HAS opted in -- because `_capacityFor` reads the
  // opt-in too, so a harness that opened the gate only for routing would give
  // its Codex worker no slot to run in. Here the moment is absent, which is
  // every Mac before the user writes it.
  const shut = (over = {}) => build({ engineChoice: null, ...over });

  it('runs the claude binary and starts no app-server', async () => {
    const sup = shut();
    sup.spawnWorker(codexRow());
    await settle();

    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect(appServers).toEqual([]);
    expect(sup.sessions.get('w-250cd74811').engine).toBe('claude');
  });

  it('runs Claude Code even when the workspace config also says codex', async () => {
    const sup = shut();
    sup.config.engine = 'codex';
    sup.spawnWorker(codexRow());
    await settle();

    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
  });

  it('answers claude from the one line that decides, whatever the row says', () => {
    const sup = shut();
    expect(sup._engineFor(codexRow())).toBe('claude');
    expect(sup._engineFor({ engine: 'codex' })).toBe('claude');
    expect(sup._engineFor({})).toBe('claude');
  });

  // AND OFFERS NO CODEX SLOTS EITHER, which is the half that was missing: the
  // cap asked only whether the binary was there, so this exact Mac reported
  // room for six sessions where three can start.
  it('gives codex no capacity at all', () => {
    const sup = shut();
    expect(sup._capacityFor('codex')).toBe(0);
    expect(sup._capacity()).toBe(4);
  });

  // THE SECOND CLOSED DOOR. Even a caller that opened the gate would be told
  // this Mac has no Codex, because nothing writes `codexBin` into the config.
  it('would still answer claude on a Mac with no codex binary', () => {
    expect(shut({ codexBin: null })._engineFor(codexRow())).toBe('claude');
    // And with the gate genuinely open, which is the case the binary alone has
    // to carry.
    expect(build({ codexBin: null })._engineFor(codexRow())).toBe('claude');
  });
});
