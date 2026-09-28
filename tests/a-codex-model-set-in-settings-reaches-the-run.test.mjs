// The founder-side tester, running the real app on 2026-09-05 with Codex chosen
// as the workspace coding agent. The Settings Agents pane read:
//
//     Coding agent   [ Claude Code | Codex ]      <- Codex lit
//     Model          [ Opus 5 | Sonnet 5 | Haiku 4.5 | The CLI default ]
//
// which is her own 2026-08-26 defect -- "On Opus. With Codex.", two sentences
// that cannot both be true -- reproduced one row lower, on the workspace instead
// of on a card.
//
// THE PREVIOUS SLICE DECLINED TO DRAW A CODEX MODEL ROW, and its argument was
// right: `codexThreadParamsFor` took the model from the ROW and nowhere else, so
// a workspace Codex model would have been "a control that changed nothing about
// the run", which is the same defect wearing a third set of clothes. The
// conclusion was wrong. Claude Code's workspace Model row genuinely works (it is
// the `--model` flag inside her `sessionArgs`), so the honest fix is to make
// Codex's work too rather than to keep a row that lies about which engine it
// belongs to.
//
// THIS FILE IS THE HALF THAT MAKES THE CONTROL REAL: `config.codexModel`, and
// the order the two model words are resolved in. The other half -- which list
// the row draws -- is
// tests/the-model-row-belongs-to-the-agent-named-above-it.test.mjs.
//
// THE PRECEDENCE, WRITTEN DOWN SO IT CANNOT DRIFT, AND IT IS THE SAME ONE
// CLAUDE CODE ALREADY FOLLOWS (`spawnPlan`: `setModelArg(grants, item.model)`):
//
//   A MODEL NAMED ON THE ROW WINS. She chose it on this task, a minute ago,
//     against a workspace setting she may have made in June.
//   OTHERWISE THE WORKSPACE'S CODEX MODEL, which is what the Settings row now
//     writes and is the whole point of drawing it.
//   OTHERWISE NOTHING IS SENT AT ALL, and `~/.codex/config.toml` decides. That
//     is "Codex's own" (`CODEX_OWN` in renderer/src/models.ts) and it has to
//     stay reachable, because it is the only answer that keeps her terminal and
//     her fleet running the same model on a Mac where she changes that file.
//
// AND A WORKSPACE WORD IS REFUSED ON EXACTLY THE SAME FACT A ROW WORD IS. A
// model this Mac's Codex does not know stops the run rather than picking a
// stand-in, whichever setting carried it -- the argument is
// tests/a-model-she-picked-for-codex-is-honoured-or-the-run-says-why.test.mjs
// and it does not change because the word came from a different place. What
// does change is the SENTENCE: it names which setting asked, because "this row
// asks to run on ..." over a word that is not on the row sends her to the wrong
// screen to fix it.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/codex-models-cache.json', import.meta.url));

// The one seam, exactly as the sibling codex supervisor tests use it: the
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
import { loadConfig, saveConfig } from '../main/config.mjs';
import { readSettings, setWorkspaceSetting } from '../main/settings.mjs';

const CODEX_BIN = '/nonexistent/codex/codex';
const OPENED = '2026-09-04T00:00:00Z';
const dirs = [];

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/**
 * A Codex home carrying this Mac's real (trimmed) model cache, and her own
 *  `config.toml` default when one is asked for. */
function codexHomeWith({ cache = true, toml = null } = {}) {
  const dir = tempDir('codex-ws-model-home-');
  if (cache) copyFileSync(FIXTURE, join(dir, 'models_cache.json'));
  if (toml !== null) writeFileSync(join(dir, 'config.toml'), toml);
  return dir;
}

function build({ cache = true, codexModel, toml = null } = {}) {
  const dir = tempDir('codex-ws-model-');
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: CODEX_BIN,
      codexHome: codexHomeWith({ cache, toml }),
      // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
      // which engine a row runs on; this says the second engine may be run at
      // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
      // it gives Codex a single slot. Opening one and not the other describes a
      // Mac that cannot exist: in the app both come off this same value.
      engineChoice: '2026-09-04T00:00:00Z',
      ...(codexModel === undefined ? {} : { codexModel }),
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
  // The one line that pretends the gate is open for this test only:
  // `_engineFor` is deliberately the single place the engine is decided, so
  // overriding it is overriding exactly that decision and nothing else.
  sup._engineFor = () => 'codex';
  return sup;
}

/**
 * The row as it comes off her ledger, folded rather than written as a literal,
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
  return { ...item, product: 'agentbox' };
};

/** Everything the run said on the pipe `troubleCause` reads. */
const stderrOf = (session) => (session?.tail ?? [])
  .filter((l) => typeof l === 'string' && l.startsWith('stderr:'))
  .join('\n');

beforeEach(() => { spawns.length = 0; appServers.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ============ the workspace model is what a bare row runs on ============= */

describe('a codex row that names no model of its own', () => {
  it('runs on the codex model she set in Settings', async () => {
    const sup = build({ codexModel: 'gpt-5.5' });
    sup.spawnWorker(rowWanting(null));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBe('gpt-5.5');
    expect(appServers[0].asked('turn/start')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH, and it is today's behaviour on every Mac:
  // with nothing set, nothing is sent and `~/.codex/config.toml` decides. That
  // is "Codex's own", and it stays reachable precisely because the absent
  // setting means it.
  it('sends no model at all when she has set none', async () => {
    const sup = build();
    sup.spawnWorker(rowWanting(null));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBeUndefined();
    expect(sup.codexThreadParamsFor({ model: null }, '/tmp/p', [], null).model).toBeUndefined();
  });

  // The boundary either side of an absent setting: an empty string and a string
  // of spaces are both her having picked "Codex's own" (`CODEX_OWN` is the
  // empty string), and neither may become a `model: ""` on the wire.
  it('reads an empty setting as Codex\'s own rather than as a model', () => {
    expect(build({ codexModel: '' }).codexThreadParamsFor({ model: null }, '/tmp/p', [], null).model).toBeUndefined();
    expect(build({ codexModel: '   ' }).codexThreadParamsFor({ model: null }, '/tmp/p', [], null).model).toBeUndefined();
  });
});

/* ==================== and the row still outranks it ====================== */

describe('a model named on the row', () => {
  it('wins over the workspace setting', async () => {
    const sup = build({ codexModel: 'gpt-5.5' });
    sup.spawnWorker(rowWanting('gpt-5.6-terra'));
    await settle();

    expect(appServers[0].paramsOf('thread/start').model).toBe('gpt-5.6-terra');
  });

  // The same rule Claude Code follows, said at the one place that resolves it,
  // so a reader can check the two engines agree without running anything.
  it('wins in the resolver too, not only on the wire', () => {
    const sup = build({ codexModel: 'gpt-5.5' });
    expect(sup.codexThreadParamsFor({ model: 'gpt-5.4' }, '/tmp/p', [], null).model).toBe('gpt-5.4');
  });
});

/* ============ a workspace word this mac cannot run stops the run ========= */

describe('a workspace codex model this Mac\'s codex does not know', () => {
  it('stops the run rather than picking a stand-in', () => {
    const sup = build({ codexModel: 'gpt-5.6-slo' });
    expect(() => sup.codexThreadParamsFor({ model: null }, '/tmp/p', [], null)).toThrow(/gpt-5\.6-slo/);
  });

  // AND IT SAYS WHICH SETTING ASKED. The row sentence sends her to the row; a
  // workspace word is not on any row, so the same sentence would send her
  // hunting on a task for a word she set on a settings screen.
  it('names the workspace rather than the row', () => {
    const sup = build({ codexModel: 'gpt-5.6-slo' });
    expect(sup.codexModelRefusal('gpt-5.6-slo', 'workspace')).toMatch(/every Codex agent/);
    expect(sup.codexModelRefusal('gpt-5.6-slo', 'workspace')).not.toMatch(/this row/);
    // And the row wording is untouched, because the row case is unchanged.
    expect(sup.codexModelRefusal('opus')).toMatch(/this row/);
  });

  it('reaches her on the pipe the run\'s trouble is read off', async () => {
    const sup = build({ codexModel: 'gpt-5.6-slo' });
    const item = rowWanting(null);
    sup.spawnWorker(item);
    const session = sup.sessions.get(item.id);
    await settle();

    expect(stderrOf(session)).toMatch(/gpt-5\.6-slo/);
    expect(appServers[0]?.asked('thread/start') ?? false).toBe(false);
  });

  // AND THE MAC WITH NO LIST REFUSES NOTHING, which is the rule the row already
  // follows: we refuse on a fact or not at all.
  it('is carried anyway on a Mac whose codex published no list', () => {
    const sup = build({ cache: false, codexModel: 'gpt-5.6-slo' });
    expect(sup.codexThreadParamsFor({ model: null }, '/tmp/p', [], null).model).toBe('gpt-5.6-slo');
  });
});

/* ================= and the settings screen really writes it ============== */

describe('the settings screen writes it into her own config', () => {
  const withConfig = (overrides) => {
    const appDir = tempDir('codex-ws-model-config-');
    writeFileSync(join(appDir, 'zero.config.json'), JSON.stringify({
      storeRoot: '/tmp/store', maxConcurrentSessions: 3, sessionArgs: [], ...overrides,
    }, null, 2));
    const config = loadConfig(appDir);
    config.appDir = appDir;
    return { appDir, config };
  };
  const onDisk = (appDir) => JSON.parse(readFileSync(join(appDir, 'zero.config.json'), 'utf8'));

  it('writes the slug she picked', () => {
    const { appDir, config } = withConfig({});
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'codexModel', value: 'gpt-5.5' });
    expect(onDisk(appDir).codexModel).toBe('gpt-5.5');
    expect(config.codexModel).toBe('gpt-5.5');
  });

  // "Codex's own" is the absence of the key, never an empty string in her file:
  // her config is read by people, and a key that means nothing is a key that
  // gets asked about (the rule `projectSessionArgs` already follows).
  it('takes the key back out for Codex\'s own', () => {
    const { appDir, config } = withConfig({ codexModel: 'gpt-5.5' });
    setWorkspaceSetting({ config, supervisor: {} }, { key: 'codexModel', value: null });
    expect('codexModel' in onDisk(appDir)).toBe(false);
    expect(config.codexModel).toBeUndefined();
  });

  it('reports it back on the settings payload, so the row draws what is set', () => {
    const dir = tempDir('codex-ws-model-read-');
    const home = codexHomeWith({ toml: 'model = "gpt-5.6-sol"\n' });
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const config = {
      home: '/nonexistent-home', storeRoot: dir, accountRoot: dir, appDir: dir,
      claudeBin: '/nonexistent/claude', codexBin: CODEX_BIN, codexHome: home,
      engineChoice: OPENED, codexModel: 'gpt-5.5',
      maxConcurrentSessions: 3, authProfiles: ['default'], sessionArgs: [],
    };
    const w = readSettings({ config, supervisor: new Supervisor(config, store, dir), store }).workspace;
    expect(w.codexModel).toBe('gpt-5.5');
    expect(w.codexModelDefault).toBe('gpt-5.6-sol');
  });

  // THE CASE THAT MUST NOT MATCH: a Mac with one coding agent is told nothing
  // about a codex model, because there is no row to draw it in.
  it('says nothing about it on a Mac with one coding agent', () => {
    const dir = tempDir('codex-ws-model-one-');
    const home = codexHomeWith({ toml: 'model = "gpt-5.6-sol"\n' });
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const config = {
      home: '/nonexistent-home', storeRoot: dir, accountRoot: dir, appDir: dir,
      claudeBin: '/nonexistent/claude', codexBin: CODEX_BIN, codexHome: home,
      codexModel: 'gpt-5.5',
      maxConcurrentSessions: 3, authProfiles: ['default'], sessionArgs: [],
    };
    const w = readSettings({ config, supervisor: new Supervisor(config, store, dir), store }).workspace;
    expect(w.engineChoices).toHaveLength(1);
    expect(w.codexModel ?? null).toBeNull();
    expect(w.codexModelDefault).toBeNull();
  });
});
