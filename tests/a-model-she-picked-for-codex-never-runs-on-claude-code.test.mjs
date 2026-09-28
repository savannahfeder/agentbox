// A MODEL SHE PICKED FOR CODEX NEVER RUNS ON CLAUDE CODE.
//
// THE MIRROR THAT WAS MISSING. `codexModelRefusal` (main/supervisor.mjs, and
// tests/a-model-she-picked-for-codex-is-honoured-or-the-run-says-why.test.mjs)
// stops a CLAUDE alias reaching a CODEX run. Nothing stopped the other
// direction, and the other direction is the one that happens by itself:
// `engineFor` falls back to Claude Code when Codex is not on this Mac -- which
// is correct and stays -- and `spawnPlan` then applied `item.model` without
// ever asking which engine authored it.
//
// MEASURED BY READING THE TWO LINES, 2026-09-05. `spawnPlan` resolved `const
// model = personal ? null: item.model` and handed it to `setModelArg(grants,
// model)`, which is the `--model` flag on a Claude Code command line. So a row
// saying `engine: "codex", model: "gpt-5.6-sol"`, opened on a Mac with no
// Codex, became:
//
// claude -p <brief> --model gpt-5.6-sol
//
// `gpt-5.6-sol` is the slug her own `~/.codex/config.toml` names. Claude Code
// has never heard of it. The run dies on arrival, the fleet reads a spawn that
// died in seconds as a fast exit, and it dies again on every retry.
//
// WHY THE RUN STOPS RATHER THAN DROPPING THE WORD AND CARRYING ON.
//
// There were three answers and only one of them is honest.
//
//   CARRY IT -> a run that cannot start, repeatedly, in silence. That is the
//     bug.
//   DROP IT AND RUN -> the workspace's Claude model instead, which is a
//     substitution she did not pick. `codexModelRefusal` refused exactly this
//     on the other side and gave the reason: a run that goes ahead and SUCCEEDS
//     has no channel to tell her. It has even less of one here -- the byline
//     names no engine on a one-engine Mac by design
//     (tests/one-coding-agent-draws-nothing-new.test.mjs), and
//     `_sayTheChoiceIsOld` is a console.warn. She would never learn.
//   STOP AND SAY SO -> the only outcome she can see.
//
// AND THE LINE IS DRAWN AT THE MODEL, NOT AT THE ENGINE. A row that names Codex
// and NO model still runs here on Claude Code, unchanged and unremarked. That
// fallback is deliberate and documented in shared/engines.mjs: "she may have
// chosen Codex on her laptop and be reading the row on a machine without it,
// and a session that never starts tells her nothing about why". There is no
// word of hers to swallow on such a row, so there is nothing to refuse. The
// model is where the fallback stops being the fallback doing its job and starts
// being the app running her work on something she did not choose.
//
// THE SENTENCE REACHES HER ROW, NOT A LOG. It is written with
// `recordSessionResult(..., { status: 'open' })`, the same channel
// `_sayTheHarnessIsMissing` uses for the interrupted-session path and
// `sayTheRunDied` uses for a dead run: `rowSummary` in
// renderer/src/list-rules.ts shows a result newer than the body, so it lands on
// the inbox row she is already reading. The status does not move, for the
// reason both of those give: the work still wants doing and the fault clears
// the moment she installs Codex or clears the model.
//
// ONCE PER ROW. `_engineFor` is asked by the queue, the cap and the spawn, and
// the queue re-reads every open row every fifteen seconds. A sentence per pass
// is the staleness-banner failure again (CLAUDE.md, 2026-08-12).
//
// AND HER REPLY IS NOT SWALLOWED BY THE REFUSAL. The queue writes the delivery
// mark BEFORE it calls `spawnWorker` (main/supervisor.mjs, the fresh-work
// pass), and that mark is persisted in the supervisor's state. A refusal that
// left it standing would mean her words were recorded as delivered to a worker
// that never existed, which is the exact failure CLAUDE.md is built around. So
// the refusal hands the answer back with `redeliverAnswer`.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      return { stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

vi.mock('../main/account-tooling.mjs', async (importActual) => {
  const actual = await importActual();
  return { ...actual, linkAccountTooling: () => null };
});

import { Supervisor } from '../main/supervisor.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { modelForEngine } from '../shared/engines.mjs';

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const CODEX_BIN = '/nonexistent/codex/codex';
// The moment she opened the gate, and a row written after it. Both fixed, so
// nothing here depends on the day the suite runs.
const OPENED = '2026-09-04T00:00:00Z';
const AFTER = Date.parse('2026-09-04T10:00:00Z');

const dirs = [];

/** A Mac with Claude Code and, unless asked, no Codex at all. */
function build({ codex = false, engine } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cross-engine-model-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const written = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      ...(codex ? { codexBin: CODEX_BIN } : {}),
      ...(engine ? { engine } : {}),
      engineChoice: OPENED,
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
  return sup;
}

/**
 * The row as it comes off her ledger, FOLDED rather than written as a literal.
 * `wrote.engine.ts` is what tells a choice she is making now from an August one,
 * and only the fold produces it -- a literal would test a shape the store never
 * hands over.
 */
const row = ({ engine, model, answer } = {}) => {
  const item = foldWorkItems([
    JSON.parse(JSON.stringify({
      id: 'w-250cd74811',
      ts: AFTER,
      source: 'founder',
      patch: {
        title: 'try the second engine',
        status: 'open',
        ...(engine ? { engine } : {}),
        ...(model ? { model } : {}),
        ...(answer ? { answer } : {}),
      },
    })),
  ]).get('w-250cd74811');
  if (engine) expect(item.engine).toBe(engine);
  if (model) expect(item.model).toBe(model);
  return { ...item, product: 'agentbox' };
};

const claudeArgs = () => spawns.filter((s) => s.bin === CLAUDE_BIN).map((s) => s.args);
const modelFlag = (args) => (args.indexOf('--model') >= 0 ? args[args.indexOf('--model') + 1] : null);

beforeEach(() => { spawns.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ======================== the rule, on its own ========================== */
// A pure rule so the two engines cannot be reasoned about separately, and so
// the spawn path has one place to ask rather than a branch of its own.

describe('a model belongs to the engine the row names', () => {
  it('is not carried onto the other harness', () => {
    expect(modelForEngine({ engine: 'codex', model: 'gpt-5.6-sol' }, 'claude')).toBe(null);
    expect(modelForEngine({ engine: 'claude', model: 'opus' }, 'codex')).toBe(null);
  });

  it('is carried when the row and the run agree', () => {
    expect(modelForEngine({ engine: 'codex', model: 'gpt-5.6-sol' }, 'codex')).toBe('gpt-5.6-sol');
    expect(modelForEngine({ engine: 'claude', model: 'opus' }, 'claude')).toBe('opus');
  });

  // THE CASE THAT MUST NOT MATCH, and it is every row she has ever written. A
  // row that names no engine names no other engine either, so its model rides
  // exactly as it always did.
  it('is carried on a row that names no engine at all', () => {
    expect(modelForEngine({ model: 'opus' }, 'claude')).toBe('opus');
    expect(modelForEngine({ model: 'opus' }, 'codex')).toBe('opus');
    expect(modelForEngine({ engine: 'nonsense', model: 'opus' }, 'claude')).toBe('opus');
  });

  // The boundaries either side of "there is a model": nothing to carry.
  it('answers null when there is no model to carry', () => {
    expect(modelForEngine({ engine: 'codex' }, 'claude')).toBe(null);
    expect(modelForEngine({ engine: 'codex', model: '' }, 'claude')).toBe(null);
    expect(modelForEngine(null, 'claude')).toBe(null);
  });
});

/* =============== the fresh-row path: it stops, and it says so ============ */

describe('a codex row carrying a codex model, on a mac with no codex', () => {
  it('never becomes a claude command line', () => {
    const sup = build();
    sup.spawnWorker(row({ engine: 'codex', model: 'gpt-5.6-sol' }));

    expect(spawns).toEqual([]);
    expect(sup.sessions.size).toBe(0);
  });

  it('says on the row which word, which harness, and both ways out', () => {
    const sup = build();
    sup.spawnWorker(row({ engine: 'codex', model: 'gpt-5.6-sol' }));

    expect(sup.written).toHaveLength(1);
    const [said] = sup.written;
    expect(said.id).toBe('w-250cd74811');
    // The status does not move: the work still wants doing.
    expect(said.patch.status).toBe('open');
    expect(said.patch.result).toContain('gpt-5.6-sol');
    expect(said.patch.result).toContain('Codex');
    expect(said.patch.result).toContain('Claude Code');
  });

  it('says it once, however many times the queue looks at the row', () => {
    const sup = build();
    for (let i = 0; i < 5; i += 1) sup.spawnWorker(row({ engine: 'codex', model: 'gpt-5.6-sol' }));

    expect(sup.written).toHaveLength(1);
    expect(spawns).toEqual([]);
  });

  // AND THE PLAN ITSELF CANNOT BUILD THE COMMAND LINE EITHER. `spawnWorker`
  // refuses before `spawnPlan` is reached, so this is belt and braces on
  // purpose: the one place a model is resolved must not be able to hand a
  // Claude Code command line the other harness's slug, whatever a future caller
  // does about the refusal above it.
  it('cannot be built into a plan even asking spawnPlan directly', () => {
    const sup = build();
    const item = row({ engine: 'codex', model: 'gpt-5.6-sol' });
    const plan = sup.spawnPlan(item, { slug: 'agentbox', dir: '/nonexistent', repoPath: null }, { engine: 'claude' });

    expect(plan.model).toBe(null);
    expect(plan.args).not.toContain('gpt-5.6-sol');
  });

  // Her words are not delivered by a worker that never started. The queue has
  // already written the mark by the time spawnWorker is called, so the refusal
  // has to hand it back or the reply is swallowed for good.
  it('gives her answer its delivery back', () => {
    const sup = build();
    const item = row({ engine: 'codex', model: 'gpt-5.6-sol', answer: 'and check the tests' });
    sup._handledAnswers.add(sup._answerKey(item));
    expect(sup._answerDelivered(item)).toBe(true);

    sup.spawnWorker(item, { continuation: true });

    expect(sup._answerDelivered(item)).toBe(false);
    expect(spawns).toEqual([]);
  });
});

/* ===================== the boundaries either side of it ================== */

describe('what is not refused', () => {
  // THE FALLBACK ITSELF, WHICH IS CORRECT AND STAYS. A row marked for Codex on
  // her laptop, read on a Mac without it, still gets worked.
  it('runs a codex row that names no model, on claude code, saying nothing', () => {
    const sup = build();
    sup.spawnWorker(row({ engine: 'codex' }));

    expect(claudeArgs()).toHaveLength(1);
    expect(modelFlag(claudeArgs()[0])).toBe(null);
    expect(sup.written).toEqual([]);
  });

  // The same row on the Mac that HAS Codex: nothing crosses, so nothing is
  // refused and the model goes where it was always going.
  it('runs a codex row with its codex model on a mac that has codex', () => {
    const sup = build({ codex: true });
    const item = row({ engine: 'codex', model: 'gpt-5.6-sol' });

    expect(sup._engineFor(item)).toBe('codex');
    const plan = sup.spawnPlan(item, { slug: 'agentbox', dir: '/nonexistent', repoPath: null }, { engine: 'codex' });
    expect(plan.model).toBe('gpt-5.6-sol');
  });

  // A personal thread was exempt here: it never took a task's model at all, so
  // there was nothing to refuse. Personal projects are deleted (w-d19d6d387c,
  // 2026-09-22) and every row is measured against its own engine.

  // AND EVERY ROW SHE HAS EVER WRITTEN. A Claude model on a row that names no
  // engine is the ordinary case and it must be byte for byte what it was.
  it('still puts a claude model on the command line for an unmarked row', () => {
    const sup = build();
    sup.spawnWorker(row({ model: 'opus' }));

    expect(claudeArgs()).toHaveLength(1);
    expect(modelFlag(claudeArgs()[0])).toBe('opus');
    expect(sup.written).toEqual([]);
  });

  // And a row that names Claude Code explicitly, with a Claude model on it.
  it('still puts a claude model on the command line for an explicit claude row', () => {
    const sup = build();
    sup.spawnWorker(row({ engine: 'claude', model: 'opus' }));

    expect(claudeArgs()).toHaveLength(1);
    expect(modelFlag(claudeArgs()[0])).toBe('opus');
    expect(sup.written).toEqual([]);
  });
});
