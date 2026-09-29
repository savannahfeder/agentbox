// THE CODEX ACCOUNT AGENTBOX SHOWS IS THE ONE IT ACTUALLY BILLS.
//
// Two halves of the app decided which Codex home they were talking about, and
// they decided differently.
//
// `_codexHome` -> `config.codexHome || ~/.codex`. Settings offers models out of
// it (`codexModels`), the model refusal checks a row's slug against it
// (`codexKnownSlugs`), and restart recovery looks for a session's rollout under
// it (`codexTranscriptFile`). `_codexServer` -> spawned the app-server with
// `_workerEnv`, which DELETES every `CODEX_*`. So the process read whatever
// `~/.codex` is, always, and never `config.codexHome`.
//
// Set `codexHome` in zero.config.json and Settings offers account A's models
// while every run authenticates and bills account B, the refusal checks A's
// slug list against a run on B, and `resumeStopped` searches A for rollouts
// written under B -- stranding them, silently, which is the shape CLAUDE.md
// prices at "she cannot tell it from the work not happening".
//
// THE SCRUB IS NOT THE BUG AND IS NOT WEAKENED. `CODEX_HOME` names which login
// pays, exactly as `CLAUDE_CONFIG_DIR` does, so an INHERITED one silently moves
// the charge off the subscription she meant -- CLAUDE.md's billing law. The
// scrub's job is to remove the ambient value. Deciding a home and then handing
// it to the spawn is the opposite of inheriting one, and it is what the Claude
// path has always done with `CLAUDE_CONFIG_DIR`: scrubbed out of the parent,
// written back in per spawn from the profile that was chosen. So: scrub first,
// then set the one home Agentbox decided, in the one place that decides it.
//
// MEASURED, this Mac 2026-09-05, codex-cli 0.148.0: a real `codex app-server`
// spawned with `CODEX_HOME` pointing at a scratch directory read that
// directory's `config.toml` for its MCP servers and wrote its rollouts to
// `<that dir>/sessions/YYYY/MM/DD/`. The variable is the whole of the answer.
//
// AND A SECOND CODEX LOGIN IS NOW REAL RATHER THAN A NUMBER. `_codexProfiles`
// widened `_capacityFor('codex')` for every entry in `config.codexProfiles`
// while ONE app-server, on ONE login, ran every thread on the machine -- a cap
// that widened without widening what ran, which is a number that lies to her on
// the Settings screen. A Codex profile is a CODEX_HOME the same way a Claude
// profile is a CLAUDE_CONFIG_DIR, `default` means the one `_codexHome` names,
// and there is one app-server per home. Widening the cap and widening what runs
// are the same act again.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const spawns = vi.hoisted(() => []);
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
    let threads = 0;
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        sent.push(msg);
        if (msg.method === 'initialize') say({ jsonrpc: '2.0', id: msg.id, result: { userAgent: 'agentbox/test' } });
        if (msg.method === 'config/read') say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: {} }, origins: {} } });
        if (msg.method === 'thread/start') {
          const id = `T-${threads += 1}`;
          say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id } } });
          say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id } } });
        }
        if (msg.method === 'turn/start') say({ jsonrpc: '2.0', id: msg.id, result: { turn: { id: 'TURN', status: 'inProgress' } } });
      }
      cb?.(null);
      return true;
    };
    stdin.end = () => {};
    child.stdin = stdin;
    child.kill = () => true;
    return child;
  };
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      if (Array.isArray(args) && args[0] === 'app-server') return scriptedAppServer();
      return { stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

vi.mock('../main/account-tooling.mjs', async (importActual) => ({
  ...(await importActual()),
  linkAccountTooling: () => null,
}));

import { Supervisor } from '../main/supervisor.mjs';
import { NAME } from '../shared/product-name.mjs';

const dirs = [];
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => { setImmediate(r); }); };
const appServerSpawns = () => spawns.filter((s) => Array.isArray(s.args) && s.args[0] === 'app-server');

function build(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-home-'));
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
      ...overrides,
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

beforeEach(() => { spawns.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ============== the home the process reads is the one we decided ========== */

describe(`the app-server ${NAME} spawns`, () => {
  it('is handed the home the rest of the app reads', async () => {
    const home = mkdtempSync(join(tmpdir(), 'her-codex-'));
    dirs.push(home);
    const { sup } = build({ codexHome: home });
    sup.spawnWorker({ id: 'w-1', product: 'agentbox', status: 'open', title: 'bill check' }, {});
    await settle();
    expect(appServerSpawns()).toHaveLength(1);
    expect(appServerSpawns()[0].options.env.CODEX_HOME).toBe(home);
    expect(sup._codexHome()).toBe(home);
  });

  it('is handed the default home when she has set none, which is what it read before', async () => {
    const { sup } = build();
    sup.spawnWorker({ id: 'w-2', product: 'agentbox', status: 'open', title: 'default check' }, {});
    await settle();
    expect(appServerSpawns()[0].options.env.CODEX_HOME).toBe(join(homedir(), '.codex'));
  });

  // THE BOUNDARY THE SCRUB EXISTS FOR. A `CODEX_HOME` in Agentbox's own
  // environment -- whatever shell launched it -- names a login she did not
  // choose, and it must not reach the child. The one Agentbox decided replaces
  // it; it never merely survives.
  it(`never inherits a CODEX_HOME from the shell that launched ${NAME}`, async () => {
    const strayHome = join(tmpdir(), 'a-login-she-did-not-choose');
    const her = mkdtempSync(join(tmpdir(), 'her-codex-'));
    dirs.push(her);
    vi.stubEnv('CODEX_HOME', strayHome);
    try {
      const { sup } = build({ codexHome: her });
      sup.spawnWorker({ id: 'w-3', product: 'agentbox', status: 'open', title: 'stray env' }, {});
      await settle();
      expect(appServerSpawns()[0].options.env.CODEX_HOME).toBe(her);
      // And the READING half agrees, which is the whole point of the pair.
      expect(sup._codexHome()).toBe(her);
    } finally { vi.unstubAllEnvs(); }
  });

  // THE CASE THAT MUST NOT MATCH. Putting one variable back is not loosening
  // the scrub: every other way of redirecting a bill is still deleted, and an
  // OpenAI API key is the one that would move a ChatGPT-subscription run onto a
  // metered key without a word on any screen.
  it('still scrubs every other way of moving the bill', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-not-hers');
    vi.stubEnv('CODEX_API_KEY', 'also-not-hers');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-not-hers');
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/somebody/else/.claude');
    try {
      const { sup } = build();
      sup.spawnWorker({ id: 'w-4', product: 'agentbox', status: 'open', title: 'scrub check' }, {});
      await settle();
      const env = appServerSpawns()[0].options.env;
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.CODEX_API_KEY).toBeUndefined();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
    } finally { vi.unstubAllEnvs(); }
  });
});

/* ================= a second login is a second app-server ================= */

describe('a second Codex login', () => {
  it('is a home of its own, and a process of its own on that home', async () => {
    const second = mkdtempSync(join(tmpdir(), 'second-codex-'));
    dirs.push(second);
    const { sup } = build({ codexProfiles: ['default', second] });
    expect(sup._codexProfiles()).toEqual(['default', second]);
    sup.spawnWorker({ id: 'w-5', product: 'agentbox', status: 'open', title: 'one' }, { profile: 'default' });
    sup.spawnWorker({ id: 'w-6', product: 'agentbox', status: 'open', title: 'two' }, { profile: second });
    await settle();
    expect(appServerSpawns().map((s) => s.options.env.CODEX_HOME).sort())
      .toEqual([join(homedir(), '.codex'), second].sort());
  });

  // ONE PROCESS PER HOME AND NOT PER WORKER. The whole design of this engine is
  // one shared app-server carrying many threads; keying it by home must not
  // quietly turn it into a process per work item.
  it('does not start a second process for a second worker on the same login', async () => {
    const { sup } = build();
    sup.spawnWorker({ id: 'w-7', product: 'agentbox', status: 'open', title: 'one' }, {});
    sup.spawnWorker({ id: 'w-8', product: 'agentbox', status: 'open', title: 'two' }, {});
    await settle();
    expect(appServerSpawns()).toHaveLength(1);
  });

  // AND THE CAP NOW MEANS SOMETHING. It reads the same list, so a login that is
  // real widens it and a machine with one login is exactly as it was.
  it('widens the Codex cap because it widens what actually runs', () => {
    const second = mkdtempSync(join(tmpdir(), 'second-codex-'));
    dirs.push(second);
    const one = build().sup;
    const two = build({ codexProfiles: ['default', second] }).sup;
    expect(two._capacityFor('codex')).toBe(one._capacityFor('codex') * 2);
  });

  // A blank or missing list is the one login she has, unchanged.
  it.each([['missing', undefined], ['empty', []]])('is one login when the list is %s', (_what, codexProfiles) => {
    expect(build({ codexProfiles }).sup._codexProfiles()).toEqual(['default']);
  });

  // AND EVERY ONE OF THEM GOES WHEN AGENTBOX DOES. An orphaned app-server keeps
  // her workers running under rules no new spawn would produce (2026-08-06),
  // and a shutdown that closed the first home's process and left the second
  // would be that bug reintroduced by the fix for this one.
  it('is closed with the app, not just the first one', async () => {
    const second = mkdtempSync(join(tmpdir(), 'second-codex-'));
    dirs.push(second);
    const { sup } = build({ codexProfiles: ['default', second] });
    sup.spawnWorker({ id: 'w-9', product: 'agentbox', status: 'open', title: 'one' }, { profile: 'default' });
    sup.spawnWorker({ id: 'w-10', product: 'agentbox', status: 'open', title: 'two' }, { profile: second });
    await settle();
    const clients = [...sup._codexServers.values()];
    expect(clients).toHaveLength(2);
    sup._closeCodex('test');
    expect(clients.every((c) => c.client.isClosed())).toBe(true);
  });
});

/* ================== and recovery looks where the run wrote =============== */

describe('finding the rollout of a session that has to be resumed', () => {
  /** A rollout on disk under one home, named the way Codex names them. */
  const plantRollout = (home, sessionId) => {
    const dir = join(home, 'sessions', '2026', '09', '05');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `rollout-2026-09-05T01-02-03-${sessionId}.jsonl`), '{}\n');
    return join(dir, `rollout-2026-09-05T01-02-03-${sessionId}.jsonl`);
  };

  it('looks under the login the session actually ran on', () => {
    const second = mkdtempSync(join(tmpdir(), 'second-codex-'));
    dirs.push(second);
    const { sup } = build({ codexProfiles: ['default', second] });
    const file = plantRollout(second, '11111111-2222-3333-4444-555555555555');
    expect(sup.transcriptFile({ sessionId: '11111111-2222-3333-4444-555555555555', engine: 'codex', profile: second }))
      .toBe(file);
  });

  // THE CASE THAT USED TO PASS AND WAS THE STRANDING. A session that ran on the
  // second login is not under the first, and answering `null` there is what
  // makes `resumeStopped` write the row off.
  it('does not find it under a login it never ran on', () => {
    const second = mkdtempSync(join(tmpdir(), 'second-codex-'));
    dirs.push(second);
    const { sup } = build({ codexHome: mkdtempSync(join(tmpdir(), 'first-codex-')), codexProfiles: ['default', second] });
    plantRollout(second, '11111111-2222-3333-4444-555555555555');
    expect(sup.transcriptFile({ sessionId: '11111111-2222-3333-4444-555555555555', engine: 'codex', profile: 'default' }))
      .toBeNull();
  });

  // A record written before profiles meant anything on this engine says
  // 'default', and 'default' is the home the app has always read.
  it('reads a default record under the home the app itself uses', () => {
    const home = mkdtempSync(join(tmpdir(), 'her-codex-'));
    dirs.push(home);
    const { sup } = build({ codexHome: home });
    const file = plantRollout(home, '99999999-8888-7777-6666-555555555555');
    expect(sup.transcriptFile({ sessionId: '99999999-8888-7777-6666-555555555555', engine: 'codex', profile: 'default' }))
      .toBe(file);
    expect(sup.transcriptFile({ sessionId: '99999999-8888-7777-6666-555555555555', engine: 'codex' })).toBe(file);
  });
});
