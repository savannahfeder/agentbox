// A MAC WITH ONLY CODEX ON IT RUNS EVERY TASK ON CODEX.
//
// The README says the app needs "Claude Code or Codex installed and signed in",
// and until this file the code disagreed with it in three places. Measured on
// the tree at 8f4627d6, 2026-10-01, with a config saying Claude Code was not
// found and a real path to Codex:
//
//   - `_engineFor` answered `claude` for a plain task, because the second
//     engine was only reachable once somebody had written `engineChoice` into
//     zero.config.json by hand. So the spawn went to the installer's path for
//     a Claude Code that is not there, and every task died on ENOENT.
//   - `engineChoices` answered `[claude]`, so the screens offered the one
//     engine the Mac does not have and hid the one it does.
//   - the digest asked for a Claude Code slot and spawned Claude Code.
//
// THE GATE IS NOT WHAT THIS LOOSENS. `engineChoice` exists so a row marked
// `codex` in August does not quietly move to a second engine on a Mac that
// has both (tests/a-codex-row-from-august-still-runs-on-claude.test.mjs). On a
// Mac with one engine there is no choice for that row to be routed by: Codex
// is the only thing that can run it, so Codex runs it. Every Mac where Claude
// Code is found, or where nobody has said either way, is left exactly where it
// was, and the last block below holds that.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      const child = new Emitter();
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.stdin = Object.assign(new Emitter(), { write: (_c, cb) => { cb?.(null); return true; }, end() {} });
      child.kill = () => true;
      return child;
    },
  };
});

vi.mock('../main/account-tooling.mjs', async (importActual) => ({
  ...(await importActual()),
  linkAccountTooling: () => null,
}));

const { Supervisor } = await import('../main/supervisor.mjs');
const { engineFor, availableEngines, homeEngine } = await import('../shared/engines.mjs');

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';

const dirs = [];
function build(opts = {}) {
  const { codexBin = CODEX_BIN, items = [], extra = {} } = opts;
  // Passed as undefined on purpose by one case below, so a default value here
  // would swallow the very thing it tests.
  const claudeFound = 'claudeFound' in opts ? opts.claudeFound : false;
  const dir = mkdtempSync(join(tmpdir(), 'codex-only-'));
  dirs.push(dir);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      claudeFound,
      codexBin,
      maxConcurrentSessions: 3,
      authProfiles: ['default'],
      autonomousProducts: ['shop'],
      ...extra,
    },
    {
      listItems: () => items,
      listProducts: () => [product],
      getProduct: () => product,
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
      listRepeats: () => [],
    },
    '/nonexistent-app',
  );
  return { sup, product };
}

const row = (extra = {}) => ({
  id: 'w-task', product: 'shop', kind: 'task', status: 'open', title: 'Fix the checkout button',
  body: 'The button does nothing.', labels: [], priority: 5, createdAt: 1, updatedAt: 1,
  claim: null, claimExpired: false, ...extra,
});

beforeEach(() => { spawns.length = 0; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('the one rule, on its own', () => {
  it('answers codex for every row when Claude Code is missing and Codex is here', () => {
    const found = { claude: false, codex: true };
    expect(homeEngine(found)).toBe('codex');
    expect(engineFor(row(), { found })).toBe('codex');
    expect(engineFor(row({ engine: 'claude' }), { found })).toBe('codex');
    expect(availableEngines(found).map((e) => e.id)).toEqual(['codex']);
  });

  it('keeps Claude Code when it is here, or when nobody has said', () => {
    for (const found of [{ claude: true, codex: true }, { codex: true }, {}]) {
      expect(homeEngine(found)).toBe('claude');
      expect(engineFor(row(), { found })).toBe('claude');
    }
    expect(availableEngines({ codex: true }).map((e) => e.id)).toEqual(['claude', 'codex']);
  });

  // NEITHER ENGINE: still Claude Code, which is what the closed inbox card asks
  // them to install. An empty list would leave every caller with nothing.
  it('keeps Claude Code when neither is here', () => {
    const found = { claude: false, codex: false };
    expect(homeEngine(found)).toBe('claude');
    expect(availableEngines(found).map((e) => e.id)).toEqual(['claude']);
  });
});

describe('a Mac with Codex and no Claude Code', () => {
  it('starts a plain task on Codex, with no opt-in written anywhere', () => {
    const { sup } = build();
    sup.spawnWorker(row());
    expect(spawns.map((s) => s.bin)).toEqual([CODEX_BIN]);
    expect(spawns[0].args).toEqual(['app-server']);
  });

  it('offers Codex, and only Codex, as the engine', () => {
    const { sup } = build();
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['codex']);
    expect(sup.engineFacts([row()]).workspace).toBe('codex');
    expect(sup._capacityFor('codex')).toBeGreaterThan(0);
    expect(sup._capacityFor('claude')).toBe(0);
  });

  it('runs its digest on Codex', () => {
    const { sup, product } = build();
    sup.spawnDigest(product, { openId: null, since: null, count: 1 });
    expect(spawns.map((s) => s.bin)).toEqual([CODEX_BIN]);
  });

  it('says a saved Claude Code conversation cannot be continued here', () => {
    const { sup } = build();
    expect(sup._engineCanRun('claude')).toBe(false);
    expect(sup._engineCanRun('codex')).toBe(true);
  });

  it('picks up queued work on the tick', async () => {
    const { sup } = build({ items: [row()] });
    await sup.tick();
    expect(spawns.some((s) => s.bin === CODEX_BIN)).toBe(true);
    expect(spawns.filter((s) => s.bin === CLAUDE_BIN).map((s) => s.args)).toEqual([]);
  });

  // THE ROW NAMER WAS THE LAST THING ON THE TICK STILL CALLING CLAUDE CODE. It
  // failed quietly, so rows only went unnamed, which is why nothing caught it.
  // A long dictated title, because a short clean one may already count as a
  // name and then nothing is spawned for it at all.
  const dictated = () => row({ title: 'I tried to check out on my phone and the button does nothing when I tap it.' });

  it('names its rows with Codex, without her Codex config or a saved session', () => {
    const { sup } = build();
    sup.nameTheRows([dictated()]);
    const naming = spawns.find((s) => s.args?.[0] === 'exec');
    expect(naming?.bin).toBe(CODEX_BIN);
    expect(naming.args).toEqual(expect.arrayContaining(['--ephemeral', '--ignore-user-config', 'read-only']));
    expect(naming.args.at(-1)).toContain('the button does nothing');
  });

  it('names rows with Claude Code on a Mac that has it', () => {
    const { sup } = build({ claudeFound: true });
    sup.nameTheRows([dictated()]);
    expect(spawns.map((s) => [s.bin, s.args[0]])).toEqual([[CLAUDE_BIN, '-p']]);
  });
});

// THE LAST CARD OF THE WALK SHUT THE INBOX ON EVERY MAC WITHOUT CLAUDE CODE,
// Codex or not, so a Codex-only Mac never reached its inbox at all.
describe('the inbox opens with either one', () => {
  const here = { found: true, certain: true };
  const gone = { found: false, certain: true };
  const unsure = { found: false, certain: false };

  it('opens with only Codex, and with only Claude Code', async () => {
    const { noCodingAgent } = await import('../renderer/src/onboarding.ts');
    expect(noCodingAgent(gone, here)).toBe(false);
    expect(noCodingAgent(here, gone)).toBe(false);
  });

  it('shuts only when it is sure neither is here', async () => {
    const { noCodingAgent } = await import('../renderer/src/onboarding.ts');
    expect(noCodingAgent(gone, gone)).toBe(true);
    expect(noCodingAgent(gone, unsure)).toBe(false);
    expect(noCodingAgent(unsure, gone)).toBe(false);
  });

  it('names both on the card, never Claude Code alone', async () => {
    const { COPY } = await import('../renderer/src/onboarding.ts');
    expect(COPY.gateHead).toContain('Claude Code or Codex');
    expect(COPY.missing).toContain('Claude Code or Codex');
  });
});

describe('every other Mac is where it was', () => {
  it('runs Claude Code when Claude Code is found, Codex or not', () => {
    const { sup } = build({ claudeFound: true });
    sup.spawnWorker(row());
    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude']);
  });

  it('runs Claude Code when the config never said whether it was found', () => {
    const { sup } = build({ claudeFound: undefined });
    sup.spawnWorker(row());
    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
  });

  it('runs Claude Code when neither engine is found', () => {
    const { sup } = build({ codexBin: null });
    sup.spawnWorker(row());
    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['claude']);
  });
});
