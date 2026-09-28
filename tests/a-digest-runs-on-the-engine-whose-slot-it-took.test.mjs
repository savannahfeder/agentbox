// A DIGEST RUNS ON THE ENGINE WHOSE SLOT IT TOOK.
//
// Both of them declare themselves Claude Code sessions and check a Claude Code
// slot before starting -- `if (!this._hasSlotFor(DEFAULT_ENGINE)) break;`, with
// the comment "A DIGEST IS A CLAUDE CODE SESSION. It carries a synthetic row
// with no engine on it, so `_engineFor` answers the default". The second half
// of that sentence is only true where the workspace default IS the default.
//
// The synthetic rows `spawnDigest` and `spawnDrive` build carry no `engine`
// field, so `spawnWorker` asked `_engineFor` again and got the WORKSPACE
// DEFAULT, which she sets in Settings and which may be Codex. Three separate
// wrongs on such a Mac, and none of them says anything on any screen:
//
//   - a full Claude fleet with idle Codex BLOCKS a digest that would have run,
//     because the check is against Claude and the spawn is not;
//   - an idle Claude with a full Codex advances `lastDigestTry` /
//     `lastDrive` -- the retry watermark, written just before the spawn -- and
//     THEN the spawn is refused for want of a Codex slot, so the product waits
//     out the whole retry interval for a run that never happened;
//   - and with both free, the session that calls itself Claude-only runs on
//     Codex.
//
// SO THE ENGINE IS DECIDED ONCE AND USED TWICE. `spawnWorker` already takes a
// `forcedEngine`, which exists for exactly this shape (a resume knows which
// harness wrote the session and must not let the rule answer again), and the
// digest and the drive know their engine for the same kind of reason: it is a
// property of the session being built, not of a row in her ledger. Both now
// pass `DEFAULT_ENGINE`, which is the same constant the check above them reads,
// so there is one answer and no way for the two to disagree.
//
// THE OLD DRIVE TEST COULD NOT HAVE CAUGHT THIS. It stubs `spawnDrive`
// (tests/a-codex-task-runs-while-her-claude-fleet-is-full.test.mjs, "does not
// let idle codex slots start a fourth claude drive session"), so it verified
// the pre-check and stopped exactly where the defect began. Everything below
// goes through the real `spawnWorker` and asks which BINARY was executed.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NAME, Name } from '../shared/product-name.mjs';

// The one seam: main/supervisor.mjs imports `spawn` at module scope, so this is
// where a test stands between the app's choice of executable and a real
// process. A Codex spawn is left inert on purpose -- if the fix regresses, the
// assertion below names the binary rather than dying inside the transport.
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

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';
const OPENED = '2026-09-04T00:00:00Z';
const NOW = 1_756_000_000_000;

const dirs = [];
/** A Mac with both engines and the WORKSPACE set to the second one, which is
 *  the only machine any of this is about. */
function build({ engine = 'codex', slots = 3, items = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'digest-engine-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', name: Name, dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      codexBin: CODEX_BIN,
      engineChoice: OPENED,
      engine,
      maxConcurrentSessions: slots,
      authProfiles: ['default'],
      autonomousProducts: ['agentbox'],
    },
    {
      listItems: () => items,
      listProducts: () => [product],
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
      listRepeats: () => [],
    },
    '/nonexistent-app',
  );
  return { sup, product };
}

/** Workers already up, filling one engine's fleet on another product, so the
 *  "nothing is running here" gates stay open and the cap is what is left. */
const fill = (sup, n, engine) => {
  for (let i = 0; i < n; i += 1) {
    const id = `w-busy-${engine}-${i}`;
    sup.sessions.set(id, { itemId: id, product: 'other', engine, child: { kill() {} } });
  }
};

beforeEach(() => { spawns.length = 0; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/* ================== which binary the session really runs ================= */

describe('a digest on a Mac whose workspace default is Codex', () => {
  it('runs on Claude Code, which is the engine it checked a slot for', () => {
    const { sup, product } = build();
    sup.spawnDigest(product, { openId: null, since: null, count: 2 });

    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    expect([...sup.sessions.values()][0].engine).toBe('claude');
  });

  // AND IT STILL RUNS WHEN THE OTHER ENGINE IS FULL, which is the watermark
  // half: the tick writes `lastDigestTry` and then calls this, so a spawn
  // refused here costs the product the whole retry interval for a run that
  // never happened.
  it('starts even with every Codex slot taken, because it needs none of them', () => {
    const { sup, product } = build();
    fill(sup, 3, 'codex');
    sup.spawnDigest(product, { openId: null, since: null, count: 1 });

    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
  });

  // THE CASE THAT MUST NOT MATCH: a Claude fleet with no room really does stop
  // it, because that is the subscription it is about to spend.
  it('does not start when the Claude fleet is full', () => {
    const { sup, product } = build();
    fill(sup, 3, 'claude');
    sup.spawnDigest(product, { openId: null, since: null, count: 1 });

    expect(spawns).toEqual([]);
  });
});

/* The drive had three cases of its own here, for the same reason the digest
   does: it declared itself a Claude Code session and had to spawn as one. It is
   deleted (w-d19d6d387c, 2026-09-22). */

/* ============ and the whole tick agrees with itself end to end =========== */

describe('the tick that decides a digest is owed', () => {
  // The check and the spawn, in the same pass, on the machine that used to make
  // them disagree: the digest is owed on a product whose Claude fleet has room,
  // while every Codex slot is taken.
  it('starts the digest it just checked a Claude slot for', async () => {
    const { sup } = build({
      items: [
        { id: 'd-1', product: 'agentbox', kind: 'digest', status: 'done', labels: [],
          priority: 5, createdAt: NOW - 13 * 60 * 60 * 1000, updatedAt: NOW - 13 * 60 * 60 * 1000,
          claim: null, claimExpired: false },
        { id: 'w-news', product: 'agentbox', status: 'done', kind: 'task', labels: [],
          priority: 5, createdAt: NOW - 60 * 60 * 1000, updatedAt: NOW - 60 * 60 * 1000,
          claim: null, claimExpired: false, result: 'shipped it' },
      ],
    });
    fill(sup, 3, 'codex');
    await sup.tick();

    expect(spawns.filter((s) => s.bin === CODEX_BIN)).toEqual([]);
    expect(spawns.some((s) => s.bin === CLAUDE_BIN)).toBe(true);
  });
});

/* ================= and her own Mac is exactly where it was =============== */

describe('the same session where Claude Code is the workspace default', () => {
  it(`is unchanged, which is every Mac that has ever run ${NAME}`, () => {
    const { sup, product } = build({ engine: null });
    sup.spawnDigest(product, { openId: null, since: null, count: 1 });

    expect(spawns.map((s) => s.bin)).toEqual([CLAUDE_BIN]);
  });
});
