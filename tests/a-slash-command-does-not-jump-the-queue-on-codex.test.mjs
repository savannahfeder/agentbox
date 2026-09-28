// THE CAP IS SKIPPED FOR A COMMAND THAT WILL NEVER RUN AS A COMMAND.
//
// Two lines in main/supervisor.mjs ask whether her reply is one of Claude
// Code's own eight commands, and until now only one of them asked which engine
// the row runs on.
//
//   the QUEUE:  command: continuation && !!commandPrompt(item.answer)
//   the SPAWN:  const command = continuation && engine === DEFAULT_ENGINE
// ? commandPrompt(item.answer) : null;
//
// The spawn's guard is right and its reasoning is written out beside it:
// `/context`, `/compact`, `/usage` and `/mcp` are Claude Code's own words,
// Codex knows none of them, and on that engine the prompt is not argv at all --
// `_spawnCodexWorker` hands `plan.prompt` straight to a turn's `input`, so one
// of the eight would arrive as her message with the brief thrown away.
//
// THE QUEUE'S HAD NO SUCH GUARD, AND THE QUEUE IS WHERE THE PRIVILEGE LIVES. A
// row marked `command` gets two things a task does not:
//
//   it SORTS TO THE FRONT, ahead of the priority she set on everything else;
//   it is WAVED PAST THE CAP entirely, spawning with every slot full, because
//   `_load` does not count it either.
//
// Both of those are paid for by the same argument: a command is 2.8 to 4.8
// seconds of printing a table and spends almost nothing. None of that is true
// of a Codex row whose reply happens to begin `/usage`. It is an ordinary Codex
// turn carrying her text verbatim, it runs for as long as any turn runs, and it
// took a slot on a full fleet from a row that was waiting its turn -- while
// `_loadFor` went on not counting it, so the cap it jumped stayed jumpable for
// the next one.
//
// THE FIX IS THE GUARD THE SPAWN ALREADY HAS, asked in the same words, so the
// two lines cannot answer differently about one row.
//
// THE GATE IS SHUT ON EVERY MAC, so the only honest way to put a Codex row
// through the real queue is to override `_engineFor` on one instance -- the
// same seam tests/a-codex-task-runs-while-her-claude-fleet-is-full.test.mjs
// uses, and for the same reason: it overrides exactly the decision and nothing
// else. The last block asserts the gate on an untouched supervisor.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';
import { commandPrompt } from '../shared/claude-commands.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const CODEX_BIN = '/nonexistent/codex/codex';

const NOW = 1_788_134_429_008; // 2026-08-30 21:20, the row the command rule came from

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

// A card she has answered. The answer is the continuation's whole reason to run.
const answered = (id, answer, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'question', labels: ['founder'],
  priority: 5, answer, createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

let sup; let spawned;

const build = (items, { slots = 3 } = {}) => {
  sup = new Supervisor(
    {
      home: ONE_ACCOUNT_HOME,
      storeRoot: '/nonexistent-zero-root',
      maxConcurrentSessions: slots,
      authProfiles: ['default'],
      codexBin: CODEX_BIN,
      // THE MOMENT SHE OPENED THE GATE, which is the half the override below
      // cannot fake: `_capacityFor` asks it (through `engineChoices`) before it
      // gives Codex a slot, so a harness that opened the gate for routing only
      // would describe a Mac where a Codex row can be chosen and can never run.
      engineChoice: '2026-09-04T00:00:00Z',
    },
    store(items),
    '/nonexistent-app',
  );
  // WHICH ENGINE EACH ROW GOES TO. The moment above makes the second engine
  // runnable; this makes a row marked `codex` really pick it, without giving
  // every fixture a `wrote.engine` newer than the moment.
  sup._engineFor = (item) => (item?.engine === 'codex' ? 'codex' : 'claude');
  spawned = [];
  sup.spawnWorker = (item, { continuation = false } = {}) => {
    const engine = sup._engineFor(item);
    spawned.push(item.id);
    sup.sessions.set(item.id, {
      itemId: item.id,
      product: item.product,
      engine,
      // THE REAL `spawnWorker` PUTS THIS ON THE SESSION so `_load` can leave a
      // command out of the cap, and it derives it exactly this way. A fake that
      // dropped it would have every command occupy a slot and would hide the
      // half of the privilege this file is about.
      command: !!(continuation && engine === DEFAULT_ENGINE && commandPrompt(item.answer)),
    });
  };
  return sup;
};

// Workers already up on other rows, filling one engine's fleet.
const fill = (n, engine) => {
  for (let i = 0; i < n; i += 1) {
    const id = `w-busy-${engine}-${i}`;
    sup.sessions.set(id, { itemId: id, product: 'agentbox', engine, child: { kill() {} } });
  }
};

beforeEach(() => { build([]); });

/* ==================== the cap a codex row must wait for =================== */

describe('a reply beginning with a slash command on a codex row', () => {
  // THE CASE. Every Codex slot full, and a Codex row whose reply is `/usage`.
  // It waited before this line existed; it jumped straight past.
  it('waits for a slot like any other codex turn', async () => {
    build([answered('w-codex-usage', '/usage', { engine: 'codex' })], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // AND IT DOES NOT OUTRANK HER PRIORITIES EITHER. The sort-to-front is the
  // other half of the privilege and is paid for by the same argument.
  it('does not sort ahead of a row she ranked above it', async () => {
    build([
      answered('w-codex-usage', '/usage', { engine: 'codex', priority: 1 }),
      answered('w-claude-real', 'please carry on', { priority: 9 }),
    ], { slots: 1 });
    await sup.tick();
    expect(spawned).toEqual(['w-claude-real', 'w-codex-usage']);
  });

  // AND IT IS A REAL TURN, SO IT COUNTS AGAINST THE CAP ONCE IT IS RUNNING.
  // `_loadFor` skips a session marked `command`, so a Codex row let through as
  // one would leave the cap it jumped jumpable by the next row as well.
  it('occupies a codex slot once it is running', async () => {
    build([answered('w-codex-usage', '/usage', { engine: 'codex' })], { slots: 1 });
    await sup.tick();
    expect(spawned).toEqual(['w-codex-usage']);
    expect(sup._loadFor('codex')).toBe(1);
    expect(sup._hasSlotFor('codex')).toBe(false);
  });
});

/* ============== the claude path, which must not move at all ============== */

describe('the same reply on a claude row', () => {
  it('still starts with every claude slot full', async () => {
    build([answered('w-claude-usage', '/usage')], { slots: 3 });
    fill(3, 'claude');
    await sup.tick();
    expect(spawned).toEqual(['w-claude-usage']);
  });

  // And still goes to the front, ahead of everything she ranked.
  it('still sorts ahead of a row she ranked above it', async () => {
    build([
      answered('w-claude-usage', '/usage', { priority: 1 }),
      answered('w-claude-real', 'please carry on', { priority: 9 }),
    ], { slots: 1 });
    await sup.tick();
    expect(spawned).toEqual(['w-claude-usage', 'w-claude-real']);
  });

  // And still takes no slot, which is the half that lets the row behind it run.
  it('still occupies no claude slot while it runs', async () => {
    build([answered('w-claude-usage', '/usage')], { slots: 1 });
    await sup.tick();
    expect(sup.sessions.get('w-claude-usage')?.command).toBe(true);
    expect(sup._loadFor('claude')).toBe(0);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });
});

/* ============ and an ordinary reply is not a command on either =========== */

describe('an ordinary reply', () => {
  // `commandPrompt` is null for everything that is not exactly one of the
  // eight, and nothing in this slice may widen or narrow that door.
  it('waits for a slot on claude, as it always did', async () => {
    build([answered('w-claude-reply', 'have another look please')], { slots: 3 });
    fill(3, 'claude');
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('waits for a slot on codex too', async () => {
    build([answered('w-codex-reply', 'have another look please', { engine: 'codex' })], { slots: 3 });
    fill(3, 'codex');
    await sup.tick();
    expect(spawned).toEqual([]);
  });
});

/* ====================== and the gate is still shut ======================= */

describe('an untouched supervisor', () => {
  // Nothing above reaches a real Mac: without the override, `_engineFor`
  // answers Claude Code for a row marked codex, so its `/usage` is a Claude
  // Code command again and behaves exactly as it always has.
  it('routes a codex row to claude code, command and all', async () => {
    const s = new Supervisor(
      {
        home: ONE_ACCOUNT_HOME,
        storeRoot: '/nonexistent-zero-root',
        maxConcurrentSessions: 3,
        authProfiles: ['default'],
        codexBin: CODEX_BIN,
      },
      store([answered('w-still-claude', '/usage', { engine: 'codex' })]),
      '/nonexistent-app',
    );
    const seen = [];
    s.spawnWorker = (item) => { seen.push(item.id); };
    for (let i = 0; i < 3; i += 1) {
      s.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'agentbox', engine: 'claude', child: { kill() {} } });
    }
    await s.tick();
    expect(s._engineFor({ engine: 'codex' })).toBe('claude');
    expect(seen).toEqual(['w-still-claude']);
  });
});
