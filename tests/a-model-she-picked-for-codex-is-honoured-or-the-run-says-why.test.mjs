// A MODEL SHE PICKED FOR CODEX IS HONOURED, OR THE RUN SAYS WHY IT IS NOT.
//
// Until `main/codex-models.mjs` existed, the supervisor had no way to tell one
// model word from another, so it treated EVERY model on a Codex row as a Claude
// Code name and dropped it:
//
//   `this row asks for the model "<word>", which is a Claude Code model name
//    and not one Codex knows, so this run is going ahead on Codex's own default
//    model instead of failing to start`
//
// THREE THINGS WERE WRONG WITH THAT AND THIS FILE PINS ALL THREE.
//
// 1. IT REFUSED WORDS CODEX KNOWS. `gpt-5.6-sol` is the model her own
//    config.toml names, and it went into that sentence as "a Claude Code model
//    name" and was thrown away. With the list read off this Mac, a slug Codex
//    accepts is now simply carried into `thread/start`.
//
// 2. THE SENTENCE WAS A GUESS ABOUT THE WORD. `gpt-5.6-slo` is a typo, not a
//    Claude Code model name, and the app said it was one. A sentence that
//    misdiagnoses is worse than one that says less, because she acts on it.
//
// 3. AND IT REACHED NOBODY. Measured 2026-09-04 by reading the two line
//    numbers: `_spawnCodexWorker` emitted the refusal on `worker.stderr`
//    SYNCHRONOUSLY, at main/supervisor.mjs:3967, and returned the worker to
//    `spawnWorker`, which attaches `child.stderr.on('data', ...)` 430 lines
//    later at :4397. An EventEmitter buffers nothing, so the only notice she
//    was ever going to get about her model choice being dropped was emitted
//    into an emitter with no listeners on it. The run then went ahead on a
//    model she did not pick, and there was no record of it anywhere -- not the
//    tail, not the trace, not the row.
//
// SO THE RESOLUTION IS: RUN IT, OR DO NOT RUN. There is no third thing.
//
// A word this Mac's Codex knows is carried. A word it does not know STOPS THE
// RUN before `thread/start`, with the reason on the pipe `troubleCause` reads
// -- the same gate main/codex-session.mjs already uses two steps later when the
// store server never comes up, and the same shape `mcpServerNames` uses when it
// cannot tell which servers to switch off.
//
// It is not run-on-the-default-and-mention-it, and the reason is CLAUDE.md's:
// "WHEN THE SYSTEM SWALLOWS SOMETHING SHE SAID, SHE CANNOT TELL IT FROM THE
// WORK NOT HAPPENING." Running on Codex's default is a substitution she did not
// pick, exactly as an invented opus-to-slug map would be, only with a different
// guess in it. And a run that goes ahead and SUCCEEDS has no channel to tell her
// at all: stderr only becomes a sentence on her row through `sayTheRunDied`,
// which fires on a run that died. Stopping is the only outcome she can see.
//
// A run stopped here has cost the row nothing. `worker.emit('spawn')` is two
// steps further down the same chain, so no one-off permission mode is spent,
// no delivery mark is written, and no file was touched.
//
// AND WITH NO LIST, NOTHING IS REFUSED. A Mac with no readable
// `models_cache.json` cannot say a word is wrong, so the word goes to Codex as
// written and Codex answers for its own slugs. We refuse on a fact or not at
// all.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/codex-models-cache.json', import.meta.url));

// The one seam, exactly as the other codex supervisor tests use it: the
// supervisor imports `spawn` at module scope, so this stands between the app's
// choice of executable and a real process. A Codex spawn gets a scripted
// app-server that frames real JSON-RPC, so everything from `spawnWorker` to the
// wire is the shipping code.
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
      mcpServers: {},
      threadId: 'T-CODEX',
      turnId: 'TURN-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
      asked: (method) => sent.some((m) => m.method === method),
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
      return { stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

vi.mock('../main/account-tooling.mjs', async (importActual) => {
  const actual = await importActual();
  return { ...actual, linkAccountTooling: () => null };
});

import { Supervisor } from '../main/supervisor.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { codexModels } from '../main/codex-models.mjs';

const CODEX_BIN = '/nonexistent/codex/codex';
const dirs = [];

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

/** A Codex home carrying this Mac's real (trimmed) model cache, or none. */
function codexHomeWith({ cache = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-model-home-'));
  dirs.push(dir);
  if (cache) copyFileSync(FIXTURE, join(dir, 'models_cache.json'));
  return dir;
}

function build({ cache = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-model-row-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const written = [];
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
      codexHome: codexHomeWith({ cache }),
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
  // The one line that pretends the gate is closed for everyone but this test:
  // `_engineFor` is deliberately the single place the engine is decided, so
  // overriding it is overriding exactly that decision and nothing else.
  sup._engineFor = () => 'codex';
  return sup;
}

/** The row as it comes off her ledger, folded rather than written as a literal,
 *  so a fold that stopped preserving `model` cannot pass this for free. */
const rowWanting = (model) => {
  const item = foldWorkItems([
    JSON.parse(JSON.stringify({
      id: 'w-250cd74811',
      ts: 1,
      source: 'founder',
      patch: { title: 'try the second engine', status: 'open', engine: 'codex', ...(model ? { model } : {}) },
    })),
  ]).get('w-250cd74811');
  if (model) expect(item.model).toBe(model);
  return { ...item, product: 'agentbox' };
};

/**
 * Start a run and keep hold of its session.
 *
 * The session is TAKEN SYNCHRONOUSLY, before any awaiting, because a run that
 * ends is removed from `sup.sessions` -- and a run that ends is exactly the
 * case this file is about. Reading the map afterwards reads an empty tail and
 * every assertion below would pass for the wrong reason.
 */
const runWith = (sup, model) => {
  const item = rowWanting(model);
  sup.spawnWorker(item);
  return sup.sessions.get(item.id);
};

/** Everything the run said on the pipe `troubleCause` reads. */
const stderrOf = (session) => (session?.tail ?? [])
  .filter((l) => typeof l === 'string' && l.startsWith('stderr:'))
  .join('\n');

beforeEach(() => { spawns.length = 0; appServers.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ===================== a word codex knows is carried ===================== */

describe('a model this mac codex knows', () => {
  it('is carried into thread/start exactly as she wrote it', async () => {
    const sup = build();
    sup.spawnWorker(rowWanting('gpt-5.6-sol'));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBe('gpt-5.6-sol');
    expect(appServers[0].asked('turn/start')).toBe(true);
  });

  it('says nothing about it, because there is nothing to say', async () => {
    const sup = build();
    const session = runWith(sup, 'gpt-5.6-sol');
    await settle();

    expect(sup.codexModelRefusal('gpt-5.6-sol')).toBe(null);
    expect(stderrOf(session)).not.toMatch(/model/i);
  });

  // THE CASE THAT MUST NOT MATCH THE REFUSAL. `gpt-reserve` is `visibility:
  // "hide"` and must never be OFFERED, but Codex would accept it, so refusing
  // it would stop a run over a model that exists. Two questions, two answers.
  it('carries a hidden slug too, because codex would take it', async () => {
    const sup = build();
    expect(codexModels({ home: sup.config.codexHome }).map((m) => m.id)).not.toContain('gpt-reserve');

    sup.spawnWorker(rowWanting('gpt-reserve'));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBe('gpt-reserve');
    expect(sup.codexModelRefusal('gpt-reserve')).toBe(null);
  });

  // The boundary the other side of the good word: every model she can be
  // offered is a model that runs, or the picker slice ships a list that stops
  // rows.
  it('carries every model a picker could offer', () => {
    const sup = build();
    for (const { id } of codexModels({ home: sup.config.codexHome })) {
      expect(sup.codexModelRefusal(id)).toBe(null);
    }
  });
});

/* ================= a word it does not know stops the run ================= */

describe('a model this mac codex does not know', () => {
  it.each([['opus'], ['sonnet'], ['claude-opus-5'], ['gpt-5.6-slo'], ['gpt-5.6']])
  ('never reaches thread/start: %s', async (word) => {
    const sup = build();
    sup.spawnWorker(rowWanting(word));
    await settle();

    expect(appServers[0].asked('thread/start')).toBe(false);
    expect(appServers[0].asked('turn/start')).toBe(false);
  });

  // THE FAILURE THIS FILE IS NAMED FOR. The old line emitted into an emitter
  // nobody was listening to yet; this asserts the sentence is really on the
  // session, which is what the trace is written from and what `troubleCause`
  // is handed.
  it('says why, on the pipe the app actually reads', async () => {
    const sup = build();
    const session = runWith(sup, 'opus');
    await settle();

    const said = stderrOf(session);
    expect(said).toMatch(/opus/);
    expect(said).toMatch(/gpt-5\.6-sol/);   // and what it could have been
    expect(said).toMatch(/stopping|not starting|did not run/i);
  });

  it('names the word and what codex offers, and does not guess where the word came from', () => {
    const sup = build();
    const said = sup.codexModelRefusal('gpt-5.6-slo');
    expect(said).toMatch(/gpt-5\.6-slo/);
    expect(said).toMatch(/gpt-5\.4-mini/);
    // THE SENTENCE THE OLD ONE TOLD. A typo is not a Claude Code model name,
    // and an app that says it is sends her looking in the wrong place.
    expect(said).not.toMatch(/Claude/i);
    // AND IT NEVER OFFERS A HIDDEN ONE AS THE FIX.
    expect(said).not.toMatch(/gpt-reserve|codex-auto-review/);
  });

  it('ends the worker without spending anything on the row', async () => {
    const sup = build();
    const exits = [];
    const session = runWith(sup, 'opus');
    session.child.once('exit', (code) => exits.push(code));
    await settle();

    expect(exits).toEqual([1]);
    // `spawn` is emitted two steps further down the same chain, after the
    // thread and the store gate, so nothing here spent her one-off mode.
    expect(session.sessionId ?? null).toBe(null);
  });
});

/* ================== and the cases that refuse nothing =================== */

describe('what is never refused', () => {
  // A row with no model of its own is not carrying anything to refuse.
  it('a row that picked no model at all', async () => {
    const sup = build();
    expect(sup.codexModelRefusal(null)).toBe(null);
    expect(sup.codexModelRefusal('')).toBe(null);
    expect(sup.codexModelRefusal('   ')).toBe(null);

    sup.spawnWorker(rowWanting(null));
    await settle();

    const params = appServers[0].paramsOf('thread/start');
    expect(params).toBeTruthy();
    expect('model' in params).toBe(false);
  });

  // WE REFUSE ON A FACT OR NOT AT ALL. With no readable cache this Mac cannot
  // say the word is wrong, so it goes to Codex as written and Codex answers
  // for its own slugs -- which is a true sentence from the authority, rather
  // than a confident one from us.
  it('any model at all, on a mac with no model list to check it against', async () => {
    const sup = build({ cache: false });
    expect(codexModels({ home: sup.config.codexHome })).toEqual([]);
    expect(sup.codexModelRefusal('opus')).toBe(null);

    sup.spawnWorker(rowWanting('opus'));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBe('opus');
  });
});

/* ======================== which home is consulted ======================== */

describe('the list a run is checked against', () => {
  it('is the one in her configured codex home', () => {
    const sup = build();
    const other = codexHomeWith({ cache: false });
    expect(sup.codexModelRefusal('opus')).toMatch(/gpt-5\.6-sol/);
    sup.config.codexHome = other;
    expect(sup.codexModelRefusal('opus')).toBe(null);
  });

  // THE CASE THAT MUST NOT MATCH, and it is a billing rule wearing a model
  // rule's clothes. `_workerEnv` deletes every `CODEX_*` before the app-server
  // is spawned, because `CODEX_HOME` names which login bills the run in the way
  // `CLAUDE_CONFIG_DIR` does. So a `CODEX_HOME` Agentbox happened to inherit
  // reaches no Codex this app runs, and checking her model against the list in
  // THAT home would be checking it against an account nothing of ours opens.
  //
  // Asserted as a path rather than by reading a cache out of it, deliberately:
  // the fallback is `~/.codex`, and a test that read whatever is really in the
  // running machine's `~/.codex` would pass or fail on whose Mac it ran.
  it('is never a CODEX_HOME the app merely inherited', () => {
    const sup = build();
    const elsewhere = codexHomeWith({ cache: true });
    const before = process.env.CODEX_HOME;
    try {
      process.env.CODEX_HOME = elsewhere;
      expect(sup._codexHome()).toBe(sup.config.codexHome);
      delete sup.config.codexHome;
      expect(sup._codexHome()).toBe(join(homedir(), '.codex'));
      expect(sup._codexHome()).not.toBe(elsewhere);
    } finally {
      if (before === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = before;
    }
  });

  // AND THE SAME HOME ANSWERS FOR THE TRANSCRIPT, which is the other thing on
  // this supervisor that has to name a Codex home. One method, one rule: two
  // copies of it are one edit away from a run checked against one account and
  // resumed out of another.
  it('is the same home the transcript search is given', () => {
    const sup = build();
    expect(sup.transcriptFile({ sessionId: 'no-such-thread', engine: 'codex' })).toBe(null);
    expect(sup._codexHome()).toBe(sup.config.codexHome);
  });
});
