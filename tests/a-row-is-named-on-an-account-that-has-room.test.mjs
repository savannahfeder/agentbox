// A ROW IS NAMED ON AN ACCOUNT THAT HAS ROOM.
//
// What broke, reported 2026-10-07: the list went back to long first sentences
// cut off with an ellipsis where it used to show short written names. "Previously
// the titles were neat and clean and now they look super messy."
//
// How it was measured: the last `label` in the store was written at 04:18 UTC on
// 2026-10-06, and 13 live rows were waiting for one. The app was spawning a
// naming call every 15 seconds and each died in about two seconds. Replaying the
// exact prompt with no CLAUDE_CONFIG_DIR, which is what the app's naming call
// had, gave exit 1 and "You've hit your weekly limit · resets Oct 8 at 12pm";
// the same prompt on the second signed-in account gave "Fix header condensing
// layout" in 4.9s. Agents rotate off an account at its limit; the namer never
// did. It spawned with the app's own environment, so it always billed the
// default account.
//
// And because the namer takes only the most recently touched row and kept no
// memory of a miss, the one failing row was retried every tick and every row
// behind it waited.
//
// WHAT CAN SILENTLY BREAK HERE:
//
//   1. The naming call goes back to inheriting the app's environment, and a
//      default account at its limit stops every row being named again.
//   2. It asks a resting account first, and every name costs a dead call.
//   3. It walks the accounts with no end, and a Mac with every account at its
//      limit spawns a call per account per tick.
//   4. A row that cannot be named is retried every tick, and starves the rest.
//   5. The message sorter, which makes the same kind of call, is left behind.
//   6. Codex is left behind (asked for on this thread: "make sure it works for
//      both codex and claude code"). A Codex-only Mac with two logins names
//      on the one with room, and a Mac offering both engines falls back to
//      the other when every account on its own is at its limit. A Codex
//      nobody opted into is never billed for a name.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each fake call answers by the account it was spawned on: the reply table is
// keyed by CLAUDE_CONFIG_DIR, with 'default' for a Claude spawn that names
// none, and by `codex:` plus CODEX_HOME for a Codex spawn.
const fake = vi.hoisted(() => ({ spawns: [], replies: {} }));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin, args, options) => {
      const account = args[0] === 'exec'
        ? `codex:${options?.env?.CODEX_HOME}`
        : options?.env?.CLAUDE_CONFIG_DIR ?? 'default';
      fake.spawns.push({ bin, args, options, account });
      const child = new Emitter();
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.kill = () => true;
      const [code, out] = fake.replies[account] ?? [1, ''];
      setTimeout(() => {
        if (out) child.stdout.emit('data', Buffer.from(out));
        child.emit('close', code);
      }, 0);
      return child;
    },
  };
});

const { Supervisor } = await import('../main/supervisor.mjs');

const SECOND = '/nonexistent-accounts/second';
const LIMIT = [1, "You've hit your weekly limit · resets Oct 8 at 12pm\n"];

const CODEX_ONE = '/nonexistent-accounts/codex-one';
const CODEX_TWO = '/nonexistent-accounts/codex-two';
// A Mac with Codex and no Claude Code, signed into two Codex logins.
const CODEX_ONLY = { claudeFound: false, codexBin: '/nonexistent/codex', codexHome: CODEX_ONE, codexProfiles: ['default', CODEX_TWO] };
// A Mac with both, where the person has opened the choice of engine.
const BOTH = { codexBin: '/nonexistent/codex', codexHome: CODEX_ONE, engineChoice: '2026-10-01T00:00:00.000Z' };

const dirs = [];
function build({ items = [], extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'name-account-'));
  dirs.push(dir);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const named = [];
  const prioritized = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-discovered-accounts',
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      claudeFound: true,
      maxConcurrentSessions: 3,
      authProfiles: ['default', SECOND],
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
      nameItem: (slug, id, label) => named.push({ id, label }),
      prioritizeItem: (slug, id, value) => prioritized.push({ id, value }),
    },
    '/nonexistent-app',
  );
  return { sup, named, prioritized };
}

// A dictated row: long, ending in an ellipsis, so it wants a name.
const row = (extra = {}) => ({
  id: 'w-dictated', product: 'shop', kind: 'directive', status: 'open',
  title: 'One thing I noticed about the videos is that, when the agent is generating scripts for talking head videos,…',
  body: '', labels: [], priority: 5, createdAt: 1, updatedAt: 10, claim: null, ...extra,
});

beforeEach(() => {
  fake.spawns.length = 0;
  fake.replies = {};
});
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('the account a name is asked on', () => {
  it('names the row on the second account when the first is at its weekly limit', async () => {
    fake.replies = { default: LIMIT, [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build();
    await sup.nameTheRows([row()]);
    expect(named).toEqual([{ id: 'w-dictated', label: 'Talking head script quality' }]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });

  it('asks a resting account last, so a name costs one call', async () => {
    fake.replies = { default: LIMIT, [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build();
    sup._profileCooldown = { default: Date.now() + 60 * 60_000 };
    await sup.nameTheRows([row()]);
    expect(named).toHaveLength(1);
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  it('stays on the first account when it answers', async () => {
    fake.replies = { default: [0, 'Talking head script quality\n'], [SECOND]: [0, 'Wrong account\n'] };
    const { sup, named } = build();
    await sup.nameTheRows([row()]);
    expect(named).toEqual([{ id: 'w-dictated', label: 'Talking head script quality' }]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default']);
  });

  it('asks each account once and writes nothing when every one is at its limit', async () => {
    fake.replies = { default: LIMIT, [SECOND]: LIMIT };
    const { sup, named } = build();
    await sup.nameTheRows([row()]);
    expect(named).toEqual([]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });

  it('never hands the naming call an API key from the app', async () => {
    fake.replies = { default: [0, 'Talking head script quality\n'] };
    const was = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
    try {
      const { sup } = build();
      await sup.nameTheRows([row()]);
    } finally {
      if (was === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = was;
    }
    expect(fake.spawns).toHaveLength(1);
    expect(fake.spawns[0].options.env).toBeDefined();
    expect(fake.spawns[0].options.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe('a row that cannot be named', () => {
  const stuck = row({ id: 'w-stuck', updatedAt: 20, title: 'A screenshot I took on my phone of the page that keeps breaking when…' });
  const older = row({ id: 'w-older', updatedAt: 10 });

  it('steps aside on the next pass, so the row behind it is named', async () => {
    const { sup, named } = build();
    fake.replies = {};                       // every call fails
    await sup.nameTheRows([stuck, older], 1_000_000);
    expect(fake.spawns.every((s) => s.args[1].includes('screenshot I took'))).toBe(true);
    fake.spawns.length = 0;
    fake.replies = { default: [0, 'Older row name\n'] };
    await sup.nameTheRows([stuck, older], 1_000_000 + 15_000);
    expect(named).toEqual([{ id: 'w-older', label: 'Older row name' }]);
  });

  it('is tried again once the wait is over', async () => {
    const { sup, named } = build();
    fake.replies = {};
    await sup.nameTheRows([stuck], 1_000_000);
    fake.spawns.length = 0;
    await sup.nameTheRows([stuck], 1_000_000 + 15_000);
    expect(fake.spawns).toHaveLength(0);       // still waiting
    fake.replies = { default: [0, 'Stuck row name\n'] };
    await sup.nameTheRows([stuck], 1_000_000 + 11 * 60_000);
    expect(named).toEqual([{ id: 'w-stuck', label: 'Stuck row name' }]);
  });
});

describe('on Codex', () => {
  it('names the row on the second Codex login when the first is at its limit', async () => {
    fake.replies = { [`codex:${CODEX_ONE}`]: LIMIT, [`codex:${CODEX_TWO}`]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: CODEX_ONLY });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([{ id: 'w-dictated', label: 'Talking head script quality' }]);
    expect(fake.spawns.map((s) => s.account)).toEqual([`codex:${CODEX_ONE}`, `codex:${CODEX_TWO}`]);
  });

  it('asks a resting Codex login last', async () => {
    fake.replies = { [`codex:${CODEX_ONE}`]: LIMIT, [`codex:${CODEX_TWO}`]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: CODEX_ONLY });
    sup._profileCooldown = { 'codex:default': Date.now() + 60 * 60_000 };
    await sup.nameTheRows([row()]);
    expect(named).toHaveLength(1);
    expect(fake.spawns.map((s) => s.account)).toEqual([`codex:${CODEX_TWO}`]);
  });

  it('never calls a Claude Code that is not on the Mac', async () => {
    fake.replies = {};
    const { sup } = build({ extra: CODEX_ONLY });
    await sup.nameTheRows([row()]);
    expect(fake.spawns.every((s) => s.args[0] === 'exec')).toBe(true);
    expect(fake.spawns).toHaveLength(2);
  });

  it('never hands the Codex call an OpenAI key from the app', async () => {
    fake.replies = { [`codex:${CODEX_ONE}`]: [0, 'Talking head script quality\n'] };
    const was = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
    try {
      const { sup } = build({ extra: CODEX_ONLY });
      await sup.nameTheRows([row()]);
    } finally {
      if (was === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = was;
    }
    expect(fake.spawns).toHaveLength(1);
    expect(fake.spawns[0].options.env.OPENAI_API_KEY).toBeUndefined();
  });
});

describe('a Mac with both', () => {
  it('names on Codex when every Claude account is at its limit', async () => {
    fake.replies = { default: LIMIT, [SECOND]: LIMIT, [`codex:${CODEX_ONE}`]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: BOTH });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([{ id: 'w-dictated', label: 'Talking head script quality' }]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND, `codex:${CODEX_ONE}`]);
  });

  it('does not touch Codex while a Claude account answers', async () => {
    fake.replies = { default: [0, 'Talking head script quality\n'], [`codex:${CODEX_ONE}`]: [0, 'Wrong engine\n'] };
    const { sup } = build({ extra: BOTH });
    await sup.nameTheRows([row()]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default']);
  });

  it('never bills a Codex the person has not opted into', async () => {
    fake.replies = { default: LIMIT, [SECOND]: LIMIT, [`codex:${CODEX_ONE}`]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: { ...BOTH, engineChoice: undefined } });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([]);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });
});

describe('the message sorter', () => {
  it('sorts on the second account when the first is at its weekly limit', async () => {
    fake.replies = { default: LIMIT, [SECOND]: [0, 'high\n'] };
    const { sup } = build();
    const level = await sup._askPriority({ text: 'The site is down for every customer', ts: 1 });
    expect(level).toBe('high');
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });
});

// A PROJECT TIED TO ONE CLAUDE ACCOUNT IS NOT WALKED (PR 13, w-ee4fd31565).
//
// The walk above is what every project gets, and it is exactly wrong for a
// project somebody has tied to one login: the prompt here carries the ROW'S OWN
// TEXT, so walking it puts an employer's row in front of a personal
// subscription, which is the one thing the setting promises will not happen. The
// pin is Claude-only, and the fallback onto Codex is the same leak through a
// second door, so it is shut off as well.
describe('a row in a project tied to one account', () => {
  const TIED = { projectAccounts: { shop: SECOND } };

  it('is named on that account alone, and never on the other one', async () => {
    fake.replies = { default: [0, 'Wrong account\n'], [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: TIED });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([{ id: 'w-dictated', label: 'Talking head script quality' }]);
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  it('keeps its own title rather than borrowing a login, when that account is at its limit', async () => {
    fake.replies = { default: [0, 'Wrong account\n'], [SECOND]: LIMIT };
    const { sup, named } = build({ extra: TIED });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([]);
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  it('is still asked once while that account rests, because there is nowhere else to ask', async () => {
    fake.replies = { [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: TIED });
    sup._profileCooldown = { [SECOND]: Date.now() + 60 * 60_000 };
    await sup.nameTheRows([row()]);
    expect(named).toHaveLength(1);
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  it('does not fall back to Codex on a Mac that offers both', async () => {
    fake.replies = { [SECOND]: LIMIT, [`codex:${CODEX_ONE}`]: [0, 'Wrong engine\n'] };
    const { sup, named } = build({ extra: { ...BOTH, ...TIED } });
    await sup.nameTheRows([row()]);
    expect(named).toEqual([]);
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  // WHAT THE PR DID, AND WHY IT COULD NOT BE TAKEN AS IT STOOD: it built the
  // tied call's environment as `{ ...process.env, CLAUDE_CONFIG_DIR }`, which
  // hands an ANTHROPIC_API_KEY from whatever shell launched the app straight into
  // the call -- and a key silently overrides the subscription the tie just named,
  // so the one call that was meant to be billed carefully was the one call that
  // could be billed to an API account instead.
  it('is handed no API key from the app, tie or no tie', async () => {
    fake.replies = { [SECOND]: [0, 'Talking head script quality\n'] };
    const was = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
    try {
      const { sup } = build({ extra: TIED });
      await sup.nameTheRows([row()]);
    } finally {
      if (was === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = was;
    }
    expect(fake.spawns).toHaveLength(1);
    expect(fake.spawns[0].options.env.CLAUDE_CONFIG_DIR).toBe(SECOND);
    expect(fake.spawns[0].options.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('sorts its messages on that account too, because the message is the prompt', async () => {
    fake.replies = { default: [0, 'low\n'], [SECOND]: [0, 'high\n'] };
    const { sup } = build({ extra: TIED });
    const level = await sup._askPriority({ text: 'The site is down for every customer', ts: 1 }, 'shop');
    expect(level).toBe('high');
    expect(fake.spawns.map((s) => s.account)).toEqual([SECOND]);
  });

  // THE CASE THAT MUST NOT MATCH: a tie naming a login this Mac has not got is
  // ignored, and the walk is exactly the walk at the top of this file. Without
  // this, signing out of the tied account would stop every row in that project
  // being named, with nothing on any screen saying so.
  it('walks every account again once the tied login is gone', async () => {
    fake.replies = { default: LIMIT, [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: { projectAccounts: { shop: '/nonexistent-accounts/removed' } } });
    await sup.nameTheRows([row()]);
    expect(named).toHaveLength(1);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });

  it('leaves a project nobody has tied exactly as it was', async () => {
    fake.replies = { default: LIMIT, [SECOND]: [0, 'Talking head script quality\n'] };
    const { sup, named } = build({ extra: { projectAccounts: { somewhere_else: SECOND } } });
    await sup.nameTheRows([row()]);
    expect(named).toHaveLength(1);
    expect(fake.spawns.map((s) => s.account)).toEqual(['default', SECOND]);
  });
});
